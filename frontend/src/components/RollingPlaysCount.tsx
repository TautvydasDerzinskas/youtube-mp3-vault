import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../contexts/PlayerContext';

// Long enough to read as a deliberate roll, short enough not to lag behind
// the next track already starting.
const ROLL_MS = 450;

const rollIn = keyframes`
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;
const rollOut = keyframes`
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(100%); opacity: 0; }
`;

interface RollingPlaysCountProps {
  videoId: string;
  playCount: number;
  // TrackRow's list column has always omitted itself entirely at zero
  // plays; the track detail page's Chip has always shown "0 plays" rather
  // than hiding. Defaults to true (TrackRow's behavior, the more common
  // caller) — pass false to keep a zero-count caller rendering unconditionally.
  hideWhenZero?: boolean;
}

/**
 * Plain inline text — "N plays" — that inherits whatever Typography/Chip
 * styling wraps it, same as the raw translated string it replaces. The only
 * thing it adds: when this exact track just finished playing (see
 * PlayerContext's justPlayedBump) and this element is actually on screen at
 * that moment, the old count slides down and out while the new one rolls
 * down from above it, odometer-style, instead of silently swapping — a
 * little reward for the row you're actually looking at when a play lands.
 * Off-screen (or if IntersectionObserver isn't available), the count still
 * updates, just without the animation.
 */
export function RollingPlaysCount({ videoId, playCount, hideWhenZero = true }: RollingPlaysCountProps) {
  const { t } = useTranslation();
  const { justPlayedBump } = usePlayer();
  const elRef = useRef<HTMLSpanElement>(null);
  const [displayCount, setDisplayCount] = useState(playCount);
  const [outgoingCount, setOutgoingCount] = useState<number | null>(null);

  // Keeps this in sync with whatever the parent's own list state has —
  // e.g. after a refetch/navigation brings back a fresh, already-correct
  // count, unrelated to a live bump.
  useEffect(() => setDisplayCount(playCount), [playCount]);

  useEffect(() => {
    // Matched purely by videoId — deliberately NOT gated on "is this the
    // current track," since by the time this bump actually arrives (after
    // markPlayed's network round-trip), handleTrackEnded has already
    // synchronously advanced `current` to the *next* track. The row that
    // just finished is the one this bump is for, and it's no longer
    // "current" by definition — gating on that here would mean this could
    // never fire for the row it's actually meant for.
    if (!justPlayedBump || justPlayedBump.videoId !== videoId || justPlayedBump.playCount === displayCount) return;
    const el = elRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setDisplayCount(justPlayedBump.playCount);
      return;
    }
    // A one-shot check at the exact moment of the bump — this only ever
    // needs to know "is it on screen right now," not track visibility for
    // the whole session, so there's no need to keep an observer subscribed
    // per row the rest of the time.
    const observer = new IntersectionObserver(([entry]) => {
      observer.disconnect();
      if (entry.isIntersecting) {
        setOutgoingCount(displayCount);
        setDisplayCount(justPlayedBump.playCount);
        setTimeout(() => setOutgoingCount(null), ROLL_MS);
      } else {
        setDisplayCount(justPlayedBump.playCount);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Deliberately keyed only on the bump itself — displayCount/videoId are
    // read fresh via closure each time, not dependencies, so this doesn't
    // re-subscribe (and re-check visibility) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPlayedBump]);

  // Same "hide entirely at zero" contract as the plain-text version this
  // replaces — except mid-roll-out from a nonzero count, where the old
  // value still needs to render as it slides away.
  if (hideWhenZero && displayCount <= 0 && outgoingCount === null) return null;

  const label = t('artists.detail.totalPlayCount', { count: displayCount });
  if (outgoingCount === null) {
    return <Box component="span" ref={elRef} sx={{ display: 'inline-block' }}>{label}</Box>;
  }

  const outgoingLabel = t('artists.detail.totalPlayCount', { count: outgoingCount });
  return (
    <Box component="span" ref={elRef} sx={{ position: 'relative', display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
      <Box component="span" sx={{ display: 'inline-block', animation: `${rollIn} ${ROLL_MS}ms ease forwards` }}>
        {label}
      </Box>
      <Box component="span" sx={{ position: 'absolute', inset: 0, display: 'inline-block', animation: `${rollOut} ${ROLL_MS}ms ease forwards` }}>
        {outgoingLabel}
      </Box>
    </Box>
  );
}
