export function displayName(playlist: { title: string; customName: string | null }): string {
  return playlist.customName ?? playlist.title;
}

// Mirrors frontend/src/pages/PlaylistsPage/utils.tsx's normalizeGenreKey —
// same trim+lowercase as backend's normalizeKey, so a genre chip's key
// always matches what AllTracksScreen filters by regardless of casing.
export function normalizeGenreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

// Display label: always capitalized regardless of how it's actually
// stored, so the UI never shows a lowercase genre even before that data is
// cleaned up.
export function formatGenre(genre: string): string {
  const trimmed = genre.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
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

// Mirrors frontend/src/pages/PlaylistsPage/utils.tsx's timeAgo — single
// largest applicable unit, floored. Used by the dashboard's recently-added
// row (addedAt is never null there, unlike web's lastSyncedAt use of this
// same pattern, so no "never" case is needed here).
export function timeAgo(d: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return t('playlists.justNow');
  if (min < 60) return t('playlists.minutesAgo', { count: min });
  const h = Math.floor(min / 60);
  return h < 24 ? t('playlists.hoursAgo', { count: h }) : t('playlists.daysAgo', { count: Math.floor(h / 24) });
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
