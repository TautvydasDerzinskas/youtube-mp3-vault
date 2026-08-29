import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { usePlayer } from '../../contexts/PlayerContext';
import theme from '../../theme';

// Derived from the theme's own primary color (not a separately-hardcoded
// rgb triple) so a future accent color change needs no edit here.
const GLOW_COLOR_CENTER = alpha(theme.palette.primary.main, 0.55);
const GLOW_COLOR_EDGE = alpha(theme.palette.primary.main, 0);

export function SidebarAudioGlow() {
  const { analyserNode } = usePlayer();
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!analyserNode || !el) return;

    const data = new Uint8Array(analyserNode.frequencyBinCount);
    let rafId: number;

    const tick = () => {
      analyserNode.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = sum / data.length / 255; // 0 (silence) .. 1 (loudest)
      el.style.transform = `scale(${1 + level * 0.9})`;
      el.style.opacity = String(0.2 + level * 0.8);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      el.style.transform = 'scale(1)';
      el.style.opacity = '0';
    };
  }, [analyserNode]);

  return (
    <Box
      ref={glowRef}
      aria-hidden
      sx={{
        position: 'absolute', inset: 0, margin: 'auto',
        width: 120, height: 120, borderRadius: '50%',
        background: `radial-gradient(circle, ${GLOW_COLOR_CENTER} 0%, ${GLOW_COLOR_EDGE} 70%)`,
        filter: 'blur(12px)',
        opacity: 0,
        transition: 'transform 0.08s ease-out, opacity 0.15s ease-out',
        pointerEvents: 'none',
        willChange: 'transform, opacity',
      }}
    />
  );
}
