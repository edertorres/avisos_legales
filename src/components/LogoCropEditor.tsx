import React, { useEffect, useRef, useState } from 'react';
import { contentBounds, type CropRect } from '../utils/logoCrop';

export function LogoCropEditor({ src, initialCrop, onApply, onCancel }: {
  src: string; initialCrop?: CropRect;
  onApply: (dataUrl: string, crop: CropRect) => void; onCancel: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; crop: CropRect; handle: string } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [error, setError] = useState('');
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || []) as HTMLElement[];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); previousFocus?.focus(); };
  }, [onCancel]);
  const canvas = () => {
    const element = document.createElement('canvas'); element.width = size.width; element.height = size.height;
    const context = element.getContext('2d');
    if (!context || !imageRef.current || !size.width) throw new Error('La imagen todavía no está lista.');
    context.drawImage(imageRef.current, 0, 0);
    return { element, context };
  };
  const start = (event: React.PointerEvent, handle: string) => {
    if (!size.width) return;
    event.preventDefault(); event.stopPropagation();
    areaRef.current?.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop, handle };
  };
  const move = (event: React.PointerEvent) => {
    const state = drag.current, bounds = areaRef.current?.getBoundingClientRect();
    if (!state || !bounds) return;
    const dx = Math.round((event.clientX - state.x) * size.width / bounds.width);
    const dy = Math.round((event.clientY - state.y) * size.height / bounds.height);
    const c = state.crop;
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    if (state.handle === 'move') {
      setCrop({ ...c, x: clamp(c.x + dx, 0, size.width - c.width), y: clamp(c.y + dy, 0, size.height - c.height) });
    } else {
      let left = c.x, right = c.x + c.width, top = c.y, bottom = c.y + c.height;
      if (state.handle.includes('w')) left = clamp(left + dx, 0, right - 1);
      if (state.handle.includes('e')) right = clamp(right + dx, left + 1, size.width);
      if (state.handle.includes('n')) top = clamp(top + dy, 0, bottom - 1);
      if (state.handle.includes('s')) bottom = clamp(bottom + dy, top + 1, size.height);
      setCrop({ x: left, y: top, width: right - left, height: bottom - top });
    }
  };
  const autoCrop = () => {
    try {
      const { context } = canvas();
      const rect = contentBounds(context.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
      if (!rect) { setError('No se detectó contenido: ajusta el recorte manualmente.'); return; }
      setCrop(rect); setError('');
    } catch (e) { setError((e as Error).message); }
  };
  const apply = () => {
    try {
      const { element } = canvas();
      const output = document.createElement('canvas'); output.width = crop.width; output.height = crop.height;
      const context = output.getContext('2d'); if (!context) throw new Error('No se pudo recortar la imagen.');
      context.drawImage(element, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      onApply(output.toDataURL('image/png'), crop);
    } catch (e) { setError((e as Error).message); }
  };
  const btn = 'rounded border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-40';
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Recortar logo del aviso actual" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[95vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <h2 className="text-lg font-bold">Recortar logo de este aviso</h2>
      <p className="my-3 text-sm">Arrastra el rectángulo para moverlo y sus bordes para ajustar el recorte. El original se conserva.</p>
      <div className="flex justify-center overflow-hidden rounded bg-stone-100 p-4">
        <div ref={areaRef} style={{ position: 'relative', lineHeight: 0, touchAction: 'none', maxWidth: '100%' }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <img ref={imageRef} src={src} alt="Logo original para recortar" draggable={false} style={{ maxWidth: '100%', maxHeight: '45vh', display: 'block' }} onLoad={e => {
            const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
            setSize({ width, height });
            setCrop(initialCrop && initialCrop.x + initialCrop.width <= width && initialCrop.y + initialCrop.height <= height ? initialCrop : { x: 0, y: 0, width, height });
          }} onError={() => setError('No se pudo cargar el logo.')} />
          {size.width > 0 && <div onPointerDown={e => start(e, 'move')} style={{ position: 'absolute', left: `${crop.x / size.width * 100}%`, top: `${crop.y / size.height * 100}%`, width: `${crop.width / size.width * 100}%`, height: `${crop.height / size.height * 100}%`, border: '2px solid #059669', boxShadow: '0 0 0 2000px rgba(0,0,0,.35)', cursor: 'move', boxSizing: 'border-box' }}>
            {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => <span key={handle} onPointerDown={e => start(e, handle)} style={{ position: 'absolute', left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%', top: handle.includes('n') ? 0 : handle.includes('s') ? '100%' : '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, background: 'white', border: '2px solid #059669', cursor: `${handle}-resize` }} />)}
          </div>}
        </div>
      </div>
      <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['x', 'y', 'width', 'height'] as const).map((key, i) => <label key={key} className="text-xs">{['Izquierda (px)', 'Arriba (px)', 'Ancho (px)', 'Alto (px)'][i]}<input type="number" className="mt-1 w-full rounded border p-2" min={key === 'width' || key === 'height' ? 1 : 0} max={key === 'x' ? size.width - crop.width : key === 'y' ? size.height - crop.height : key === 'width' ? size.width - crop.x : size.height - crop.y} value={crop[key]} onChange={e => {
        const max = key === 'x' ? size.width - crop.width : key === 'y' ? size.height - crop.height : key === 'width' ? size.width - crop.x : size.height - crop.y;
        setCrop({ ...crop, [key]: Math.max(key === 'width' || key === 'height' ? 1 : 0, Math.min(max, Math.round(Number(e.target.value)))) });
      }} /></label>)}</div>
      {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={!size.width} onClick={autoCrop}>Quitar márgenes automáticamente</button>
        <button className={btn} disabled={!size.width} onClick={() => setCrop({ x: 0, y: 0, ...size })}>Imagen completa</button>
        <button className={btn} onClick={onCancel} autoFocus>Cancelar</button>
        <button className={`${btn} !bg-accent-700 !text-white`} disabled={!size.width} onClick={apply}>Aplicar recorte</button>
      </div>
    </div>
  </div>;
}
