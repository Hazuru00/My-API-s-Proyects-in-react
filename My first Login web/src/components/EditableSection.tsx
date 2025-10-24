import React, { useEffect, useRef, useState } from 'react';
import { clamp, lerp, cubicBezierEasing, snap } from './animationUtils';

type KeyframePoint = { id: string; time: number; translate: number; opacity: number; easing?: string; bezier?: [number,number,number,number] };

type LayerConfig = {
  id: string;
  label: string;
  depth: number; // 0..1
  color: string;
  image?: string | null; // data URL or URL
  visible?: boolean;
  // layout in preview (percentages)
  x?: number; // 0..100
  y?: number; // 0..100
  w?: number; // width percent
  h?: number; // height percent
  keyframes: KeyframePoint[];
};

const mkId = () => String(Math.random()).slice(2);

const defaultLayer = (): LayerConfig => ({
  id: mkId(),
  label: 'Layer',
  depth: 0.5,
  color: '#ffffff',
  image: null,
  visible: true,
  x: 50,
  y: 50,
  w: 60,
  h: 30,
  keyframes: [
    { id: mkId(), time: 0, translate: 40, opacity: 0, easing: 'linear' },
    { id: mkId(), time: 1000, translate: 0, opacity: 1, easing: 'linear' },
  ],
});

/**
 * AnimationBuilder: editor visual con canvas preview, timeline clave y persistencia.
 */
type BuilderProps = { mode?: 'overlay' | 'embedded' };
const AnimationBuilder: React.FC<BuilderProps> = ({ mode = 'overlay' }) => {
  const [layers, setLayers] = useState<LayerConfig[]>([defaultLayer(), { ...defaultLayer(), label: 'Foreground', depth: 0.9, color: '#f1f5f9' }]);
  const [panels, setPanels] = useState<{ layers: boolean; timeline: boolean; settings: boolean }>(()=>({ layers: true, timeline: true, settings: true }));
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineDuration, setTimelineDuration] = useState(2000); // ms
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapInterval, setSnapInterval] = useState(50); // ms
  const [timelineZoom, setTimelineZoom] = useState(1); // scale
  const [previewAsScroll, setPreviewAsScroll] = useState(false);

  // helper removed in favor of inline toggles in header to avoid unused warnings
  const [presets, setPresets] = useState<{ name: string; config: LayerConfig[] }[]>(() => {
    try {
      const raw = localStorage.getItem('animation-builder-presets');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement | null>>({});
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const [editorTheme, setEditorTheme] = useState<'light'|'dark'|'crimson'>(()=>{
    try { return (localStorage.getItem('animation-builder-theme') as 'light'|'dark'|'crimson') || 'light'; } catch { return 'light'; }
  });
  const [liveMessage, setLiveMessage] = useState('');
  const [selectedKF, setSelectedKF] = useState<{layerId:string;kfId:string}|null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(()=>{
    try { const v = localStorage.getItem('animation-leftWidth'); return v ? Number(v) : 640; } catch { return 640; }
  });
  const resizingRef = useRef<{startX:number;startWidth:number} | null>(null);
  const [uiCollapsed, setUiCollapsed] = useState<boolean>(()=>{
    try { return localStorage.getItem('animation-uiCollapsed') === '1'; } catch { return false; }
  });
  const [visible, setVisible] = useState<boolean>(()=>{
    try { return localStorage.getItem('animation-visible') !== '0'; } catch { return true; }
  });
  const scrubState = useRef<{ startX: number; rectLeft: number; rectWidth: number } | null>(null);

  // persist editor theme
  useEffect(()=>{ try{ localStorage.setItem('animation-builder-theme', editorTheme); }catch{} }, [editorTheme]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // resizer pointer handlers
  const onResizerPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    resizingRef.current = { startX: e.clientX, startWidth: leftWidth };
    const onMove = (ev: PointerEvent) => {
      if (!resizingRef.current || !rootRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const containerRect = rootRef.current.getBoundingClientRect();
      const minLeft = 320; const maxLeft = Math.max(380, containerRect.width - 320);
    let nw = Math.max(minLeft, Math.min(maxLeft, resizingRef.current.startWidth + delta));
    setLeftWidth(nw);
    };
    const onUp = () => {
      try { el.releasePointerCapture(e.pointerId); } catch {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      resizingRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

    // persist leftWidth and uiCollapsed/visible
    useEffect(()=>{ try { localStorage.setItem('animation-leftWidth', String(leftWidth)); } catch{} }, [leftWidth]);
    useEffect(()=>{ try { localStorage.setItem('animation-uiCollapsed', uiCollapsed ? '1' : '0'); } catch{} }, [uiCollapsed]);
    useEffect(()=>{ try { localStorage.setItem('animation-visible', visible ? '1' : '0'); } catch{} }, [visible]);

  // when previewAsScroll is enabled, map window scroll to timeline time
  useEffect(() => {
    if (!previewAsScroll) return;
    const onScroll = () => {
      const scrollTop = window.scrollY || window.pageYOffset;
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const prog = clamp(scrollTop / maxScroll, 0, 1);
      const t = prog * timelineDuration;
      setCurrentTime(t);
      draw(t);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAsScroll, timelineDuration, layers]);

  // keyboard shortcuts: A = add keyframe to selected layer at currentTime
  useEffect(()=>{
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.isContentEditable) return;
      if (ev.key === 'a' || ev.key === 'A') {
        if (selectedKF) { addKeyframe(selectedKF.layerId, Math.round(currentTime)); setLiveMessage('Keyframe añadido'); }
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedKF) { removeKeyframe(selectedKF.layerId, selectedKF.kfId); setSelectedKF(null); setLiveMessage('Keyframe eliminado'); }
      }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        if (selectedKF) {
          const layer = layers.find(l=>l.id===selectedKF.layerId);
          if (!layer) return;
          const k = layer.keyframes.find(k=>k.id === selectedKF.kfId);
          if (!k) return;
          const delta = ev.shiftKey ? 100 : 10;
          const nt = ev.key === 'ArrowLeft' ? Math.max(0, k.time - delta) : Math.min(timelineDuration, k.time + delta);
          updateKeyframe(layer.id, k.id, { time: nt });
          setLiveMessage(`Keyframe movido a ${nt}ms`);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [selectedKF, currentTime, layers, timelineDuration]);

  // utilities to update state
  const setLayer = (id: string, patch: Partial<LayerConfig>) => setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const addLayer = () => setLayers(prev => [...prev, defaultLayer()]);
  const removeLayer = (id: string) => setLayers(prev => prev.filter(l => l.id !== id));

  // keyframe helpers
  const addKeyframe = (layerId: string, time = Math.round(timelineDuration / 2)) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, keyframes: [...l.keyframes, { id: mkId(), time, translate: 0, opacity: 1 }].sort((a,b)=>a.time-b.time) } : l));
  };
  const removeKeyframe = (layerId: string, kfId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, keyframes: l.keyframes.filter(k => k.id !== kfId) } : l));
  };
  const updateKeyframe = (layerId: string, kfId: string, patch: Partial<KeyframePoint>) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, keyframes: l.keyframes.map(k => k.id === kfId ? { ...k, ...patch } : k).sort((a,b)=>a.time-b.time) } : l));
  };

  // image upload
  const setLayerImageFile = (layerId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLayer(layerId, { image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  // preload images into image elements so draw can be synchronous
  useEffect(() => {
    layers.forEach(layer => {
      if (layer.image) {
        const img = new Image();
        img.src = layer.image;
        img.onload = () => { imagesRef.current[layer.id] = img; };
        img.onerror = () => { imagesRef.current[layer.id] = null; };
      } else {
        imagesRef.current[layer.id] = null;
      }
    });
  }, [layers]);

  // timeline interaction (drag keyframes)
  const dragState = useRef<{ layerId: string; kfId: string; offsetX: number; rectLeft: number; rectWidth: number; scroller?: HTMLElement | null } | null>(null);
  const autoScrollRAF = useRef<number | null>(null);

  const onTimelinePointerDown = (e: React.PointerEvent, layerId: string, kfId: string) => {
    const timeline = (e.currentTarget as HTMLElement).closest('.timeline-track') as HTMLElement | null;
    if (!timeline) return;
    const rect = timeline.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    // rectWidth should consider zoom
    const rectWidth = rect.width * timelineZoom;
    // find the scrollable area (the parent of .timeline-track-inner)
    const inner = timeline.querySelector('.timeline-track-inner') as HTMLElement | null;
    const scroller = inner ? inner.parentElement as HTMLElement : timeline;
    dragState.current = { layerId, kfId, offsetX, rectLeft: rect.left, rectWidth, scroller };
    setSelectedKF({layerId,kfId});
    setLiveMessage('Keyframe seleccionado');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // start smooth auto-scroll loop
    if (autoScrollRAF.current == null) {
      const loop = () => {
        if (!dragState.current) { autoScrollRAF.current = null; return; }
        try {
          const sc = dragState.current.scroller;
          if (sc) {
            const srect = sc.getBoundingClientRect();
            const cx = (window.event as PointerEvent)?.clientX ?? 0;
            // fallback to offsetX if no event
            const clientX = cx || (dragState.current!.rectLeft + dragState.current!.offsetX);
            const edge = 48;
            const speed = 12; // px per frame approx
            if (clientX - srect.left < edge) {
              sc.scrollLeft = Math.max(0, sc.scrollLeft - speed);
            } else if (srect.right - clientX < edge) {
              sc.scrollLeft = sc.scrollLeft + speed;
            }
          }
        } catch (err) {}
        autoScrollRAF.current = requestAnimationFrame(loop);
      };
      autoScrollRAF.current = requestAnimationFrame(loop);
    }
  };
  const onTimelinePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const { layerId, kfId, rectLeft, rectWidth } = dragState.current;
    const x = e.clientX - rectLeft;
    let t = clamp(x / rectWidth, 0, 1) * timelineDuration;
    if (snapEnabled && snapInterval > 0) t = snap(t, snapInterval);
    updateKeyframe(layerId, kfId, { time: Math.round(t) });
  };
  const onTimelinePointerUp = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragState.current = null;
    setLiveMessage('Keyframe movido');
    if (autoScrollRAF.current) { cancelAnimationFrame(autoScrollRAF.current); autoScrollRAF.current = null; }
  };

  // scrubber handlers for moving current time on the timeline
  const onScrubPointerDown = (e: React.PointerEvent) => {
    const track = (e.currentTarget as HTMLElement).closest('.timeline-track') as HTMLElement | null;
    if (!track) return;
    const inner = track.querySelector('.timeline-track-inner') as HTMLElement | null;
    const rect = inner ? inner.getBoundingClientRect() : track.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    scrubState.current = { startX: e.clientX, rectLeft: rect.left, rectWidth: rect.width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t = clamp(offsetX / rect.width, 0, 1) * timelineDuration;
    setCurrentTime(t);
    draw(t);
  };
  const onScrubPointerMove = (e: React.PointerEvent) => {
    if (!scrubState.current) return;
    const { rectLeft, rectWidth } = scrubState.current;
    const x = e.clientX - rectLeft;
    const t = clamp(x / rectWidth, 0, 1) * timelineDuration;
    setCurrentTime(t);
    draw(t);
  };
  const onScrubPointerUp = (e: React.PointerEvent) => {
    if (!scrubState.current) return;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    scrubState.current = null;
    setLiveMessage('Tiempo actualizado');
  };

  // drawing on canvas based on currentTime
  const draw = (time: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);

    // draw layers in order
    layers.forEach(layer => {
      if (!layer.visible) return;
      // interpolate keyframes for this time
      if (layer.keyframes.length === 0) return;
      let prev = layer.keyframes[0];
      let next = layer.keyframes[layer.keyframes.length-1];
      for (let i=0;i<layer.keyframes.length;i++){
        if (layer.keyframes[i].time <= time) prev = layer.keyframes[i];
        if (layer.keyframes[i].time >= time) { next = layer.keyframes[i]; break; }
      }
      const span = next.time - prev.time || 1;
      const localT = clamp((time - prev.time) / span, 0, 1);
      // easing per-keyframe (prefer next.bezier if present)
      let eased = localT;
      if ((next as KeyframePoint).bezier) {
        const b = (next as KeyframePoint).bezier!;
        const f = cubicBezierEasing(b[0], b[1], b[2], b[3]);
        eased = f(localT);
      } else {
        const easing = (next as KeyframePoint).easing || 'linear';
        const easeT = (t: number) => {
          switch (easing) {
            case 'ease-in': return t * t;
            case 'ease-out': return t * (2 - t);
            case 'ease': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            default: return t;
          }
        };
        eased = easeT(localT);
      }
      const translate = lerp(prev.translate, next.translate, eased);
      const opacity = lerp(prev.opacity, next.opacity, eased);

      ctx.save();
      ctx.globalAlpha = clamp(opacity,0,1);

  // draw image or box centered — but also consider layout x/y/w/h (percent)
  const cx = rect.width * ((layer.x ?? 50) / 100);
  const cy = rect.height * ((layer.y ?? 50) / 100) + translate;
  const w = rect.width * ((layer.w ?? 60) / 100);
  const h = rect.height * ((layer.h ?? 30) / 100);
      if (layer.image) {
        const img = imagesRef.current[layer.id];
        if (img && img.complete && img.naturalWidth) {
          ctx.save();
          ctx.globalAlpha = clamp(opacity,0,1);
          const iw = img.width, ih = img.height;
          const ar = iw/ih;
          let dw = w, dh = w/ar;
          if (dh > h) { dh = h; dw = h*ar; }
          ctx.drawImage(img, cx - dw/2, cy - dh/2, dw, dh);
          ctx.restore();
        } else {
          // placeholder while image loads
          ctx.fillStyle = '#222';
          ctx.fillRect(cx - w/2, cy - h/2, w, h);
        }
      } else {
        ctx.fillStyle = layer.color;
        ctx.fillRect(cx - w/2, cy - h/2, w, h);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.label, cx, cy);
      }

      ctx.restore();
    });
  };

  // playback loop
  useEffect(() => {
    let start = performance.now() - currentTime;
    const loop = (now: number) => {
      const t = now - start;
      if (t >= timelineDuration) {
        setCurrentTime(timelineDuration);
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      setCurrentTime(t);
      draw(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    if (playing) {
      playingRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      draw(currentTime);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, layers, timelineDuration]);

  // draw when currentTime or layers change (paused)
  useEffect(() => { if (!playing) draw(currentTime); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentTime, layers]);

  const play = () => { setPlaying(true); };
  const pause = () => { setPlaying(false); };
  const stop = () => { setPlaying(false); setCurrentTime(0); draw(0); };

  // presets
  const savePreset = (name: string) => {
    const p = [...presets, { name, config: layers }];
    setPresets(p);
    localStorage.setItem('animation-builder-presets', JSON.stringify(p));
  };
  const loadPreset = (index: number) => {
    const p = presets[index];
    if (p) setLayers(p.config);
  };

  // small helper to download a generated file
  const downloadFile = (filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const exportJSON = () => { const json = JSON.stringify({ timelineDuration, layers }, null, 2); navigator.clipboard?.writeText(json); alert('JSON copiado'); };
  const exportSnippet = () => { const snippet = `const animation = ${JSON.stringify({ timelineDuration, layers }, null, 2)};`; navigator.clipboard?.writeText(snippet); alert('Snippet copiado'); };

  const generateReactComponentString = () => {
    const cfg = JSON.stringify({ timelineDuration, layers }, null, 2);
    const rect = containerRef.current?.getBoundingClientRect();
    const exportW = Math.round(rect?.width ?? 800);
    const exportH = Math.round(rect?.height ?? 400);
    return `import React, { useEffect, useRef, useState } from 'react';

type KeyframePoint = { id: string; time: number; translate: number; opacity: number; easing?: string };
type LayerConfig = { id: string; label: string; depth: number; color: string; image?: string | null; visible?: boolean; keyframes: KeyframePoint[] };

const animation = ${cfg};

export default function ExportedAnimation({ width = ${exportW}, height = ${exportH}, autoplay = false, loop = false }: { width?: number; height?: number; autoplay?: boolean; loop?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(autoplay);
  const imgs: Record<string, HTMLImageElement> = {} as any;

  useEffect(() => {
    // preload images
    animation.layers.forEach((l: any) => {
      if (l.image) { const im = new Image(); im.src = l.image; imgs[l.id] = im; }
    });
  }, []);

  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    const loopFn = (now: number) => {
      let t = now - start;
      if (!playing) { start = now - t; raf = requestAnimationFrame(loopFn); return; }
      if (t > animation.timelineDuration) {
        if (loop) { start = now; t = 0; } else { setPlaying(false); return; }
      }
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      animation.layers.forEach((layer: any) => {
        if (!layer.visible) return;
        const kf = layer.keyframes;
        if (!kf || kf.length === 0) return;
        let prev = kf[0]; let next = kf[kf.length-1];
        for (let i=0;i<kf.length;i++){ if(kf[i].time <= t) prev = kf[i]; if(kf[i].time >= t){ next = kf[i]; break; } }
        const span = Math.max(1, next.time - prev.time);
        const localT = Math.max(0, Math.min(1, (t - prev.time) / span));
        const translate = prev.translate + (next.translate - prev.translate) * localT;
        const opacity = prev.opacity + (next.opacity - prev.opacity) * localT;
        ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = layer.color;
        if (layer.image && imgs[layer.id] && imgs[layer.id].complete) {
          const img = imgs[layer.id]; const iw = img.width, ih = img.height; const ar = iw/ih; let dw = width*0.6, dh = dw/ar; if (dh > height*0.4) { dh = height*0.4; dw = dh*ar; }
          ctx.drawImage(img, (width-dw)/2, (height-dh)/2 + translate, dw, dh);
        } else {
          ctx.fillRect(10, 10 + translate + layer.depth*20, 200, 60);
        }
        ctx.restore();
      });
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height} style={{ border: '1px solid #ccc' }} />
      {/* Render elements as divs positioned according to layout so exported component can show DOM preview */}
      <div style={{ position: 'relative', width, height }}>
        {animation.layers.map((layer: any) => (
          <div key={layer.id} style={{ position: 'absolute', left: (layer.x ?? 50) + '%', top: (layer.y ?? 50) + '%', width: (layer.w ?? 60) + '%', height: (layer.h ?? 30) + '%', transform: 'translate(-50%, -50%)' }}>
            {/* simple preview box */}
            <div style={{ width: '100%', height: '100%', background: layer.color, opacity: 0.9 }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={()=>setPlaying(true)}>Play</button>
        <button onClick={()=>setPlaying(false)}>Pause</button>
      </div>
    </div>
  );
}
`;
  };

  const exportReactComponent = () => {
    const component = generateReactComponentString();
    navigator.clipboard?.writeText(component);
    alert('React component copiado al portapapeles');
  };

  const exportReactComponentFile = () => {
    const tsx = generateReactComponentString();
    downloadFile('ExportedAnimation.tsx', tsx, 'text/plain;charset=utf-8');
  };

  const generateHtmlPreviewString = () => {
    const payload = JSON.stringify({ timelineDuration, layers }, null, 2);
    // A small self-contained HTML page that mounts a canvas and simple controls and a theme selector
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Animation Preview</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial; background: #0b1220; color: #fff; }
    .preview-wrap { max-width: 900px; margin: 24px auto; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; }
    .controls { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
    .long-scroll { height: 220vh; padding-top: 40vh; }
  </style>
</head>
<body>
  <div class="preview-wrap">
    <div class="controls">
      <button id="play">Play</button>
      <button id="pause">Pause</button>
      <label>Theme: <select id="theme"><option>light</option><option>dark</option><option>crimson</option></select></label>
      <label><input type="checkbox" id="asScroll"/> Preview as scroll</label>
    </div>
    <canvas id="c" width="800" height="400" style="width:100%;height:320px;border:1px solid rgba(255,255,255,0.06);background:#000"></canvas>
    <div id="domPreview" style="position:relative;width:100%;height:200px;margin-top:8px"></div>
  </div>
  <div class="long-scroll"></div>
  <script>
    const animation = ${payload};
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const imgs = {};
    animation.layers.forEach(l => { if (l.image) { const im = new Image(); im.src = l.image; imgs[l.id] = im; } });
    let playing = false; let start = performance.now(); const timelineDuration = animation.timelineDuration;
    function drawAt(t){ ctx.clearRect(0,0,canvas.width,canvas.height); animation.layers.forEach(layer => {
      if (!layer.visible) return; const kf = layer.keyframes; if (!kf||kf.length===0) return; let prev=kf[0], next=kf[kf.length-1]; for(let i=0;i<kf.length;i++){ if(kf[i].time<=t) prev=kf[i]; if(kf[i].time>=t){ next=kf[i]; break; }} const span=Math.max(1,next.time-prev.time); const localT=Math.max(0,Math.min(1,(t-prev.time)/span)); const translate = prev.translate + (next.translate - prev.translate)*localT; const opacity = prev.opacity + (next.opacity - prev.opacity)*localT; ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = layer.color; if (layer.image && imgs[layer.id] && imgs[layer.id].complete){ const img=imgs[layer.id]; const iw=img.width, ih=img.height, ar=iw/ih; let dw=canvas.width*0.6, dh=dw/ar; if (dh>canvas.height*0.4){ dh=canvas.height*0.4; dw=dh*ar;} ctx.drawImage(img, (canvas.width-dw)/2, (canvas.height-dh)/2 + translate, dw, dh); } else { ctx.fillRect(10, 10 + translate + layer.depth*20, 200, 60); } ctx.restore(); }); }
    function loop(now){ if(!playing){ requestAnimationFrame(loop); return;} let t = now - start; if (t > timelineDuration){ playing = false; return;} drawAt(t); requestAnimationFrame(loop); }
    document.getElementById('play').addEventListener('click', ()=>{ playing=true; start=performance.now(); requestAnimationFrame(loop); });
    document.getElementById('pause').addEventListener('click', ()=>{ playing=false; });
    const asScroll = document.getElementById('asScroll'); asScroll.addEventListener('change', ()=>{ if(asScroll.checked){ window.addEventListener('scroll', onScroll); onScroll(); } else window.removeEventListener('scroll', onScroll); });
    function onScroll(){ const scrollTop = window.scrollY || window.pageYOffset; const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight); const prog = Math.max(0, Math.min(1, scrollTop / maxScroll)); drawAt(prog * timelineDuration); }
    // populate DOM preview
    const domPreview = document.getElementById('domPreview'); animation.layers.forEach(layer=>{ const d = document.createElement('div'); d.style.position='absolute'; d.style.left=(layer.x||50)+'%'; d.style.top=(layer.y||50)+'%'; d.style.width=(layer.w||60)+'%'; d.style.height=(layer.h||30)+'%'; d.style.transform='translate(-50%,-50%)'; d.style.background=layer.color; domPreview.appendChild(d); });
    // theme selector
    document.getElementById('theme').addEventListener('change', (e)=>{ const v=e.target.value; document.body.style.background = v==='dark' ? '#0b1220' : v==='crimson' ? '#1b0b0e' : '#f6f7fb'; document.body.style.color = v==='dark' || v==='crimson' ? '#fff' : '#000'; });
  </script>
</body>
</html>`;
  };

  const exportHtmlPreviewFile = () => {
    const html = generateHtmlPreviewString();
    downloadFile('animation-preview.html', html, 'text/html;charset=utf-8');
  };

  const themeClass = editorTheme === 'crimson' ? 'editor-crimson' : (editorTheme === 'dark' ? 'editor-dark' : 'editor-light');
  // compute major/minor ticks based on timeline duration so ruler adapts
  const computeTicks = (duration: number) => {
    const candidates = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    const preferred = candidates.find(c => duration / c <= 12) || 1000;
    const major = preferred;
    const minor = Math.max(1, Math.round(major / 2));
    const majors: number[] = [];
    for (let t = 0; t <= duration; t += major) majors.push(Math.round(t));
    const minors: number[] = [];
    for (let t = 0; t <= duration; t += minor) {
      if (t % major !== 0) minors.push(Math.round(t));
    }
    return { major, minor, majors, minors };
  };
  const { majors: ticksMajorAll, minors: ticksMinorAll } = computeTicks(timelineDuration);
  // limit number of major tick labels to avoid overlap
  const maxLabels = 10;
  const ticksMajor = ticksMajorAll.length > maxLabels ? ticksMajorAll.filter((_, i) => i % Math.ceil(ticksMajorAll.length / maxLabels) === 0) : ticksMajorAll;
  const ticksMinor = ticksMinorAll;
  const fmtTime = (ms: number) => ms >= 1000 ? `${(ms/1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`;
  const rootClass = mode === 'embedded'
    ? `animation-studio-root ${themeClass}`
    : `animation-builder fixed right-4 top-4 z-50 w-[min(980px,96vw)] max-h-[92vh] overflow-auto rounded shadow-lg p-4 grid gap-3 ${themeClass}`;

  if (!visible) {
    return (
      <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60 }}>
        <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={()=>{ setVisible(true); setLiveMessage('Editor mostrado'); }}>Mostrar Editor</button>
      </div>
    );
  }

  return (
  <div ref={rootRef} className={rootClass} style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(260px, 1fr)` }} tabIndex={0}>
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Animation Builder</h3>
        <div className="ml-auto flex gap-2 items-center controls">
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={previewAsScroll} onChange={e=>setPreviewAsScroll(e.target.checked)} /> Preview as scroll</label>
          <div className="flex items-center gap-2">
            <span className="text-sm">Tema</span>
            <div role="radiogroup" aria-label="Tema del editor" className="flex gap-1">
              <button aria-pressed={editorTheme==='light'} onClick={()=>{ setEditorTheme('light'); setLiveMessage('Tema cambiado a light'); }} className={editorTheme==='light' ? 'primary' : ''}>Light</button>
              <button aria-pressed={editorTheme==='dark'} onClick={()=>{ setEditorTheme('dark'); setLiveMessage('Tema cambiado a dark'); }} className={editorTheme==='dark' ? 'primary' : ''}>Dark</button>
              <button aria-pressed={editorTheme==='crimson'} onClick={()=>{ setEditorTheme('crimson'); setLiveMessage('Tema cambiado a carmesí'); }} className={editorTheme==='crimson' ? 'primary' : ''}>Carmesí</button>
            </div>
          </div>
          <button className="px-2 py-1 bg-gray-700 text-white rounded" onClick={()=>setUiCollapsed(u=>!u)}>{uiCollapsed ? 'Mostrar UI' : 'Ocultar UI'}</button>
          <div className="ml-1 border-l pl-2">
            <button className="px-2 py-1 bg-transparent text-sm" onClick={()=>setPanels(p=>({ ...p, timeline: !p.timeline }))}>{panels.timeline ? 'Ocultar timeline' : 'Mostrar timeline'}</button>
            <button className="px-2 py-1 bg-transparent text-sm" onClick={()=>setPanels(p=>({ ...p, layers: !p.layers }))}>{panels.layers ? 'Ocultar layers' : 'Mostrar layers'}</button>
          </div>
          <button title="Abrir Studio" className="px-2 py-1 bg-indigo-600 text-white rounded" onClick={()=>{ window.dispatchEvent(new CustomEvent('open-animation-studio')); setLiveMessage('Abriendo editor completo'); }}>Abrir Studio</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={play} disabled={playing}>Play</button>
          <button className="px-3 py-1 bg-gray-300 rounded" onClick={pause} disabled={!playing}>Pause</button>
          <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={stop}>Stop</button>
        </div>
  </div>
  {/* ARIA live region for announcements */}
  <div aria-live="polite" className="sr-only">{liveMessage}</div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(260px, 1fr)` }}>
        <div>
          <div ref={containerRef} className="preview-container relative bg-black rounded h-72 overflow-hidden" style={{ minHeight: 240 }}>
            <canvas ref={canvasRef} />
            {/* overlay draggable elements */}
            {layers.map(layer => (
              <div key={layer.id}
                role="group"
                aria-label={`Layer ${layer.label}`}
                onPointerDown={(e)=>{
                  // start dragging overlay element
                  const el = e.currentTarget as HTMLElement;
                  el.setPointerCapture(e.pointerId);
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const startX = e.clientX; const startY = e.clientY;
                  const startLeft = ((layer.x ?? 50)/100) * rect.width;
                  const startTop = ((layer.y ?? 50)/100) * rect.height;
                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX; const dy = ev.clientY - startY;
                    const nx = ((startLeft + dx)/rect.width)*100;
                    const ny = ((startTop + dy)/rect.height)*100;
                    setLayer(layer.id, { x: Math.max(0, Math.min(100, nx)), y: Math.max(0, Math.min(100, ny)) });
                  };
                  const onUp = () => {
                    try { el.releasePointerCapture(e.pointerId); } catch {}
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                className="preview-layer-overlay absolute border border-white/20 bg-white/5 rounded cursor-grab"
                style={{
                  left: `${layer.x ?? 50}%`,
                  top: `${layer.y ?? 50}%`,
                  width: `${layer.w ?? 60}%`,
                  height: `${layer.h ?? 30}%`,
                  transform: 'translate(-50%, -50%)',
                  display: layer.visible ? 'block' : 'none'
                }}>
                <div className="w-full h-full flex items-center justify-center text-xs text-white/90">{layer.label}</div>
              </div>
            ))}
          </div>

          {panels.timeline && (
            <div className="timeline mt-2 p-2 border rounded bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <label>Duration (ms)</label>
                <input type="number" value={timelineDuration} onChange={e=>setTimelineDuration(Number(e.target.value))} className="p-1 border rounded w-28" />
                <label className="flex items-center gap-1"><input type="checkbox" checked={snapEnabled} onChange={e=>setSnapEnabled(e.target.checked)} /> Snap</label>
                <input type="number" value={snapInterval} onChange={e=>setSnapInterval(Number(e.target.value))} className="p-1 border rounded w-20" />
                <label className="flex items-center gap-1">Zoom
                  <input type="range" min={0.5} max={4} step={0.1} value={timelineZoom} onChange={e=>setTimelineZoom(Number(e.target.value))} className="w-24" />
                </label>
                <div className="ml-auto text-sm">Time: {Math.round(currentTime)}ms</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted">Atajos: A = añadir keyframe (cuando uno está seleccionado), ←/→ mover (Shift=100ms), Enter seleccionar, Supr borrar</div>
                {layers.map((layer) => (
                  <div key={layer.id} role="region" aria-label={`Pista de tiempo ${layer.label}`} className="timeline-track relative panel p-1" onPointerMove={onTimelinePointerMove} onPointerUp={onTimelinePointerUp}>
                    <div className="text-sm font-medium">{layer.label} {layer.visible ? '' : '(hidden)'}</div>
                    {/* ruler */}
                    <div className="timeline-ruler relative h-6 mb-1" aria-hidden>
                      {ticksMinor.map(t => (
                        <div key={`m-${t}`} className="tick minor" style={{ position: 'absolute', left: `${clamp(t / timelineDuration, 0, 1) * 100}%`, top: 0 }} />
                      ))}
                      {ticksMajor.map(t => (
                        <div key={`M-${t}`} className="tick major" style={{ position: 'absolute', left: `${clamp(t / timelineDuration, 0, 1) * 100}%`, top: 0 }}>
                          <div className="tick-line" />
                          <div className="tick-label">{fmtTime(t)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 36, position: 'relative', overflowX: 'auto' }}>
                      <div className="timeline-track-inner" style={{ position: 'relative', height: '100%', width: `${timelineZoom * 100}%` }}>
                        {layer.keyframes.map(k => (
                          <div key={k.id}
                            onPointerDown={(e)=>onTimelinePointerDown(e, layer.id, k.id)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selectedKF && selectedKF.layerId === layer.id && selectedKF.kfId === k.id ? 'true' : 'false'}
                            onFocus={()=>{ setSelectedKF({layerId: layer.id, kfId: k.id}); setLiveMessage(`Keyframe seleccionado: ${layer.label} @ ${k.time}ms`); }}
                            onKeyDown={(ev)=>{
                              if (ev.key === 'Enter') { setSelectedKF({layerId: layer.id, kfId: k.id}); setLiveMessage('Keyframe seleccionado'); }
                              if(ev.key === 'ArrowLeft') { updateKeyframe(layer.id,k.id,{time: Math.max(0, k.time - (ev.shiftKey?100:10))}); setLiveMessage('Keyframe movido'); ev.preventDefault(); }
                              if(ev.key === 'ArrowRight') { updateKeyframe(layer.id,k.id,{time: Math.min(timelineDuration, k.time + (ev.shiftKey?100:10))}); setLiveMessage('Keyframe movido'); ev.preventDefault(); }
                              if(ev.key === 'Delete' || ev.key === 'Backspace') { removeKeyframe(layer.id, k.id); setSelectedKF(null); setLiveMessage('Keyframe eliminado'); ev.preventDefault(); }
                              if(ev.key === '+' || ev.key === '=') { updateKeyframe(layer.id,k.id,{time: Math.min(timelineDuration, k.time + (ev.shiftKey?100:10))}); setLiveMessage('Keyframe movido'); ev.preventDefault(); }
                              if(ev.key === '-') { updateKeyframe(layer.id,k.id,{time: Math.max(0, k.time - (ev.shiftKey?100:10))}); setLiveMessage('Keyframe movido'); ev.preventDefault(); }
                            }}
                            className="timeline-keyframe absolute top-1/2 -translate-y-1/2 bg-blue-500 rounded-full w-3 h-3 cursor-grab"
                            style={{ left: `${clamp(k.time/timelineDuration,0,1)*100}%` }}
                            title={`${k.time}ms`} />
                          ))}

                        {/* scrubber */}
                        <div
                          className="timeline-scrubber absolute top-0 bottom-0 w-1 bg-red-500"
                          style={{ left: `${clamp(currentTime/timelineDuration,0,1)*100}%`, transform: 'translateX(-50%)' }}
                          onPointerDown={onScrubPointerDown}
                          onPointerMove={onScrubPointerMove}
                          onPointerUp={onScrubPointerUp}
                          title={`Current time: ${Math.round(currentTime)}ms`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* resizer between panels */}
        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={onResizerPointerDown}
          onKeyDown={(e)=>{
            if (e.key === 'ArrowLeft') setLeftWidth(w => Math.max(320, w - (e.shiftKey ? 32 : 8)));
            if (e.key === 'ArrowRight') setLeftWidth(w => Math.min((rootRef.current?.getBoundingClientRect().width || 1200) - 320, w + (e.shiftKey ? 32 : 8)));
          }}
          aria-label="Redimensionar panel"
        />

  { !uiCollapsed ? (
  <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <strong>Layers</strong>
              <div className="flex items-center gap-2 text-xs">
                {selectedKF ? <div className="px-2 py-1 bg-yellow-100 rounded">Selected: {(() => { const l = layers.find(x=>x.id===selectedKF!.layerId); const k = l?.keyframes.find(x=>x.id===selectedKF!.kfId); return `${l?.label || selectedKF!.layerId} @ ${k?.time ?? '?'}ms`; })()}</div> : null}
                <div className="flex gap-2">
                <button className="text-xs px-2 py-1 bg-green-600 text-white rounded" onClick={addLayer}>Add</button>
                <button className="text-xs px-2 py-1 bg-gray-200 rounded" onClick={()=>{ setLayers([defaultLayer(), {...defaultLayer(), label:'Foreground', depth:0.9 }]); }}>Reset</button>
                </div>
              </div>
            </div>

            <div className="mt-2 space-y-2 max-h-48 overflow-auto">
              {layers.map(layer => (
                <div key={layer.id} className="border rounded p-2">
                  <div className="flex items-center gap-2">
                    <input className="flex-1 p-1" value={layer.label} onChange={e=>setLayer(layer.id,{label:e.target.value})} />
                    <button className="text-xs text-red-500" onClick={()=>removeLayer(layer.id)}>Delete</button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <label className="flex flex-col"><span className="text-xs">Visible</span>
                      <input type="checkbox" checked={!!layer.visible} onChange={e=>setLayer(layer.id,{visible:e.target.checked})} />
                    </label>
                    <label className="flex flex-col"><span className="text-xs">Depth</span>
                      <input type="range" min={0} max={1} step={0.01} value={layer.depth} onChange={e=>setLayer(layer.id,{depth:Number(e.target.value)})} />
                    </label>
                    <label className="flex flex-col"><span className="text-xs">Color</span>
                      <input type="color" value={layer.color} onChange={e=>setLayer(layer.id,{color:e.target.value})} />
                    </label>
                    <label className="flex flex-col"><span className="text-xs">Image</span>
                      <input type="file" accept="image/*" onChange={e=>setLayerImageFile(layer.id, e.target.files ? e.target.files[0] : null)} />
                    </label>
                    <label className="flex flex-col"><span className="text-xs">Layout (x,y,w,h %)</span>
                      <div className="flex gap-1">
                        <input type="number" value={layer.x} onChange={e=>setLayer(layer.id,{x: Number(e.target.value)})} className="p-1 w-14" />
                        <input type="number" value={layer.y} onChange={e=>setLayer(layer.id,{y: Number(e.target.value)})} className="p-1 w-14" />
                        <input type="number" value={layer.w} onChange={e=>setLayer(layer.id,{w: Number(e.target.value)})} className="p-1 w-14" />
                        <input type="number" value={layer.h} onChange={e=>setLayer(layer.id,{h: Number(e.target.value)})} className="p-1 w-14" />
                      </div>
                    </label>
                  </div>

                  <div className="mt-2 text-xs">Keyframes:</div>
                  <div className="space-y-1">
                    {layer.keyframes.map(k => (
                      <div key={k.id} className="flex items-center gap-2">
                        <input aria-label="time" type="number" value={k.time} onChange={e=>updateKeyframe(layer.id,k.id,{time:Number(e.target.value)})} className="p-1 w-20" />
                        <input aria-label="translate" type="number" value={k.translate} onChange={e=>updateKeyframe(layer.id,k.id,{translate:Number(e.target.value)})} className="p-1 w-20" />
                        <input aria-label="opacity" type="number" step={0.01} min={0} max={1} value={k.opacity} onChange={e=>updateKeyframe(layer.id,k.id,{opacity:Number(e.target.value)})} className="p-1 w-20" />
                        <input aria-label="easing" placeholder="easing (linear|ease|ease-in|ease-out)" value={k.easing||'linear'} onChange={e=>updateKeyframe(layer.id,k.id,{easing:e.target.value})} className="p-1 w-28" />
                        <button className="text-xs text-red-500" onClick={()=>removeKeyframe(layer.id,k.id)}>✕</button>
                      </div>
                    ))}
                    <div className="mt-1">
                      <button className="text-xs px-2 py-1 bg-gray-200 rounded" onClick={()=>addKeyframe(layer.id)}>Add Keyframe</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded p-2">
            <strong>Presets</strong>
            <div className="mt-2 flex gap-2">
              <input id="presetName" placeholder="name" className="p-1 border rounded flex-1" />
              <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={()=>{ const el = document.getElementById('presetName') as HTMLInputElement | null; if(el && el.value) savePreset(el.value); }}>Save</button>
            </div>
            <div className="mt-2 space-y-1">
              {presets.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">{p.name}</div>
                  <button className="text-xs px-2 py-1 bg-gray-200 rounded" onClick={()=>loadPreset(i)}>Load</button>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded p-2">
            <strong>Export</strong>
            <div className="mt-2 flex gap-2 flex-wrap">
                <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportJSON}>Export JSON</button>
                <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportSnippet}>Export Snippet</button>
                <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportReactComponent}>Copy React Component</button>
                <button className="px-2 py-1 bg-blue-600 text-white rounded" onClick={exportReactComponentFile}>Download .tsx</button>
                <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={exportHtmlPreviewFile}>Download HTML Preview</button>
              </div>
          </div>
        </div>
        ) : (
          <div className="flex items-center px-2">
            <button className="px-2 py-1 bg-gray-700 text-white rounded" onClick={()=>setUiCollapsed(false)}>Mostrar menú</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimationBuilder;
