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
import { getQueue, getCurrentTrack, skipTrack, removeQueue } from './queue.service';
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

export async function playCurrent(guildId: string, channel?: TextChannel, sendNp = true) {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur || !q.connection) {
    logger.warn('playCurrent: no track or connection');
    return;
  }

  // Play guard: prevent reentrant playCurrent calls
  if (q.playGuard) {
    logger.debug('playCurrent: playGuard active, skipping');
    return;
  }
  q.playGuard = true;
  try {
    // Set playingStartTime to now (instead of 0) so calcPosition doesn't fall
    // into the falsy branch and get stuck at seekOffset without progressing.
    // The Playing event will later overwrite this with the exact timestamp,
    // correcting any small drift incurred during the FFmpeg buffering gap.
    q.connection!.playingStartTime = Date.now();
    q.lastFfExitCode = null;
    q.ffmpegErrorCount = 0;

    stopNpTimer(guildId);

    q.processingEnd = false;

    const url = embyClient.getStreamUrl(cur.track.id, q.seekOffset);
    logger.debug(`Playing: ${cur.track.name} (id=${cur.track.id})`);

    const vol = Math.round(Math.pow(q.volume / 100, 0.6) * 100);
    const args: string[] = [
      '-user_agent', 'VLC/3.0.20',
      '-headers', `X-Emby-Token: ${embyClient.getAccessToken()}\r\n`,
    ];
    if (q.seekOffset > 0) {
      args.push('-ss', String(q.seekOffset));
    }
    args.push('-i', url);
    args.push(
      '-loglevel', 'warning',
      '-af', `volume=${vol}/100`,
      '-acodec', 'libopus',
      '-application', 'audio',
      '-f', 'opus',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
      'pipe:1',
    );

    // Kill old FFmpeg and immediately remove from map so its exit handler
    // can't mutate shared state (the guard below checks map ownership).
    // Do NOT await exit — spawn the new FFmpeg and play immediately so the
    // AudioPlayer is already on the new resource when the old one's Idle
    // event fires (prevents zombie Idle from overriding the new track).
    const oldFf = ffmpegProcesses.get(guildId);
    if (oldFf) {
      ffmpegProcesses.delete(guildId);
      if (oldFf.exitCode === null && oldFf.signalCode === null) {
        oldFf.kill();
      }
    }

    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    ffmpegProcesses.set(guildId, ff);

    ff.stdout?.on('error', () => {});

    let stderrBuf = '';
    ff.stderr?.on('data', (d: Buffer) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-1024);
    });

    const res = createAudioResource(ff.stdout, { inlineVolume: false });
    const player = getAudioPlayer(guildId);
    q.connection.audioPlayer = player;
    q.connection.resource = res;
    q.isPlaying = true;
    q.isPaused = false;

    if (q.connection.connection.state.status === VoiceConnectionStatus.Ready) {
      q.connection.connection.subscribe(player);
    }

    // Register Playing listener and play BEFORE resetting guards. This way
    // the player has already transitioned to the new resource before
    // processingEnd becomes false, preventing a zombie Idle from the old
    // resource from entering the handler and advancing the queue.
    player.removeAllListeners('playing');

    let timersStarted = false;
    player.on(AudioPlayerStatus.Playing, () => {
      if (timersStarted) return;
      timersStarted = true;
      q.connection!.playingStartTime = Date.now();
      startNpTimer(guildId);
      setTimeout(() => startScrobble(guildId), 3_000);
    });

    player.play(res);

    // Guards safe to reset now — player is on the new resource.
    q.skipGuard = false;
    q.processingEnd = false;
    q.playerGeneration++;

    // Old FFmpeg was already killed and removed from the map — its exit
    // handler has a guard that prevents state corruption. No need to await,
    // that would block the interaction response for up to 15 seconds.

    // Only send a fresh NP message when the caller requests it (track changes:
    // next/prev/natural-end). Seek operations (rewind/forward/seekbar) set
    // sendNp=false and let the button handler's updateNP edit the existing
    // message in-place, avoiding duplicate NP messages for the same track.
    if (sendNp) {
      if (channel) {
        await sendNP(channel, guildId);
      } else {
        const storedChannel = await resolveStoredChannel(guildId);
        if (storedChannel) await sendNP(storedChannel, guildId);
      }
    }

    ff.on('error', (e) => logger.error(`FF: ${e.message}`));
    ff.on('exit', (code) => {
      // Guard: only modify shared state if this process is still the
      // current one. Old exit handlers from killed processes are ignored.
      if (ffmpegProcesses.get(guildId) !== ff) return;
      ffmpegProcesses.delete(guildId);

      q.lastFfExitCode = code;
      if (code !== 0 && code !== null) {
        if (q.skipGuard) {
          logger.debug(`FF killed (exit ${code}) — expected during skip`);
        } else {
          if (stderrBuf.length > 1900) {
            for (let i = 0; i < stderrBuf.length; i += 1500) {
              logger.warn(`FF stderr[${i}]: ${stderrBuf.slice(i, i + 1500)}`);
            }
          } else {
            logger.warn(`FF stderr: ${stderrBuf}`);
          }
          q.ffmpegErrorCount++;
          logger.warn(`FF exited ${code} (error #${q.ffmpegErrorCount})`);
          if (q.ffmpegErrorCount >= 3) {
            logger.error('Too many FFmpeg errors, stopping playback');
            stopAndClear(guildId);
          }
        }
      }
    });
  } finally {
    q.playGuard = false;
  }
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
  const playerStopped = q.connection?.audioPlayer?.state?.status !== AudioPlayerStatus.Playing;

  logger.debug(`playTracks: items=${q.items.length}, wasEmpty=${wasEmpty}, isPlaying=${q.isPlaying}, currentIndex=${q.currentIndex}, playerStopped=${playerStopped}`);

  for (const t of tracks) {
    q.items.push({ track: t, requestedBy });
  }

  if (wasEmpty || playerStopped) {
    // Start playing the first newly-added track
    q.currentIndex = q.items.length - tracks.length;
    q.seekOffset = 0;
    q.isPlaying = true;
    q.isPaused = false;
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
      try {
        const q = getQueue(guildId);

        // Player generation guard: discard events from a previous player's zombie
        // listeners. Each playCurrent increments playerGeneration.
        if (q.playerGeneration === 0) return;
        const expectedGen = q.playerGeneration;

        // Reentry guard: prevents this handler from running twice for the same
        // natural track end (zombie listener + real Idle).
        if (q.processingEnd) return;
        q.processingEnd = true;

        // Stale event guard: if playerGeneration changed while this Idle event
        // was queued (e.g. a new playCurrent started), the event is from a
        // previous track and should be ignored.
        if (q.playerGeneration !== expectedGen) {
          q.processingEnd = false;
          return;
        }

        // Guard: user pressed skip/prev button (handles skipTrack itself).
        if (q.skipGuard) {
          q.skipGuard = false;
          q.processingEnd = false;
          return;
        }

        // Guard: connection disappeared (voice channel disconnect).
        if (!q.connection) {
          q.isPlaying = false;
          q.isPaused = false;
          q.items = [];
          q.currentIndex = -1;
          stopScrobble(guildId);
          stopNpTimer(guildId);
          await clearNP(guildId);
          q.processingEnd = false;
          return;
        }

        const isError = q.lastFfExitCode !== null && q.lastFfExitCode !== 0;
        if (isError) {
          logger.debug(`FFmpeg error (${q.lastFfExitCode}), skipping to next track`);
          q.lastFfExitCode = null;
          q.connection.playingStartTime = 0;
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
          q.processingEnd = false;
          return;
        }

        if (q.loopMode === 'one') {
          q.seekOffset = 0;
          q.connection.playingStartTime = 0;
          await disableNP(guildId);
          await playCurrent(guildId);
          q.processingEnd = false;
          return;
        }

        const next = skipTrack(guildId);
        if (next) {
          q.seekOffset = 0;
          q.connection.playingStartTime = 0;
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
        q.processingEnd = false;
      } catch (e) {
        logger.error(`Idle handler error: ${(e as Error).message}`);
        // Ensure processingEnd is reset so the next Idle event can proceed.
        try { getQueue(guildId).processingEnd = false; } catch {}
      }
    });

    p.on('error', (e: Error) => {
      logger.error(`AP: ${e.message}`);
      const qq = getQueue(guildId);
      if (qq.processingEnd) return;
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
  q.items = [];
  q.currentIndex = -1;
  q.isPlaying = false;
  q.isPaused = false;
  q.seekOffset = 0;
  q.playerGeneration = 0;
  q.playGuard = false;
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
  removeQueue(guildId);
}

export async function reconnectVoiceChannel(member: GuildMember): Promise<VoiceConnection | null> {
  const ch = member.voice.channel;
  if (!ch) return null;

  const existing = getQueue(member.guild.id).connection?.connection;
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      await entersState(existing, VoiceConnectionStatus.Ready, 5_000);
      return existing;
    } catch {
      existing.destroy();
    }
  }

  return connectToChannel(member);
}
