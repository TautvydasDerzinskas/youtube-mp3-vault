import { Avatar } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';

export function Thumbnail({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  return (
    <Avatar src={thumbnailUrl ?? undefined} variant="rounded"
      sx={{ width: 56, height: 40, borderRadius: 1, flexShrink: 0 }}>
      <MusicNoteIcon />
    </Avatar>
  );
}
