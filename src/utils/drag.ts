import type React from 'react';

/**
 * Tažení jezdcem (myš i prst): zachytí ukazatel na prvku, takže pohyb jde jen sem, a vždy uklidí –
 * i když prohlížeč gesto zruší (pointercancel: na dotykové obrazovce ho začne brát jako posun
 * stránky). Dřív zůstávaly posluchače na window viset a další tah kdekoli hýbal i jiným jezdcem.
 * Prvek jezdce má mít touch-action: none.
 */
export function startDrag(
  e: React.PointerEvent<HTMLElement>,
  onMove: (clientX: number, clientY: number) => void,
  onEnd?: (clientX: number, clientY: number, cancelled: boolean) => void,
) {
  if (e.button !== 0) return;
  const el = e.currentTarget;
  const id = e.pointerId;
  try { el.setPointerCapture(id); } catch { /* ukazatel už neexistuje */ }
  onMove(e.clientX, e.clientY);

  const move = (ev: PointerEvent) => { if (ev.pointerId === id) onMove(ev.clientX, ev.clientY); };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', finish);
    el.removeEventListener('pointercancel', finish);
    el.removeEventListener('lostpointercapture', finish);
    try { el.releasePointerCapture(id); } catch { /* už uvolněno */ }
    onEnd?.(ev.clientX, ev.clientY, ev.type !== 'pointerup');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
  el.addEventListener('lostpointercapture', finish);
}
