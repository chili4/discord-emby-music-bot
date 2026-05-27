export function ticksToSeconds(ticks: number): number {
  return Math.floor(ticks / 10_000_000);
}

export function ticksToDuration(ticks: number): string {
  const totalSeconds = ticksToSeconds(ticks);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function secondsToDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function progressBar(current: number, total: number, length = 16): string {
  const filled = Math.round((current / total) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
