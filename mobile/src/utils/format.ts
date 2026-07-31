export function displayName(playlist: { title: string; customName: string | null }): string {
  return playlist.customName ?? playlist.title;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Mirrors frontend/src/pages/PlaylistsPage/utils.tsx's formatPlaybackTime —
// a "3 hours 24 mins of playback"-style total, distinct from formatDuration
// above (a single track's mm:ss).
export function formatPlaybackTime(totalSeconds: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(t('playlists.playbackTime.days', { count: days }));
  if (hours > 0) parts.push(t('playlists.playbackTime.hours', { count: hours }));
  if (mins > 0 || parts.length === 0) parts.push(t('playlists.playbackTime.mins', { count: mins }));

  return t('playlists.playbackTime.label', { time: parts.join(' ') });
}
