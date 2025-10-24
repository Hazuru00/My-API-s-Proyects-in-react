import React, { useEffect, useRef } from 'react';

type ParallaxWrapperProps = {
  children: React.ReactNode;
  /** maximum translate in px (positive number). Default 80 */
  maxTranslate?: number;
  /** scale for wheel delta to progress (smaller => slower). Default 0.0015 */
  wheelScale?: number;
  /** initial progress 0..1 */
  initial?: number;
  className?: string;
  style?: React.CSSProperties;
  onProgress?: (p: number) => void;
};

/**
 * ParallaxWrapper: captura rueda/touch y expone --parallax-progress CSS var (0..1)
 * También aplica transform/opacity directamente para un efecto inmediato.
 */
const ParallaxWrapper: React.FC<ParallaxWrapperProps> = ({
  children,
  maxTranslate = 80,
  wheelScale = 0.0015,
  initial = 0,
  className = '',
  style,
  onProgress,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef(initial);
  const animatedRef = useRef(initial);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // initialize CSS var
    el.style.setProperty('--parallax-progress', String(initial));

    const onWheel = (e: WheelEvent) => {
      const delta = e.deltaY * wheelScale;
      let next = Math.min(1, Math.max(0, targetRef.current + delta));
      if (next !== targetRef.current) {
        targetRef.current = next;
        // update pointer events when fully hidden (optional)
        el.style.pointerEvents = next >= 1 ? 'none' : 'auto';
      }
    };

    let startY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = startY - e.touches[0].clientY;
      const delta = dy * wheelScale * 0.6; // touch a bit less sensitive
      let next = Math.min(1, Math.max(0, targetRef.current + delta));
      if (next !== targetRef.current) targetRef.current = next;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = () => {
      startY = null;
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);

    // animation loop: smooth animatedRef -> targetRef and apply styles
    const tick = () => {
      const t = targetRef.current;
      let a = animatedRef.current;
      // simple easing
      a += (t - a) * 0.18;
      animatedRef.current = a;

      if (el) {
        el.style.setProperty('--parallax-progress', String(a));
        const opacity = String(1 - a);
        const translateY = `translateY(${-(a * maxTranslate).toFixed(2)}px)`;
        (el.style as any).opacity = opacity;
        (el.style as any).transform = translateY;
      }

      if (onProgress) onProgress(a);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart as EventListener);
      el.removeEventListener('touchmove', onTouchMove as EventListener);
      el.removeEventListener('touchend', onTouchEnd as EventListener);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [maxTranslate, wheelScale, initial, onProgress]);

  return (
    <div ref={containerRef} className={className} style={{ transition: 'opacity .3s linear, transform .35s ease', ...style }}>
      {children}
    </div>
  );
};

export default ParallaxWrapper;
