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

// Genre values are consistently capitalized going forward (see
// audioAnalysisWorker.ts), but tracks analyzed before that — or still
// carrying an old pre-Essentia MusicBrainz genre tag — can have arbitrary
// casing. Grouping/filtering key: trimmed + lowercased, so "Electronic" and
// "electronic" are treated as the same genre instead of producing duplicate
// chips.
export function normalizeGenreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

// Display label: always capitalized regardless of how it's actually stored,
// so the UI never shows a lowercase genre even before that data is cleaned up.
export function formatGenre(genre: string): string {
  const trimmed = genre.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

// YouTube's own audio-only streams are typically ~128-160kbps opus/aac even at
// "best" quality, so a bar like 320kbps would flag almost everything. This is
// meant to single out unusually bad sources (old/re-encoded uploads), not to
// second-guess YouTube's normal ceiling.
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

export const STATUS_ICON: Record<string, JSX.Element> = {
  done:        <CheckCircleOutline sx={{ fontSize: 16, color: 'success.main' }} />,
  failed:      <ErrorOutline sx={{ fontSize: 16, color: 'error.main' }} />,
  pending:     <HourglassEmpty sx={{ fontSize: 16, color: 'text.disabled' }} />,
  downloading: <CloudDownload sx={{ fontSize: 16, color: 'info.main' }} />,
  removed:     <BlockIcon sx={{ fontSize: 16, color: 'text.disabled' }} />,
};
