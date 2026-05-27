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
import { GuildMember, TextChannel } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { logger } from '../utils/logger';
import { getQueue, getCurrentTrack, skipTrack } from './queue.service';
import { startScrobble, stopScrobble } from './scrobble.service';
import {
  sendNP, disableNP, clearNP,
  startNpTimer, stopNpTimer,
} from './nowplaying.service';
import { simpleEmbed } from '../utils/embed';

const players = new Map<string, AudioPlayer>();
const ffmpegProcesses = new Map<string, ChildProcess>();

export async function connectToChannel(member: GuildMember): Promise<VoiceConnection | null> {
  const ch = member.voice.channel;
  if (!ch) return null;

  logger.debug(`Joining "${ch.name}"`);
  const conn = joinVoiceChannel({
    channelId: ch.id,
    guildId: ch.guildId,
    adapterCreator: ch.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  conn.on('debug', (m) => logger.debug(`[V] ${m}`));
  conn.on(VoiceConnectionStatus.Connecting, () => logger.debug('[V] connecting'));
  conn.on(VoiceConnectionStatus.Signalling, () => logger.debug('[V] signalling'));
  conn.on(VoiceConnectionStatus.Ready, () => logger.debug('[V] ready'));
  conn.on('error', (e) => logger.error(`[V] ${e.message}`));
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
    logger.error('[V] timeout');
    conn.destroy();
    return null;
  }

  logger.info('Voice connected');
  return conn;
}

export async function playCurrent(guildId: string, channel?: TextChannel) {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur || !q.connection) {
    logger.warn('playCurrent: no track or connection');
    return;
  }

  const url = embyClient.getStreamUrl(cur.track.id, q.seekOffset);
  logger.debug(`Playing: ${cur.track.name} (id=${cur.track.id})`);

  const vol = Math.round(Math.pow(q.volume / 100, 0.6) * 100);
  const args: string[] = [
    '-user_agent', 'VLC/3.0.20',
    '-headers', `X-Emby-Token: ${embyClient.getAccessToken()}\r\n`,
    '-i', url,
    '-loglevel', 'debug',
    '-af', `volume=${vol}/100`,
    '-acodec', 'libopus',
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    'pipe:1',
  ];

  // Wait for old FFmpeg to fully exit before spawning a new one.
  // This ensures the old resource's internal 'end' listener fires
  // while the player is Idle (from player.stop()), not while Playing.
  const oldFf = ffmpegProcesses.get(guildId);
  if (oldFf) {
    ffmpegProcesses.delete(guildId);
    if (oldFf.exitCode === null && oldFf.signalCode === null) {
      oldFf.kill();
      await new Promise<void>(resolve => oldFf.once('exit', () => resolve()));
    }
  }

  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  ffmpegProcesses.set(guildId, ff);

  ff.stdout?.on('error', () => {}); // Prevent ERR_STREAM_PREMATURE_CLOSE crash

  let stderrBuf = '';
  ff.stderr?.on('data', (d: Buffer) => {
    stderrBuf += d.toString();
    if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-1024);
  });

  const res = createAudioResource(ff.stdout, { inlineVolume: false });
  const player = getAudioPlayer(guildId);
  q.connection.audioPlayer = player;
  q.connection.resource = res;
  q.connection.startTime = Date.now();
  q.isPlaying = true;
  q.isPaused = false;

  if (q.connection.connection.state.status === VoiceConnectionStatus.Ready) {
    q.connection.connection.subscribe(player);
  }
  player.play(res);

  embyClient.reportPlaybackStart(cur.track.id, cur.track.id);
  startScrobble(guildId);
  startNpTimer(guildId);

  // Reset FFmpeg error tracking on new track
  q.ffmpegErrorCount = 0;

  if (channel) {
    await sendNP(channel, guildId);
  } else {
    const storedChannel = await resolveStoredChannel(guildId);
    if (storedChannel) await sendNP(storedChannel, guildId);
  }

  ff.on('error', (e) => logger.error(`FF: ${e.message}`));
  ff.on('exit', (code) => {
    q.lastFfExitCode = code;
    if (code !== 0 && code !== null) {
      logger.warn(`FF stderr: ${stderrBuf.slice(0, 512)}`);
      q.ffmpegErrorCount++;
      logger.warn(`FF exited ${code} (error #${q.ffmpegErrorCount})`);
      if (q.ffmpegErrorCount >= 3) {
        logger.error('Too many FFmpeg errors, stopping playback');
        stopAndClear(guildId);
      }
    }
    ffmpegProcesses.delete(guildId);
  });
}

async function resolveStoredChannel(guildId: string): Promise<TextChannel | null> {
  const q = getQueue(guildId);
  if (!q.npChannelId) return null;
  const { discordClient } = await import('../client/discord.client');
  return discordClient.channels.cache.get(q.npChannelId) as TextChannel || null;
}

export async function playTracks(
  guildId: string,
  tracks: import('../models/types').Track[],
  requestedBy: string,
  channel: TextChannel,
) {
  const q = getQueue(guildId);
  const wasEmpty = q.items.length === 0;

  for (const t of tracks) {
    q.items.push({ track: t, requestedBy });
  }

  if (wasEmpty) {
    q.currentIndex = 0;
    q.seekOffset = 0;
    await playCurrent(guildId, channel);
  } else {
    const msg = await channel.send({
      embeds: [simpleEmbed(`Added **${tracks.length}** track${tracks.length > 1 ? 's' : ''}`, 0x57F287)],
    }).catch(() => null);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 15_000);
  }
}

function getAudioPlayer(guildId: string): AudioPlayer {
  if (!players.has(guildId)) {
    const p = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    players.set(guildId, p);

    p.on(AudioPlayerStatus.Idle, async () => {
      const q = getQueue(guildId);

      // Guard: user pressed skip/prev button (handles skipTrack itself).
      // The button handler's playCurrent will re-start after oldFf.kill await completes.
      if (q.skipGuard) {
        q.skipGuard = false;
        return;
      }

      // If FFmpeg errored, skip to next track (don't retry same)
      const isError = q.lastFfExitCode !== null && q.lastFfExitCode !== 0;
      if (isError) {
        logger.debug(`FFmpeg error (${q.lastFfExitCode}), skipping to next track`);
        q.lastFfExitCode = null;
        const next = skipTrack(guildId);
        if (next) {
          q.seekOffset = 0;
          await disableNP(guildId);
          await playCurrent(guildId);
        } else {
          q.isPlaying = false;
          q.isPaused = false;
          q.items = [];
          q.currentIndex = -1;
          stopScrobble(guildId);
          stopNpTimer(guildId);
          await clearNP(guildId);
        }
        return;
      }

      if (q.loopMode === 'one') {
        q.seekOffset = 0;
        await disableNP(guildId);
        await playCurrent(guildId);
        return;
      }

      const next = skipTrack(guildId);
      if (next) {
        q.seekOffset = 0;
        await disableNP(guildId);
        await playCurrent(guildId);
      } else {
        q.isPlaying = false;
        q.isPaused = false;
        q.items = [];
        q.currentIndex = -1;
        stopScrobble(guildId);
        stopNpTimer(guildId);
        await clearNP(guildId);
      }
    });

    p.on('error', (e) => {
      logger.error(`AP: ${e.message}`);
      const qq = getQueue(guildId);
      if (!qq.skipGuard) {
        qq.seekOffset = 0;
        const next = skipTrack(guildId);
        if (next) playCurrent(guildId);
      }
    });
  }
  return players.get(guildId)!;
}

export function setVolume(guildId: string, vol: number) {
  getQueue(guildId).volume = Math.max(0, Math.min(150, vol));
}

export async function stopAndClear(guildId: string) {
  const q = getQueue(guildId);
  // Clear queue FIRST, then stop player
  q.items = [];
  q.currentIndex = -1;
  q.isPlaying = false;
  q.isPaused = false;
  q.seekOffset = 0;
  stopScrobble(guildId);
  stopNpTimer(guildId);
  if (q.connection?.audioPlayer) {
    q.connection.audioPlayer.stop(true);
  }
  const ff = ffmpegProcesses.get(guildId);
  if (ff) { ff.kill(); ffmpegProcesses.delete(guildId); }
  await clearNP(guildId);
}

export async function disconnect(guildId: string) {
  await stopAndClear(guildId);
  const q = getQueue(guildId);
  if (q.connection?.connection) q.connection.connection.destroy();
  const p = players.get(guildId);
  if (p) { p.stop(true); players.delete(guildId); }
  q.npMessageId = null;
  q.npChannelId = null;
}
