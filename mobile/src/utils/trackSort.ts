import { PlaylistVideo } from '../api/playlists';

// Shared by PlaylistDetailScreen and AllTracksScreen — mirrors
// frontend/src/pages/PlaylistDetailPage/hooks/genreFilter.ts's SortOption/
// sortTracks.
export type SortOption = 'import-desc' | 'import-asc' | 'name-asc' | 'name-desc' | 'artist-asc' | 'artist-desc' | 'plays-desc' | 'plays-asc';
export const DEFAULT_SORT: SortOption = 'import-desc';

export function sortTracks(videos: PlaylistVideo[], sort: SortOption): PlaylistVideo[] {
  const sorted = [...videos];
  switch (sort) {
    case 'import-asc': return sorted.sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));
    case 'import-desc': return sorted.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
    case 'name-asc': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'name-desc': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'artist-asc': return sorted.sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.title.localeCompare(b.title));
    case 'artist-desc': return sorted.sort((a, b) => (b.artist ?? '').localeCompare(a.artist ?? '') || a.title.localeCompare(b.title));
    case 'plays-asc': return sorted.sort((a, b) => a.playCount - b.playCount || a.title.localeCompare(b.title));
    case 'plays-desc': return sorted.sort((a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title));
  }
}
