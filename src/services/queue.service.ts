import { QueueState, QueueItem, Track } from '../models/types';

const queues = new Map<string, QueueState>();

export function getQueue(guildId: string): QueueState {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      items: [],
      currentIndex: -1,
      connection: null,
      isPlaying: false,
      isPaused: false,
      volume: 50,
      loopMode: 'none',
      scrobbleInterval: null,
      npChannelId: null,
      npMessageId: null,
      npTimer: null,
      seekOffset: 0,
      lastFfExitCode: null,
      ffmpegErrorCount: 0,
      skipGuard: false,
      processingEnd: false,
      playerGeneration: 0,
    });
  }
  return queues.get(guildId)!;
}

export function removeQueue(guildId: string): void {
  const queue = queues.get(guildId);
  if (queue?.scrobbleInterval) {
    clearInterval(queue.scrobbleInterval);
  }
  queues.delete(guildId);
}

export function addTrack(guildId: string, track: Track, requestedBy: string): number {
  const queue = getQueue(guildId);
  queue.items.push({ track, requestedBy });
  return queue.items.length - 1;
}

export function addTrackNext(guildId: string, track: Track, requestedBy: string): number {
  const queue = getQueue(guildId);
  const insertAt = queue.currentIndex + 1;
  queue.items.splice(insertAt, 0, { track, requestedBy });
  return insertAt;
}

export function removeTrack(guildId: string, index: number): Track | null {
  const queue = getQueue(guildId);
  if (index < 0 || index >= queue.items.length) return null;
  const removed = queue.items.splice(index, 1);
  if (queue.currentIndex >= index && queue.currentIndex > 0) {
    queue.currentIndex--;
  }
  return removed[0]?.track || null;
}

export function getCurrentTrack(guildId: string): QueueItem | null {
  const queue = getQueue(guildId);
  if (queue.currentIndex < 0 || queue.currentIndex >= queue.items.length) return null;
  return queue.items[queue.currentIndex];
}

export function skipTrack(guildId: string): QueueItem | null {
  const queue = getQueue(guildId);
  if (queue.items.length === 0) return null;

  if (queue.loopMode === 'one') {
    return getCurrentTrack(guildId);
  }

  queue.currentIndex++;
  if (queue.currentIndex >= queue.items.length) {
    if (queue.loopMode === 'all') {
      queue.currentIndex = 0;
    } else {
      queue.isPlaying = false;
      queue.currentIndex = -1;
      return null;
    }
  }
  return queue.items[queue.currentIndex];
}

export function previousTrack(guildId: string): QueueItem | null {
  const queue = getQueue(guildId);
  if (queue.items.length === 0) return null;

  queue.currentIndex--;
  if (queue.currentIndex < 0) {
    queue.currentIndex = queue.items.length - 1;
  }
  return queue.items[queue.currentIndex];
}

export function jumpTo(guildId: string, index: number): QueueItem | null {
  const queue = getQueue(guildId);
  if (index < 0 || index >= queue.items.length) return null;
  queue.currentIndex = index;
  return queue.items[index];
}

export function shuffleQueue(guildId: string): void {
  const queue = getQueue(guildId);
  const current = getCurrentTrack(guildId);
  const before = queue.items.slice(0, queue.currentIndex);
  const after = queue.items.slice(queue.currentIndex + 1);

  shuffleArray(after);
  queue.items = [...before, current!, ...after];
}

export function clearQueue(guildId: string): void {
  const queue = getQueue(guildId);
  queue.items = [];
  queue.currentIndex = -1;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
