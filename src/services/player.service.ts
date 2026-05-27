import {
  entersState,
  VoiceConnection,
  VoiceConnectionStatus,
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { GuildMember, TextChannel } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { logger } from '../utils/logger';
import { getQueue, getCurrentTrack, skipTrack } from './queue.service';
import { startScrobble, stopScrobble } from './scrobble.service';
import { config } from '../config';
import { nowPlayingEmbed } from '../utils/embed';

const players = new Map<string, AudioPlayer>();

function getAudioPlayer(guildId: string): AudioPlayer {
  if (!players.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    players.set(guildId, player);

    player.on(AudioPlayerStatus.Idle, async () => {
      const queue = getQueue(guildId);
      if (queue.loopMode === 'one') {
        playCurrent(guildId);
        return;
      }
      const next = skipTrack(guildId);
      if (next) {
        playCurrent(guildId);
      } else {
        queue.isPlaying = false;
        queue.isPaused = false;
        stopScrobble(guildId);
        logger.debug(`Playback ended for guild ${guildId}`);
      }
    });

    player.on('error', (err) => {
      logger.error(`Audio player error for guild ${guildId}:`, err.message);
      const next = skipTrack(guildId);
      if (next) playCurrent(guildId);
    });
  }
  return players.get(guildId)!;
}

export async function connectToChannel(member: GuildMember): Promise<VoiceConnection | null> {
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    logger.warn('connectToChannel: member not in a voice channel');
    return null;
  }

  logger.debug(`connectToChannel: attempting to join channel "${voiceChannel.name}" (${voiceChannel.id})`);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  connection.on('debug', (msg) => logger.debug(`[Voice] ${msg}`));
  connection.on(VoiceConnectionStatus.Connecting, () => logger.debug('[Voice] Connecting...'));
  connection.on(VoiceConnectionStatus.Signalling, () => logger.debug('[Voice] Signalling...'));
  connection.on(VoiceConnectionStatus.Ready, () => logger.debug('[Voice] Ready!'));
  connection.on('error', (err) => logger.error(`[Voice] Error: ${err.message}`));

  connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
    logger.debug(`[Voice] Disconnected: ${oldState.status} -> ${newState.status}`);
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (connection.state.status === VoiceConnectionStatus.Disconnected) {
        logger.debug('[Voice] Destroying stale connection');
        connection.destroy();
      }
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch (err) {
    logger.error(`[Voice] Failed to ready within 30s (state: ${connection.state.status})`);
    connection.destroy();
    return null;
  }

  logger.info(`Connected to voice channel "${voiceChannel.name}"`);
  return connection;
}

export async function playCurrent(guildId: string, textChannel?: TextChannel): Promise<void> {
  const queue = getQueue(guildId);
  const current = getCurrentTrack(guildId);
  if (!current || !queue.connection) {
    logger.warn(`playCurrent: no current track or connection for guild ${guildId}`);
    return;
  }

  const streamUrl = embyClient.getStreamUrl(current.track.id);
  logger.debug(`Playing: ${current.track.name} (id=${current.track.id})`);

  const volumeFilter = `volume=${Math.round(Math.pow(queue.volume / 100, 0.6) * 100)}/100`;

  const ffmpegArgs = [
    '-headers', `X-Emby-Token: ${embyClient.getAccessToken()}`,
    '-i', streamUrl,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-af', volumeFilter,
    '-acodec', 'libopus',
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    '-application', 'audio',
    'pipe:1',
  ];

  logger.debug(`FFmpeg: ffmpeg ${ffmpegArgs.join(' ')}`);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

  const resource = createAudioResource(ffmpeg.stdout, {
    inlineVolume: false,
  });

  const player = getAudioPlayer(guildId);
  queue.connection.audioPlayer = player;

  if (queue.connection.connection.state.status === VoiceConnectionStatus.Ready) {
    queue.connection.connection.subscribe(player);
  }

  player.play(resource);

  queue.connection.resource = resource;
  queue.connection.startTime = Date.now();
  queue.isPlaying = true;
  queue.isPaused = false;

  embyClient.reportPlaybackStart(current.track.id, current.track.id);
  startScrobble(guildId);

  if (textChannel) {
    const embed = nowPlayingEmbed(current.track, 0, queue.volume, current.requestedBy);
    textChannel.send({ embeds: [embed] }).catch(() => {});
  }

  ffmpeg.on('error', (err) => {
    logger.error(`FFmpeg error: ${err.message}`);
    if (textChannel) {
      textChannel.send({ embeds: [new (require('discord.js').EmbedBuilder)().setColor(0xED4245).setDescription('❌ Error playing audio')] }).catch(() => {});
    }
  });

  ffmpeg.on('exit', (code) => {
    if (code !== 0) logger.warn(`FFmpeg exited with code ${code}`);
  });

  ffmpeg.stderr.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) logger.debug(`FFmpeg: ${msg.slice(0, 200)}`);
  });

  ffmpeg.stdin.on('error', () => {});
}

export async function playTracks(
  guildId: string,
  tracks: import('../models/types').Track[],
  requestedBy: string,
  textChannel: TextChannel,
): Promise<void> {
  const queue = getQueue(guildId);
  const wasEmpty = queue.items.length === 0;
  const position = queue.items.length;

  for (const track of tracks) {
    addTrackToQueue(guildId, track, requestedBy);
  }

  if (wasEmpty) {
    skipTrack(guildId);
    await playCurrent(guildId, textChannel);
  } else {
    const count = tracks.length;
    textChannel.send({
      embeds: [new (require('discord.js').EmbedBuilder)()
        .setColor(0x57F287)
        .setDescription(`✅ Added **${count}** track${count > 1 ? 's' : ''} to the queue (position #${position + 1})`)],
    }).catch(() => {});
  }
}

function addTrackToQueue(guildId: string, track: import('../models/types').Track, requestedBy: string): void {
  const queue = getQueue(guildId);
  queue.items.push({ track, requestedBy });
}

export function setVolume(guildId: string, volume: number): void {
  const queue = getQueue(guildId);
  queue.volume = Math.max(0, Math.min(150, volume));
}

export function disconnect(guildId: string): void {
  const queue = getQueue(guildId);
  if (queue.connection?.connection) {
    stopScrobble(guildId);
    queue.connection.connection.destroy();
  }
  const player = players.get(guildId);
  if (player) {
    player.stop(true);
    players.delete(guildId);
  }
  const { removeQueue } = require('./queue.service');
  removeQueue(guildId);
}
