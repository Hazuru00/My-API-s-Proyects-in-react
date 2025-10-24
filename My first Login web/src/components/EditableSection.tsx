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
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineDuration, setTimelineDuration] = useState(2000); // ms
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapInterval, setSnapInterval] = useState(50); // ms
  const [timelineZoom, setTimelineZoom] = useState(1); // scale
  const [previewAsScroll, setPreviewAsScroll] = useState(false);
  const panels = { layers: true, timeline: true, settings: true };
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
  const imagesRef = useRef<Record<string, HTMLImageElement | null>>({});
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const [editorTheme, setEditorTheme] = useState<'light'|'dark'|'crimson'>(()=>{
    try { return (localStorage.getItem('animation-builder-theme') as 'light'|'dark'|'crimson') || 'light'; } catch { return 'light'; }
  });
  const [liveMessage, setLiveMessage] = useState('');
  const [selectedKF, setSelectedKF] = useState<{layerId:string;kfId:string}|null>(null);

  // persist editor theme
  useEffect(()=>{ try{ localStorage.setItem('animation-builder-theme', editorTheme); }catch{} }, [editorTheme]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
  const dragState = useRef<{ layerId: string; kfId: string; offsetX: number; rectLeft: number; rectWidth: number } | null>(null);

  const onTimelinePointerDown = (e: React.PointerEvent, layerId: string, kfId: string) => {
    const timeline = (e.currentTarget as HTMLElement).closest('.timeline-track') as HTMLElement | null;
    if (!timeline) return;
    const rect = timeline.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    // rectWidth should consider zoom
    const rectWidth = rect.width * timelineZoom;
    dragState.current = { layerId, kfId, offsetX, rectLeft: rect.left, rectWidth };
    setSelectedKF({layerId,kfId});
    setLiveMessage('Keyframe seleccionado');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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

      // draw image or box centered
      const cx = rect.width/2;
      const cy = rect.height/2 + translate;
      const w = rect.width*0.8;
      const h = rect.height*0.3;
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

  const exportJSON = () => { const json = JSON.stringify({ timelineDuration, layers }, null, 2); navigator.clipboard?.writeText(json); alert('JSON copiado'); };
  const exportSnippet = () => { const snippet = `const animation = ${JSON.stringify({ timelineDuration, layers }, null, 2)};`; navigator.clipboard?.writeText(snippet); alert('Snippet copiado'); };
  const exportReactComponent = () => {
    const cfg = JSON.stringify({ timelineDuration, layers }, null, 2);
    const component = `import React, { useEffect, useRef, useState } from 'react';

type KeyframePoint = { id: string; time: number; translate: number; opacity: number; easing?: string };
type LayerConfig = { id: string; label: string; depth: number; color: string; image?: string | null; visible?: boolean; keyframes: KeyframePoint[] };

const animation = ${cfg};

export default function ExportedAnimation({ width = 800, height = 400, autoplay = false, loop = false }: { width?: number; height?: number; autoplay?: boolean; loop?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(autoplay);
  const imgs: Record<string, HTMLImageElement> = {};

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
      <div style={{ marginTop: 8 }}>
        <button onClick={()=>setPlaying(true)}>Play</button>
        <button onClick={()=>setPlaying(false)}>Pause</button>
      </div>
    </div>
  );
}
`;
    navigator.clipboard?.writeText(component);
    alert('React component copiado al portapapeles');
  };

  const rootClass = mode === 'embedded'
    ? `animation-studio-root ${editorTheme === 'crimson' ? 'editor-crimson' : ''}`
    : `animation-builder fixed right-4 bottom-4 z-50 w-[min(920px,95vw)] max-h-[92vh] overflow-auto bg-white text-black rounded shadow-lg p-3 grid gap-3 ${editorTheme === 'crimson' ? 'editor-crimson' : ''}`;

  return (
    <div className={rootClass} style={{ gridTemplateColumns: '1fr' }}>
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Animation Builder</h3>
        <div className={`ml-auto flex gap-2 items-center ${editorTheme==='dark' ? 'bg-slate-800 text-white p-2 rounded' : ''}`}>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={previewAsScroll} onChange={e=>setPreviewAsScroll(e.target.checked)} /> Preview as scroll</label>
          <label className="flex items-center gap-2">
            <span className="text-sm">Tema</span>
            <select aria-label="Selector de tema del editor" value={editorTheme} onChange={e=>{ const v = e.target.value as 'light'|'dark'|'crimson'; setEditorTheme(v); setLiveMessage(`Tema cambiado a ${v}`); }} className="p-1 border rounded bg-white text-sm">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="crimson">Carmesí</option>
            </select>
          </label>
          <button title="Abrir Studio" className="px-2 py-1 bg-indigo-600 text-white rounded" onClick={()=>{ window.dispatchEvent(new CustomEvent('open-animation-studio')); setLiveMessage('Abriendo editor completo'); }}>Abrir Studio</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={play} disabled={playing}>Play</button>
          <button className="px-3 py-1 bg-gray-300 rounded" onClick={pause} disabled={!playing}>Pause</button>
          <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={stop}>Stop</button>
        </div>
  </div>
  {/* ARIA live region for announcements */}
  <div aria-live="polite" className="sr-only">{liveMessage}</div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <div ref={containerRef} className="preview-container relative bg-black rounded h-60 overflow-hidden">
            <canvas ref={canvasRef} />
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
                {layers.map((layer) => (
                  <div key={layer.id} className="timeline-track relative bg-white border rounded p-1" onPointerMove={onTimelinePointerMove} onPointerUp={onTimelinePointerUp}>
                    <div className="text-sm font-medium">{layer.label} {layer.visible ? '' : '(hidden)'}</div>
                    <div style={{ height: 36, position: 'relative' }}>
                      {layer.keyframes.map(k => (
                        <div key={k.id}
                          onPointerDown={(e)=>onTimelinePointerDown(e, layer.id, k.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev)=>{
                            if(ev.key === 'ArrowLeft') updateKeyframe(layer.id,k.id,{time: Math.max(0, k.time - (ev.shiftKey?100:10))});
                            if(ev.key === 'ArrowRight') updateKeyframe(layer.id,k.id,{time: Math.min(timelineDuration, k.time + (ev.shiftKey?100:10))});
                          }}
                          className="timeline-keyframe absolute top-1/2 -translate-y-1/2 bg-blue-500 rounded-full w-3 h-3 cursor-grab"
                          style={{ left: `${clamp(k.time/timelineDuration,0,1)*100}%` }}
                          title={`${k.time}ms`} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-1 space-y-2">
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
            <div className="mt-2 flex gap-2">
              <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportJSON}>Export JSON</button>
              <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportSnippet}>Export Snippet</button>
              <button className="px-2 py-1 bg-gray-200 rounded" onClick={exportReactComponent}>Export React Component</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimationBuilder;
