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
import { spawn, ChildProcess } from 'child_process';
import { GuildMember, TextChannel, Message } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { logger } from '../utils/logger';
import { getQueue, getCurrentTrack, skipTrack } from './queue.service';
import { startScrobble, stopScrobble } from './scrobble.service';
import { nowPlayingEmbed, getPlaybackButtons, simpleEmbed } from '../utils/embed';

const players = new Map<string, AudioPlayer>();
const ffmpegProcesses = new Map<string, ChildProcess>();

async function sendOrUpdateNp(guildId: string, channel?: TextChannel) {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur) return;

  let pos = q.seekOffset;
  if (q.connection?.startTime && !q.isPaused) {
    pos += Math.floor((Date.now() - q.connection.startTime) / 1000);
  }
  pos = Math.min(pos, cur.track.duration);

  const embed = nowPlayingEmbed(cur.track, pos, q.volume, cur.requestedBy);
  const rows = getPlaybackButtons(q.isPaused, q.loopMode, false);

  const npMsgId = q.npMessageId;
  const npChId = q.npChannelId;

  if (npMsgId && npChId) {
    const client = (await import('../client/discord.client')).discordClient;
    const ch = client.channels.cache.get(npChId) as TextChannel | undefined;
    if (ch) {
      const msg = await ch.messages.fetch(npMsgId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: rows }).catch(() => {});
        return;
      }
    }
  }

  if (channel) {
    const msg = await channel.send({ embeds: [embed], components: rows }).catch((e: any) => {
      logger.error(`Failed to send NP embed: ${e.message}`);
      return null;
    });
    if (msg) {
      q.npMessageId = msg.id;
      q.npChannelId = msg.channelId;
    }
  }
}

export function stopNpTimer(guildId: string) {
  const q = getQueue(guildId);
  if (q.npTimer) { clearInterval(q.npTimer); q.npTimer = null; }
}

function startNpTimer(guildId: string) {
  stopNpTimer(guildId);
  const q = getQueue(guildId);
  q.npTimer = setInterval(() => sendOrUpdateNp(guildId), 10_000);
}

export async function updateNowPlayingEmbed(guildId: string) {
  await sendOrUpdateNp(guildId);
}

export async function connectToChannel(member: GuildMember): Promise<VoiceConnection | null> {
  const ch = member.voice.channel;
  if (!ch) return null;

  logger.debug(`Joining voice channel "${ch.name}"`);
  const conn = joinVoiceChannel({
    channelId: ch.id,
    guildId: ch.guildId,
    adapterCreator: ch.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  conn.on('debug', (m) => logger.debug(`[Voice] ${m}`));
  conn.on(VoiceConnectionStatus.Connecting, () => logger.debug('[Voice] connecting'));
  conn.on(VoiceConnectionStatus.Signalling, () => logger.debug('[Voice] signalling'));
  conn.on(VoiceConnectionStatus.Ready, () => logger.debug('[Voice] ready'));
  conn.on('error', (e) => logger.error(`[Voice] ${e.message}`));
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (conn.state.status === VoiceConnectionStatus.Disconnected) conn.destroy();
    }
  });

  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    logger.error('[Voice] timeout connecting');
    conn.destroy();
    return null;
  }

  logger.info('Connected to voice');
  return conn;
}

export async function playCurrent(guildId: string, textChannel?: TextChannel) {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur || !q.connection) { logger.warn('playCurrent: no track or connection'); return; }

  const url = embyClient.getStreamUrl(cur.track.id);
  logger.debug(`Playing: ${cur.track.name} (id=${cur.track.id})`);

  const vol = Math.round(Math.pow(q.volume / 100, 0.6) * 100);
  const args: string[] = [
    '-headers', `X-Emby-Token: ${embyClient.getAccessToken()}`,
  ];
  if (q.seekOffset > 0) args.push('-ss', String(q.seekOffset));
  args.push(
    '-i', url,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-af', `volume=${vol}/100`,
    '-acodec', 'libopus',
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    'pipe:1',
  );

  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  ffmpegProcesses.set(guildId, ff);

  const res = createAudioResource(ff.stdout, { inlineVolume: false });
  const player = getAudioPlayer(guildId);
  q.connection.audioPlayer = player;
  q.connection.resource = res;
  q.connection.startTime = Date.now();
  q.isPlaying = true;
  q.isPaused = false;
  q.connection.connection.subscribe(player);
  player.play(res);

  embyClient.reportPlaybackStart(cur.track.id, cur.track.id);
  startScrobble(guildId);
  startNpTimer(guildId);

  if (textChannel) await sendOrUpdateNp(guildId, textChannel);

  ff.on('error', (e) => logger.error(`FFmpeg: ${e.message}`));
  ff.on('exit', (code) => {
    if (code !== 0 && code !== null) logger.debug(`FFmpeg exited (${code})`);
    ffmpegProcesses.delete(guildId);
  });
  ff.stderr.on('data', (d: Buffer) => {
    const m = d.toString().trim();
    if (m) logger.debug(`FFmpeg: ${m.slice(0, 150)}`);
  });
  ff.stdin.on('error', () => {});
}

export async function playTracks(
  guildId: string,
  tracks: import('../models/types').Track[],
  requestedBy: string,
  channel: TextChannel,
) {
  const q = getQueue(guildId);
  const wasEmpty = q.items.length === 0;
  const pos = q.items.length;

  for (const t of tracks) {
    q.items.push({ track: t, requestedBy });
  }

  if (wasEmpty) {
    q.currentIndex = 0;
    await playCurrent(guildId, channel);
  } else {
    const msg = await channel.send({ embeds: [simpleEmbed(`Added **${tracks.length}** track${tracks.length > 1 ? 's' : ''} (#${pos + 1})`, 0x57F287)] }).catch(() => null);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 15_000);
  }
}

function getAudioPlayer(guildId: string): AudioPlayer {
  if (!players.has(guildId)) {
    const p = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    players.set(guildId, p);

    p.on(AudioPlayerStatus.Idle, async () => {
      const q = getQueue(guildId);
      if (q.loopMode === 'one') { await playCurrent(guildId); return; }
      const next = skipTrack(guildId);
      if (next) {
        await playCurrent(guildId);
      } else {
        q.isPlaying = false;
        q.isPaused = false;
        stopScrobble(guildId);
        stopNpTimer(guildId);
        // Update existing NP message to show stopped state
        const cur = getCurrentTrack(guildId);
        if (!cur && q.npMessageId && q.npChannelId) {
          const client = (await import('../client/discord.client')).discordClient;
          const ch = client.channels.cache.get(q.npChannelId) as TextChannel | undefined;
          if (ch) {
            const msg = await ch.messages.fetch(q.npMessageId).catch(() => null);
            if (msg) await msg.edit({ components: [] }).catch(() => {});
          }
        }
      }
    });

    p.on('error', (e) => {
      logger.error(`AudioPlayer: ${e.message}`);
      const q = getQueue(guildId);
      const next = skipTrack(guildId);
      if (next) playCurrent(guildId);
    });
  }
  return players.get(guildId)!;
}

export function setVolume(guildId: string, vol: number) {
  getQueue(guildId).volume = Math.max(0, Math.min(150, vol));
}

export function disconnect(guildId: string) {
  const q = getQueue(guildId);
  if (q.connection?.connection) {
    stopScrobble(guildId);
    stopNpTimer(guildId);
    q.connection.connection.destroy();
  }
  const ff = ffmpegProcesses.get(guildId);
  if (ff) { ff.kill(); ffmpegProcesses.delete(guildId); }
  const p = players.get(guildId);
  if (p) { p.stop(true); players.delete(guildId); }
  q.npMessageId = null;
  q.npChannelId = null;
  const { removeQueue } = require('./queue.service');
  removeQueue(guildId);
}
