import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { usePlayer } from '../../contexts/PlayerContext';

/**
 * Soft glow behind the sidebar logo that pulses with whatever's currently
 * playing in the mini player, and fades out (via its own effect cleanup)
 * the moment playback stops.
 *
 * Reads frequency data via its own requestAnimationFrame loop and writes
 * straight to the DOM through a ref — deliberately not React state, since
 * that would re-render (and re-render everything reading player context)
 * up to 60 times a second for a purely decorative effect.
 */
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
        background: 'radial-gradient(circle, rgba(255,23,23,0.55) 0%, rgba(255,23,23,0) 70%)',
        filter: 'blur(12px)',
        opacity: 0,
        transition: 'transform 0.08s ease-out, opacity 0.15s ease-out',
        pointerEvents: 'none',
        willChange: 'transform, opacity',
      }}
    />
  );
}
