import {
  CheckCircleOutline, ErrorOutline, HourglassEmpty, CloudDownload,
  Block as BlockIcon,
} from '@mui/icons-material';
import { TFunction } from 'i18next';
import { Playlist } from '../../api/youtube';

export function displayName(p: Playlist) { return p.customName ?? p.title; }

export function formatDuration(s: number | null): string {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubePlaylistUrl(youtubeId: string): string {
  return `https://www.youtube.com/playlist?list=${youtubeId}`;
}

// Links a genre through to All Tracks pre-filtered to just that one — used
// by the dashboard's genre card/modal and the standalone Genres page alike.
//
// Double-encoded: a genre key can itself contain a comma (e.g. Discogs-style
// "folk, world, & country"), and the ?genres= param uses a comma to join
// multiple selected keys together (see genreFilter.ts's parseGenres/
// toggleGenre) — so each key is encodeURIComponent'd individually first
// (turning any real comma into a harmless %2C) before that result is itself
// encoded to become the URL's query string. Without the inner encoding, a
// comma-containing genre would come back from useSearchParams already
// decoded to its real commas and get mis-split into several bogus genres.
export function allTracksGenreUrl(genreKey: string): string {
  return `/all-tracks?genres=${encodeURIComponent(encodeURIComponent(genreKey))}`;
}

// Links an artist name through to their detail page. Normalized (trim +
// lowercase) to match the backend's normalizeKey, since a track only carries
// the artist's raw display name, not its precomputed key.
export function artistUrl(artist: string): string {
  return `/artists/${encodeURIComponent(artist.trim().toLowerCase())}`;
}

export function normalizeGenreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

// Display label: always capitalized regardless of how it's actually stored,
// so the UI never shows a lowercase genre even before that data is cleaned up.
export function formatGenre(genre: string): string {
  const trimmed = genre.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

export const LOW_BITRATE_THRESHOLD_KBPS = 96;

export function isLowBitrate(bitrate: number | null): boolean {
  return bitrate !== null && bitrate < LOW_BITRATE_THRESHOLD_KBPS;
}

export function timeAgo(d: string | null, t: TFunction): string {
  if (!d) return t('playlists.neverSynced');
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return t('playlists.justNow');
  if (min < 60) return t('playlists.minutesAgo', { count: min });
  const h = Math.floor(min / 60);
  return h < 24 ? t('playlists.hoursAgo', { count: h }) : t('playlists.daysAgo', { count: Math.floor(h / 24) });
}

// e.g. "3 days 6 hours 34 mins of playback" — omits any leading zero-valued
// unit (a sub-hour playlist doesn't show "0 days"), but always shows at
// least the minutes, even at 0, so the label never comes out empty.
export function formatPlaybackTime(totalSeconds: number, t: TFunction): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(t('playlists.playbackTime.days', { count: days }));
  if (hours > 0) parts.push(t('playlists.playbackTime.hours', { count: hours }));
  if (mins > 0 || parts.length === 0) parts.push(t('playlists.playbackTime.mins', { count: mins }));

  return t('playlists.playbackTime.label', { time: parts.join(' ') });
}

export const STATUS_ICON: Record<string, JSX.Element> = {
  done:        <CheckCircleOutline sx={{ fontSize: 16, color: 'success.main' }} />,
  failed:      <ErrorOutline sx={{ fontSize: 16, color: 'error.main' }} />,
  pending:     <HourglassEmpty sx={{ fontSize: 16, color: 'text.disabled' }} />,
  downloading: <CloudDownload sx={{ fontSize: 16, color: 'info.main' }} />,
  removed:     <BlockIcon sx={{ fontSize: 16, color: 'text.disabled' }} />,
};
