import { embyClient } from '../client/emby.client';
import { getQueue, getCurrentTrack } from './queue.service';
import { logger } from '../utils/logger';

export function startScrobble(guildId: string): void {
  const queue = getQueue(guildId);
  if (queue.scrobbleInterval) {
    clearInterval(queue.scrobbleInterval);
  }

  queue.scrobbleInterval = setInterval(async () => {
    try {
      const current = getCurrentTrack(guildId);
      const conn = queue.connection;
      if (!current || !conn) return;

      if (conn.resource?.playbackDuration === undefined) return;

      const positionSec = conn.audioPlayer.state.status === 'playing' && conn.playingStartTime
        ? (Date.now() - conn.playingStartTime) / 1000
        : 0;

      const positionTicks = Math.floor(positionSec * 10_000_000);

      await embyClient.reportPlaybackProgress(
        current.track.id,
        current.track.id,
        positionTicks,
        queue.isPaused,
      );
    } catch { }
  }, 5000);

  logger.debug(`Started scrobbling for guild ${guildId}`);
}

export function stopScrobble(guildId: string): void {
  const queue = getQueue(guildId);
  if (queue.scrobbleInterval) {
    clearInterval(queue.scrobbleInterval);
    queue.scrobbleInterval = null;
  }
}
