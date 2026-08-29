import { Box, Typography, List, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo, RecommendedTrack } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { QueueTrack } from '../../contexts/PlayerContext';
import { TrackRow } from '../../components/TrackRow';

function toQueueTrack(rec: RecommendedTrack): QueueTrack {
  return {
    id: rec.id,
    playlistId: rec.playlistId,
    youtubeId: rec.youtubeId,
    title: rec.title,
    // Not exposed by the /recommendations endpoint — same class of
    // simplification as album/trackNumber below (this is a synthesized
    // preview shape, not the real row). The rename modal falls back to
    // `title` whenever this is null, so it degrades gracefully here.
    originalTitle: null,
    duration: rec.duration,
    thumbnailUrl: rec.thumbnailUrl,
    position: rec.position,
    isAvailable: true,
    downloadStatus: 'done',
    downloadError: rec.downloadError,
    fileSize: rec.fileSize,
    bitrate: rec.bitrate,
    addedAt: '',
    artist: rec.artist,
    album: null,
    trackNumber: null,
    genres: rec.genres,
    releaseYear: rec.releaseYear,
    metadataStatus: 'pending',
    playCount: rec.playCount,
    lastPlayedAt: null,
    betterQualityExists: rec.betterQualityExists,
    hqFileDownloaded: rec.hqFileDownloaded,
  };
}

interface RecommendedTracksProps {
  state: RecommendedTrack[] | 'loading' | 'error';
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: QueueTrack, queue?: QueueTrack[]) => void;
  onDeleted?: (videoId: string) => void;
  onUpdated?: (video: PlaylistVideo) => void;
}

/**
 * In-library "sounds like this" — see the /recommendations endpoint
 * (audio-embedding cosine similarity, boosted by same-artist/same-genre).
 * Renders nothing but a bare spinner while loading (no title), and nothing
 * at all once resolved if there's nothing to show — same contract as
 * DiscoverTracks and RemixLinks, so the three sections behave identically
 * regardless of which ones end up with content. Rows reuse TrackRow, the
 * same component the playlist page's own track list renders, so a track
 * looks and behaves identically here as it does there.
 */
export function RecommendedTracks({ state, nowPlaying, isAudioPlaying, onTogglePlay, onDeleted, onUpdated }: RecommendedTracksProps) {
  const { t } = useTranslation();

  if (state === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
  }
  if (state === 'error' || state.length === 0) return null;

  const queue = state.map(toQueueTrack);

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {t('playlists.trackDetail.recommendedTitle')}
      </Typography>

      <List dense disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px', overflow: 'hidden' }}>
        {state.map((rec, index) => {
          const isCurrentTrack = nowPlaying?.playlistId === rec.playlistId && nowPlaying?.videoId === rec.id;
          return (
            <TrackRow key={rec.id} playlistId={rec.playlistId} video={queue[index]} isCurrentTrack={isCurrentTrack}
              isAudioPlaying={isAudioPlaying} onTogglePlay={() => onTogglePlay(rec.playlistId, queue[index], queue)}
              onDeleted={onDeleted}
              onUpdated={onUpdated}
              sx={{ '&:last-of-type': { borderBottom: 'none' } }} />
          );
        })}
      </List>
    </Box>
  );
}
