import { useEffect, useMemo, useState } from 'react';
import { artistsApi, ArtistDetail } from '../../api/artists';

// Mirrors frontend/src/pages/ArtistDetailPage/index.tsx — no sort/filter of
// its own, tracks come back pre-sorted addedAt desc from the backend.
export function useArtistDetail(key: string) {
  const [artist, setArtist] = useState<ArtistDetail | 'loading' | 'error'>('loading');

  useEffect(() => {
    setArtist('loading');
    artistsApi.getDetail(key).then(setArtist).catch(() => setArtist('error'));
  }, [key]);

  const playableQueue = useMemo(
    () => (artist === 'loading' || artist === 'error' ? [] : artist.videos.filter(v => v.downloadStatus === 'done')),
    [artist]
  );

  return { artist, playableQueue };
}
