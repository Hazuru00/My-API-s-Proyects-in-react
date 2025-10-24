import React, { useEffect, useRef } from 'react';

type ParallaxSectionProps = {
  children: React.ReactNode;
  /** maximum translate in px (positive) */
  maxTranslate?: number;
  /** fade out as progress approaches 1 */
  fade?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * ParallaxSection: aplica un parallax basado en la posición de scroll de la página.
 * - Calcula el progreso relativo de la sección en pantalla (0..1).
 * - Aplica transform y opcionalmente opacidad basadas en progress.
 * - No detiene el scroll: es para secciones "normales" de página.
 */
const ParallaxSection: React.FC<ParallaxSectionProps> = ({
  children,
  maxTranslate = 80,
  fade = true,
  className = '',
  style,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);
  const isVisible = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // IntersectionObserver to avoid work when section is off-screen
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          isVisible.current = entry.isIntersecting;
        });
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    io.observe(el);

    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;

      // progress: 0 when element center far from viewport center, 1 when perfectly centered
      const elementCenter = rect.top + rect.height / 2;
      const distance = Math.abs(vh / 2 - elementCenter);
      const maxDistance = vh / 2 + rect.height / 2;
      let progress = 1 - Math.min(1, Math.max(0, distance / maxDistance));

      // apply container transform/opactiy
      const translateY = (1 - progress) * maxTranslate; // 0..maxTranslate
      if (fade) {
        el.style.opacity = String(progress);
      }
      el.style.transform = `translateY(${translateY.toFixed(2)}px)`;
      el.style.setProperty('--parallax-progress', String(progress));

      // handle children layers with data-parallax-depth attribute (0..1)
      const layers = el.querySelectorAll<HTMLElement>('[data-parallax-depth]');
      layers.forEach(layer => {
        const depthAttr = layer.getAttribute('data-parallax-depth') || '0.5';
        const depth = Math.min(1, Math.max(0, Number(depthAttr)));
        // deeper layers move less; compute per-layer translate
        const layerTranslate = (1 - progress) * maxTranslate * depth;
        layer.style.transform = `translateY(${layerTranslate.toFixed(2)}px)`;
        // Optionally adjust opacity by depth
        if (fade) {
          const layerOpacity = Math.max(0, Math.min(1, progress + (depth - 0.5) * 0.2));
          layer.style.opacity = String(layerOpacity);
        }
      });
    };

    const onScrollOrResize = () => {
      if (!isVisible.current) return; // skip if not visible
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        update();
      });
    };

    // initial update
    update();

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [maxTranslate, fade]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ transition: 'transform .45s ease, opacity .35s ease', willChange: 'transform, opacity', ...style }}
    >
      {children}
    </div>
  );
};

export default ParallaxSection;
