import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, MousePointer2, Type, Square, Circle, Pencil, ArrowRight, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Palette, ChevronDown, LayoutGrid, Play, ChevronLeft, ChevronRight as ChevronR, Bold, Italic, Underline, Layout, Download, Share2, Bell, CalendarPlus, Globe, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type ShapeType = 'sticky' | 'text' | 'rect' | 'rounded' | 'circle' | 'diamond' | 'triangle' | 'hexagon' | 'star' | 'parallelogram';
type Item = {
  id: string; type: ShapeType | 'image' | 'line' | 'curve';
  x: number; y: number; w: number; h: number;
  text: string; color: string; textColor?: string;
  fontSize?: number; fontFamily?: string; bold?: boolean; italic?: boolean; underline?: boolean;
  src?: string; rotation?: number;
  x2?: number; y2?: number; fromId?: string; toId?: string;
  points?: string;
};
type BoardData = { items: Item[] };
type Tool = 'select' | ShapeType | 'curve' | 'connect' | 'frame';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const PALETTE = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#e0f2fe', '#fed7aa', '#d1fae5', '#fecaca', '#e0e7ff'];
const SHAPE_KEYS: { type: ShapeType; key: string }[] = [
  { type: 'sticky', key: 'board.sticky' }, { type: 'rect', key: 'board.rect' },
  { type: 'rounded', key: 'board.rounded' }, { type: 'circle', key: 'board.circle' },
  { type: 'diamond', key: 'board.diamond' }, { type: 'triangle', key: 'board.triangle' },
  { type: 'hexagon', key: 'board.hexagon' }, { type: 'star', key: 'board.star' },
  { type: 'parallelogram', key: 'board.parallelogram' },
];

function parseBoard(c: string): BoardData {
  try { const m = c.match(/<!-- board:(.*?) -->/s); if (m) return JSON.parse(m[1]); } catch {}
  return { items: [] };
}
function saveBoard(d: BoardData, orig: string): string {
  return orig.replace(/<!-- board:.*?-->/s, '').trim() + '\n\n<!-- board:' + JSON.stringify(d) + ' -->';
}
function edgePoint(item: Item, tx: number, ty: number): { x: number; y: number } {
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  if (item.type === 'circle') {
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { x: cx + (dx / dist) * (item.w / 2), y: cy + (dy / dist) * (item.h / 2) };
  }
  const hw = item.w / 2, hh = item.h / 2, adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx * hh > ady * hw) return { x: cx + (dx > 0 ? hw : -hw), y: cy + (dy * hw) / adx };
  return { x: cx + (dx * hh) / ady, y: cy + (dy > 0 ? hh : -hh) };
}
function getLineEndpoints(item: Item, items: Item[]) {
  if (item.fromId && item.toId) {
    const from = items.find(i => i.id === item.fromId);
    const to = items.find(i => i.id === item.toId);
    if (from && to) {
      const a = edgePoint(from, to.x + to.w / 2, to.y + to.h / 2);
      const b = edgePoint(to, from.x + from.w / 2, from.y + from.h / 2);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
  }
  if (item.x2 !== undefined) return { x1: item.x, y1: item.y, x2: item.x2, y2: item.y2 };
  return { x1: item.x, y1: item.y, x2: item.x, y2: item.y };
}
function simplifyPath(points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const first = points[0], last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dx = last.x - first.x, dy = last.y - first.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq ? Math.max(0, Math.min(1, ((points[i].x - first.x) * dx + (points[i].y - first.y) * dy) / lenSq)) : 0;
    const d = Math.hypot(points[i].x - (first.x + t * dx), points[i].y - (first.y + t * dy));
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}
function freehandToPath(pts: string): string {
  let pairs = pts.trim().split(' ').map(p => { const [x, y] = p.split(',').map(Number); return { x, y }; }).filter(p => !isNaN(p.x) && !isNaN(p.y));
  if (pairs.length < 2) return '';
  pairs = simplifyPath(pairs, 6);
  if (pairs.length < 2) return '';
  if (pairs.length === 2) return `M ${pairs[0].x} ${pairs[0].y} L ${pairs[1].x} ${pairs[1].y}`;
  let d = `M ${pairs[0].x} ${pairs[0].y}`;
  for (let i = 0; i < pairs.length - 1; i++) {
    const p0 = pairs[Math.max(0, i - 1)], p1 = pairs[i], p2 = pairs[Math.min(pairs.length - 1, i + 1)], p3 = pairs[Math.min(pairs.length - 1, i + 2)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

type Props = { content: string; title?: string; onChange: (c: string) => void; onTitleChange?: (t: string) => void; readOnly?: boolean; noteId?: string };

export default function BoardEditor({ content, title: boardTitle, onChange, onTitleChange, readOnly, noteId }: Props) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<BoardData>(() => parseBoard(content));
  const [tool, setTool] = useState<Tool>('select');
  const [sels, setSels] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [hist, setHist] = useState<BoardData[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [color, setColor] = useState(PALETTE[0]);
  const [showColors, setShowColors] = useState(false);
  const [showTextFormat, setShowTextFormat] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [shapeTool, setShapeTool] = useState<ShapeType>('sticky');
  const [textFontFamily, setTextFontFamily] = useState('Arial');
  const [textFontSize, setTextFontSize] = useState(14);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [resizing, setResizing] = useState<{ id: string; handle: ResizeHandle; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
  const [anchorDrag, setAnchorDrag] = useState<{ lineId: string; end: 'start' | 'end' } | null>(null);
  const [rotating, setRotating] = useState<{ id: string; cx: number; cy: number; startAngle: number; origRotation: number } | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<number>(-1);
  const lastClickedItemId = useRef<string | null>(null);
  const contentRef = useRef(content); contentRef.current = content;
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const editJustSetRef = useRef(false);
  const [modalType, setModalType] = useState<'share' | 'reminder' | 'publish' | null>(null);
  const [ModalComp, setModalComp] = useState<React.ComponentType<any> | null>(null);
  const [publishSlug, setPublishSlug] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const openModal = async (type: 'share' | 'reminder' | 'publish') => {
    if (type === 'share') { const m = (await import('./ShareModal')).default; setModalComp(() => m); }
    else if (type === 'reminder') { const m = (await import('./ReminderModal')).default; setModalComp(() => m); }
    else if (type === 'publish') {
      setPublishSlug(null);
      setIsPublished(false);
      const m = (await import('./PublishModal')).default; setModalComp(() => m);
    }
    setModalType(type);
  };

  const push = (d: BoardData) => { setData(d); setHist(h => [...h.slice(0, histIdx + 1), data]); setHistIdx(i => i + 1); setSaveStatus('saving'); onChange(saveBoard(d, content)); setTimeout(() => setSaveStatus('saved'), 100); setTimeout(() => setSaveStatus('idle'), 2000); };
  const undo = () => { if (histIdx > 0) { const p = hist[histIdx - 1]; setData(p); setHistIdx(histIdx - 1); onChange(saveBoard(p, content)); } };
  const redo = () => { if (histIdx < hist.length - 1) { const n = hist[histIdx + 1]; setData(n); setHistIdx(histIdx + 1); onChange(saveBoard(n, content)); } };

  const getPos = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom };
  };

  const applyToSelected = (updates: Partial<Item>) => {
    const id = lastClickedItemId.current;
    if (!id) return;
    setData(prev => {
      const newItems = prev.items.map(i => i.id === id ? { ...i, ...updates } : i);
      setTimeout(() => onChange(saveBoard({ items: newItems }, contentRef.current)), 0);
      return { items: newItems };
    });
  };

  const bgDown = (e: React.MouseEvent) => {
    if (e.target !== ref.current) return;
    if (tool === 'curve') { setDrawingPoints(`${getPos(e).x},${getPos(e).y}`); return; }
    if (tool === 'shape') {
      const pos = getPos(e);
      const dims: Record<ShapeType, { w: number; h: number }> = { sticky: { w: 180, h: 140 }, text: { w: 180, h: 32 }, rect: { w: 160, h: 100 }, rounded: { w: 160, h: 100 }, circle: { w: 100, h: 100 }, diamond: { w: 120, h: 120 }, triangle: { w: 140, h: 120 }, hexagon: { w: 140, h: 120 }, star: { w: 130, h: 130 }, parallelogram: { w: 160, h: 100 } };
      const d = dims[shapeTool];
      const newId = `i-${Date.now()}`;
      push({ items: [...data.items, { id: newId, type: shapeTool, x: pos.x - d.w / 2, y: pos.y - d.h / 2, w: d.w, h: d.h, text: '', color, textColor: color, fontSize: textFontSize, fontFamily: textFontFamily, bold: textBold, italic: textItalic, underline: textUnderline }] });
      lastClickedItemId.current = newId;
      setSels(new Set([newId]));
      editJustSetRef.current = true;
      setEditId(newId);
      return;
    }
    if (tool === 'text') {
      const pos = getPos(e);
      const newId = `i-${Date.now()}`;
      push({ items: [...data.items, { id: newId, type: 'text', x: pos.x - 90, y: pos.y - 16, w: 180, h: 32, text: '', color, textColor: color, fontSize: textFontSize, fontFamily: textFontFamily, bold: textBold, italic: textItalic, underline: textUnderline }] });
      lastClickedItemId.current = newId;
      setSels(new Set([newId]));
      editJustSetRef.current = true;
      setEditId(newId);
      return;
    }
    if (tool === 'frame') {
      const pos = getPos(e);
      push({ items: [...data.items, { id: `frame-${Date.now()}`, type: 'frame', x: pos.x - 200, y: pos.y - 150, w: 400, h: 300, text: 'Frame', color: '#7C5CFF', fontSize: 14 }] });
      return;
    }
    if (tool === 'select') { setSels(new Set()); setEditId(null); setPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  };

  const onMove = useCallback((e: React.MouseEvent) => {
    if (panning) { setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); return; }
    if (resizing) {
      const pos = getPos(e);
      const dx = pos.x - resizing.startX, dy = pos.y - resizing.startY;
      const { handle, origX: ox, origY: oy, origW: ow, origH: oh } = resizing;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (handle.includes('e')) nw = Math.max(30, ow + dx);
      if (handle.includes('w')) { nw = Math.max(30, ow - dx); nx = ox + ow - nw; }
      if (handle.includes('s')) nh = Math.max(30, oh + dy);
      if (handle.includes('n')) { nh = Math.max(30, oh - dy); ny = oy + oh - nh; }
      if (handle === 'n' || handle === 's') { nx = ox; nw = ow; }
      if (handle === 'e' || handle === 'w') { ny = oy; nh = oh; }
      setData(d => ({ ...d, items: d.items.map(i => i.id === resizing.id ? { ...i, x: nx, y: ny, w: nw, h: nh } : i) }));
      return;
    }
    if (rotating) {
      const pos = getPos(e);
      const angle = Math.atan2(pos.y - rotating.cy, pos.x - rotating.cx) * (180 / Math.PI);
      setData(d => ({ ...d, items: d.items.map(i => i.id !== rotating.id ? i : { ...i, rotation: Math.round(angle - rotating.startAngle + rotating.origRotation) }) }));
      return;
    }
    if (drag) {
      const pos = getPos(e);
      const nx = pos.x - off.x, ny = pos.y - off.y;
      setData(d => {
        const dragged = d.items.find(i => i.id === drag);
        if (!dragged) return d;
        const group = sels.has(drag) && sels.size > 1 ? sels : new Set([drag]);
        if (dragged.type === 'frame') {
          d.items.forEach(i => { if (i.id !== dragged.id && i.type !== 'frame' && i.x + i.w / 2 > dragged.x && i.x + i.w / 2 < dragged.x + dragged.w && i.y + i.h / 2 > dragged.y && i.y + i.h / 2 < dragged.y + dragged.h) group.add(i.id); });
        }
        const dx = nx - dragged.x, dy = ny - dragged.y;
        return { ...d, items: d.items.map(i => {
          if (!group.has(i.id)) return i;
          if (i.type === 'line') return { ...i, x: i.x + dx, y: i.y + dy, x2: (i.x2 ?? i.x) + dx, y2: (i.y2 ?? i.y) + dy, fromId: undefined, toId: undefined };
          if (i.type === 'curve' && i.points) {
            const pts = i.points.trim().split(' ').map(p => { const [px, py] = p.split(',').map(Number); return `${px + dx},${py + dy}`; }).join(' ');
            return { ...i, x: i.x + dx, y: i.y + dy, points: pts };
          }
          return { ...i, x: i.x + dx, y: i.y + dy };
        }) };
      });
    }
    if (anchorDrag) {
      const pos = getPos(e);
      setData(d => ({
        ...d, items: d.items.map(i => {
          if (i.id !== anchorDrag.lineId) return i;
          if (anchorDrag.end === 'start') return { ...i, x: pos.x, y: pos.y, fromId: undefined };
          return { ...i, x2: pos.x, y2: pos.y, toId: undefined };
        })
      }));
      return;
    }
    if (drawingPoints) { const pos = getPos(e); setDrawingPoints(prev => prev ? `${prev} ${pos.x},${pos.y}` : prev); }
  }, [panning, pan, zoom, drag, off, drawingPoints, resizing, rotating, panStart, anchorDrag]);

  const onUp = useCallback(() => {
    if (resizing) { push({ items: data.items }); setResizing(null); }
    if (anchorDrag) { push({ items: data.items }); setAnchorDrag(null); }
    if (rotating) { push({ items: data.items }); setRotating(null); }
    if (drag) { onChange(saveBoard(data, content)); }
    if (drawingPoints) {
      const pairs = drawingPoints.trim().split(' ');
      if (pairs.length > 3) {
        const coords = pairs.flatMap(p => p.split(',').map(Number));
        const xs = coords.filter((_, i) => i % 2 === 0), ys = coords.filter((_, i) => i % 2 === 1);
        push({ items: [...data.items, { id: `curve-${Date.now()}`, type: 'curve', x: Math.min(...xs), y: Math.min(...ys), w: Math.max(Math.max(...xs) - Math.min(...xs), 10), h: Math.max(Math.max(...ys) - Math.min(...ys), 10), text: '', color, points: drawingPoints }] });
      }
      setDrawingPoints(null);
    }
    setPanning(false); setDrag(null);
  }, [drag, data, content, onChange, drawingPoints, color, resizing, anchorDrag, rotating]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.2, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const itemDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (readOnly) return;
    if (tool === 'connect') {
      if (!connectFrom) { setConnectFrom(id); lastClickedItemId.current = id; setSels(new Set([id])); }
      else if (connectFrom !== id) {
        const from = data.items.find(i => i.id === connectFrom);
        const to = data.items.find(i => i.id === id);
        if (from && to) {
          const fc = edgePoint(from, to.x + to.w / 2, to.y + to.h / 2);
          const tc = edgePoint(to, from.x + from.w / 2, from.y + from.h / 2);
          push({ items: [...data.items, { id: `line-${Date.now()}`, type: 'line', x: fc.x, y: fc.y, w: 0, h: 0, text: '', color, x2: tc.x, y2: tc.y, fromId: connectFrom, toId: id }] });
        }
        setConnectFrom(null); setSels(new Set());
      }
      return;
    }
    if (e.shiftKey) setSels(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    else setSels(new Set([id]));
    lastClickedItemId.current = id;
    const item = data.items.find(i => i.id === id);
    if (item) {
      const pos = getPos(e);
      if (item.type === 'line' || item.type === 'curve') {
        const ep = getLineEndpoints(item, data.items);
        setDrag(id); setOff({ x: pos.x - ep.x1, y: pos.y - ep.y1 });
      } else {
        setDrag(id); setOff({ x: pos.x - item.x, y: pos.y - item.y });
      }
    }
  };

  const lineClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tool !== 'select') return;
    if (e.shiftKey) setSels(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    else setSels(new Set([id]));
    lastClickedItemId.current = id;
    const item = data.items.find(i => i.id === id);
    if (item) {
      const pos = getPos(e);
      const ep = getLineEndpoints(item, data.items);
      setDrag(id); setOff({ x: pos.x - ep.x1, y: pos.y - ep.y1 });
    }
  };

  const handleDown = (e: React.MouseEvent, id: string, handle: ResizeHandle) => {
    e.stopPropagation();
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    const pos = getPos(e);
    setResizing({ id, handle, startX: pos.x, startY: pos.y, origX: item.x, origY: item.y, origW: item.w, origH: item.h });
  };

  const delSel = () => { if (sels.size === 0) return; push({ items: data.items.filter(i => !sels.has(i.id)) }); setSels(new Set()); };
  const updateText = (id: string, v: string) => push({ items: data.items.map(i => i.id === id ? { ...i, text: v } : i) });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnly || editId) return;
      const code = e.code, ctrl = e.ctrlKey || e.metaKey;
      if (code === 'Delete' || code === 'Backspace') { if (sels.size > 0) { e.preventDefault(); push({ items: data.items.filter(i => !sels.has(i.id)) }); setSels(new Set()); } }
      if (code === 'Escape') { setSels(new Set()); setTool('select'); setConnectFrom(null); setEditId(null); }
      if (ctrl && code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (ctrl && (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (ctrl && code === 'KeyA') { e.preventDefault(); setSels(new Set(data.items.map(i => i.id))); }
      if (ctrl && code === 'KeyD') { e.preventDefault(); if (sels.size > 0) { const dupes = data.items.filter(i => sels.has(i.id)).map(i => ({ ...i, id: `${i.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x: i.x + 20, y: i.y + 20, x2: i.x2 != null ? i.x2 + 20 : undefined, y2: i.y2 != null ? i.y2 + 20 : undefined, fromId: undefined, toId: undefined })); setData(d => ({ ...d, items: [...d.items, ...dupes] })); setSels(new Set(dupes.map(d => d.id))); } }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [readOnly, editId]);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const h = (e: MouseEvent) => { const t = e.target as HTMLElement; const lid = t?.getAttribute?.('data-line-id'); if (lid) { e.stopPropagation(); setSels(new Set([lid])); setDrag(lid); lastClickedItemId.current = lid; } };
    el.addEventListener('mousedown', h, true);
    return () => el.removeEventListener('mousedown', h, true);
  }, []);

  useEffect(() => {
    if (editJustSetRef.current && editId) {
      editJustSetRef.current = false;
      requestAnimationFrame(() => {
        editInputRef.current?.focus();
      });
    }
  }, [editId]);

  useEffect(() => {
    const id = lastClickedItemId.current;
    if (!id) return;
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    setTextFontFamily(item.fontFamily || 'Arial');
    setTextFontSize(item.fontSize || 14);
    setTextBold(item.bold || false);
    setTextItalic(item.italic || false);
    setTextUnderline(item.underline || false);
    setColor(item.color);
  }, [sels, data]);

  const handlePositions = (item: Item) => {
    const { x, y, w, h } = item;
    return [
      { pos: { left: x - 5, top: y - 5 }, handle: 'nw' as ResizeHandle, cursor: 'nwse-resize' },
      { pos: { left: x + w / 2 - 5, top: y - 5 }, handle: 'n' as ResizeHandle, cursor: 'ns-resize' },
      { pos: { left: x + w - 5, top: y - 5 }, handle: 'ne' as ResizeHandle, cursor: 'nesw-resize' },
      { pos: { left: x + w - 5, top: y + h / 2 - 5 }, handle: 'e' as ResizeHandle, cursor: 'ew-resize' },
      { pos: { left: x + w - 5, top: y + h - 5 }, handle: 'se' as ResizeHandle, cursor: 'nwse-resize' },
      { pos: { left: x + w / 2 - 5, top: y + h - 5 }, handle: 's' as ResizeHandle, cursor: 'ns-resize' },
      { pos: { left: x - 5, top: y + h - 5 }, handle: 'sw' as ResizeHandle, cursor: 'nesw-resize' },
      { pos: { left: x - 5, top: y + h / 2 - 5 }, handle: 'w' as ResizeHandle, cursor: 'ew-resize' },
    ];
  };

  const handleFileDrop = (files: FileList, e?: React.DragEvent) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxW = 300, maxH = 300;
          let w = img.width, h = img.height;
          if (w > maxW) { h *= maxW / w; w = maxW; }
          if (h > maxH) { w *= maxH / h; h = maxH; }
          const x = e ? getPos(e).x - w / 2 : (pan.x * -1 + 300) / zoom;
          const y = e ? getPos(e).y - h / 2 : (pan.y * -1 + 200) / zoom;
          push({ items: [...data.items, { id: `img-${Date.now()}`, type: 'image', x, y, w: Math.round(w), h: Math.round(h), text: '', color: PALETTE[0], src }] });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  };

  const exportPDF = () => {
    const captureAndDownload = async () => {
      try {
        if (!ref.current) return;
        const items = data.items;
        if (items.length === 0) return;

        const padding = 60;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const it of items) {
          if (it.type === 'line') {
            const ep = getLineEndpoints(it, items);
            minX = Math.min(minX, ep.x1, ep.x2); minY = Math.min(minY, ep.y1, ep.y2);
            maxX = Math.max(maxX, ep.x1, ep.x2); maxY = Math.max(maxY, ep.y1, ep.y2);
          } else {
            minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
            maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h);
          }
        }
        const bw = maxX - minX + padding * 2, bh = maxY - minY + padding * 2;

        // Draw everything on a manual canvas
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = bw * scale; canvas.height = bh * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#f5f0eb';
        ctx.fillRect(0, 0, bw, bh);

        // Draw grid dots
        ctx.fillStyle = '#d4cdc4';
        for (let x = 0; x < bw; x += 24) for (let y = 0; y < bh; y += 24) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }

        const ox = -minX + padding, oy = -minY + padding;

        // Draw lines/arrows
        for (const item of items.filter(i => i.type === 'line')) {
          const ep = getLineEndpoints(item, items);
          ctx.strokeStyle = item.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ep.x1 + ox, ep.y1 + oy); ctx.lineTo(ep.x2 + ox, ep.y2 + oy); ctx.stroke();
          // Arrowhead
          const dx = ep.x2 - ep.x1, dy = ep.y2 - ep.y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len, uy = dy / len, px = -uy, py = ux;
          ctx.fillStyle = item.color; ctx.beginPath();
          ctx.moveTo(ep.x2 + ox, ep.y2 + oy);
          ctx.lineTo(ep.x2 - ux * 10 + px * 5 + ox, ep.y2 - uy * 10 + py * 5 + oy);
          ctx.lineTo(ep.x2 - ux * 10 - px * 5 + ox, ep.y2 - uy * 10 - py * 5 + oy);
          ctx.closePath(); ctx.fill();
        }

        // Draw curves
        for (const item of items.filter(i => i.type === 'curve' && i.points)) {
          const path = new Path2D(freehandToPath(item.points!));
          ctx.save(); ctx.translate(ox, oy);
          ctx.strokeStyle = item.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.stroke(path); ctx.restore();
        }

        // Draw shapes (excluding lines/curves/frames)
        const clipPaths: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
          diamond: (c, w, h) => { c.moveTo(w / 2, 0); c.lineTo(w, h / 2); c.lineTo(w / 2, h); c.lineTo(0, h / 2); c.closePath(); },
          triangle: (c, w, h) => { c.moveTo(w / 2, 0); c.lineTo(0, h); c.lineTo(w, h); c.closePath(); },
          hexagon: (c, w, h) => { c.moveTo(w * 0.25, 0); c.lineTo(w * 0.75, 0); c.lineTo(w, h / 2); c.lineTo(w * 0.75, h); c.lineTo(w * 0.25, h); c.lineTo(0, h / 2); c.closePath(); },
          star: (c, w, h) => {
            for (let i = 0; i < 5; i++) {
              const a1 = (i * 72 - 90) * Math.PI / 180, a2 = ((i * 72 + 36) - 90) * Math.PI / 180;
              c.lineTo(w / 2 + (w / 2) * Math.cos(a1), h / 2 + (h / 2) * Math.sin(a1));
              c.lineTo(w / 2 + (w * 0.2) * Math.cos(a2), h / 2 + (h * 0.2) * Math.sin(a2));
            }
            c.closePath();
          },
          parallelogram: (c, w, h) => { c.moveTo(w * 0.2, 0); c.lineTo(w, 0); c.lineTo(w * 0.8, h); c.lineTo(0, h); c.closePath(); },
        };

        for (const item of items.filter(i => !['line', 'curve', 'frame'].includes(i.type))) {
          ctx.save();
          ctx.translate(item.x + ox, item.y + oy);
          if (item.rotation) { ctx.translate(item.w / 2, item.h / 2); ctx.rotate(item.rotation * Math.PI / 180); ctx.translate(-item.w / 2, -item.h / 2); }

          const clip = clipPaths[item.type];
          if (clip) {
            ctx.beginPath(); clip(ctx, item.w, item.h);
            ctx.fillStyle = item.color; ctx.fill();
            ctx.clip();
          } else if (item.type === 'circle') {
            ctx.beginPath(); ctx.ellipse(item.w / 2, item.h / 2, item.w / 2, item.h / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = item.color; ctx.fill();
          } else if (item.type === 'rounded') {
            ctx.beginPath(); ctx.roundRect(0, 0, item.w, item.h, 16);
            ctx.fillStyle = item.color; ctx.fill();
          } else if (item.type === 'image' && item.src) {
            const img = new Image(); img.src = item.src;
            await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
            ctx.drawImage(img, 0, 0, item.w, item.h);
            ctx.restore(); continue;
          } else {
            ctx.beginPath(); ctx.roundRect(0, 0, item.w, item.h, 8);
            ctx.fillStyle = item.color; ctx.fill();
          }

          // Draw text
          if (item.text) {
            ctx.fillStyle = item.textColor || '#1a1a1a';
            const fs = item.fontSize || 14;
            ctx.font = `${item.bold ? 'bold ' : ''}${item.italic ? 'italic ' : ''}${fs}px ${item.fontFamily || 'Arial'}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const lines = item.text.split('\n');
            const lineH = fs * 1.3;
            const startY = (item.h - lines.length * lineH) / 2 + lineH / 2;
            lines.forEach((line, i) => ctx.fillText(line, item.w / 2, startY + i * lineH));
          }
          ctx.restore();
        }

        // Create PDF
        const imgData = canvas.toDataURL('image/png');
        const pdfW = 297, pdfH = 210;
        const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const imgW = canvas.width * ratio, imgH = canvas.height * ratio;
        pdf.addImage(imgData, 'PNG', (pdfW - imgW) / 2, (pdfH - imgH) / 2, imgW, imgH);
        const blobUrl = pdf.output('bloburl');
        window.open(blobUrl, '_blank');
      } catch (err) {
        console.error('Export failed:', err);
        alert(t('board.exportFailed') + (err as Error).message);
      }
    };
    captureAndDownload();
  };

  const startPresent = () => {
    const frames = data.items.filter(i => i.type === 'frame');
    if (frames.length === 0) return;
    const f = frames[0];
    const cW = ref.current?.clientWidth || 800, cH = ref.current?.clientHeight || 600;
    const s = Math.min(cW / f.w, cH / f.h) * 0.85;
    setZoom(s);
    setPan({ x: cW / 2 - (f.x + f.w / 2) * s, y: cH / 2 - (f.y + f.h / 2) * s });
    setPresenting(0);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-3 pb-1 shrink-0">
        <input value={boardTitle || ''} onChange={e => onTitleChange?.(e.target.value)} disabled={readOnly}
          className="w-full text-lg font-semibold text-foreground bg-transparent outline-none font-serif border-b border-transparent focus:border-primary/40 rounded px-1 py-0.5 transition-colors" placeholder={t('board.text')} />
      </div>
      {!readOnly && (
        <div className="relative flex items-center gap-1.5 px-4 py-2 border-b border-border/30 bg-muted/30 shrink-0 flex-wrap">
          <button onClick={() => { setTool('select'); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'select' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.select')}><MousePointer2 size={14} /></button>
          <div className="relative">
            <button onClick={() => { setTool('shape'); setShowShapes(!showShapes); setShowTextFormat(false); setShowColors(false); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'shape' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.shapes')}><Square size={14} /><ChevronDown size={10} /></button>
            <div className={`absolute top-full left-0 mt-1 z-50 transition-all duration-200 ease-in-out ${showShapes ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <div className="bg-card border border-border rounded-xl shadow-premium p-1 min-w-[120px]" onPointerDown={e => e.stopPropagation()}>
                {SHAPE_KEYS.map(s => <button key={s.type} onClick={() => { setShapeTool(s.type); setTool('shape'); setShowShapes(false); }} className={`w-full text-left px-3 py-1.5 text-xs rounded-lg ${shapeTool === s.type ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}>{t(s.key) || s.type}</button>)}
              </div>
            </div>
          </div>
          <button onClick={() => { setTool('text'); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'text' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.textTool')}><Type size={14} /></button>
          <button onClick={() => { setTool('curve'); setConnectFrom(null); setDrawingPoints(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'curve' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.curveTool')}><Pencil size={14} /></button>
          <button onClick={() => { setTool('connect'); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'connect' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.connectTool')}><ArrowRight size={14} /></button>
          <button onClick={() => { setTool('frame'); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool === 'frame' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.frameTool')}><LayoutGrid size={14} /></button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <div className="relative">
            <button onClick={() => { const next = !showColors; setShowColors(next); setShowTextFormat(false); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${showColors ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.color')}><Palette size={14} /><span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: color }} /></button>
            <div className={`absolute top-full left-0 mt-1 z-50 transition-all duration-200 ease-in-out ${showColors ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <div className="bg-card border border-border rounded-xl shadow-premium p-3 w-[240px]" onPointerDown={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg border-2 border-border" style={{ backgroundColor: color }} />
                    <input type="color" value={color} onChange={e => { setColor(e.target.value); applyToSelected({ color: e.target.value }); }} className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div className="grid grid-cols-10 gap-1.5">
                    {[...PALETTE, '#000', '#fff', '#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff', '#888', '#800', '#800', '#080', '#088', '#008', '#808', '#f60', '#c06', '#393', '#339'].map(c => <button key={c} onClick={() => { setColor(c); applyToSelected({ color: c }); setShowColors(false); }} className="w-5 h-5 rounded-md border border-border hover:scale-125" style={{ backgroundColor: c }} />)}
                  </div>
              </div>
            </div>
          </div>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={() => { setShowTextFormat(!showTextFormat); setShowColors(false); setConnectFrom(null); }} className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${showTextFormat ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('board.format')}><Type size={14} /></button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={undo} disabled={histIdx <= 0} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" title={t('board.undo')}><Undo2 size={14} /></button>
          <button onClick={redo} disabled={histIdx >= hist.length - 1} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" title={t('board.redo')}><Redo2 size={14} /></button>
          {sels.size > 0 && <button onClick={delSel} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={startPresent} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.present')}><Play size={14} /></button>
          <button onClick={exportPDF} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.exportPDF')}><Download size={14} /></button>
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title={t('board.zoomIn')}><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title={t('board.zoomOut')}><ZoomOut size={14} /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title={t('board.resetZoom')}><Maximize size={14} /></button>
          {noteId && <>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <button onClick={() => openModal('share')} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.share')}><Share2 size={14} /></button>
            <button onClick={() => openModal('reminder')} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.reminder')}><Bell size={14} /></button>
            <button onClick={async () => {
              try {
                const { api } = await import('../api/client');
                const status = await api.getCalendarStatus();
                if (!status.connected) { alert(t('board.connectCalendar')); return; }
                const now = new Date();
                const later = new Date(now.getTime() + 60 * 60 * 1000);
                await api.createCalendarEvent({ summary: boardTitle || 'Board', description: '', start_datetime: now.toISOString(), end_datetime: later.toISOString() });
                alert(t('board.eventCreated'));
              } catch (err) { console.error(err); }
            }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.addCalendar')}><CalendarPlus size={14} /></button>
            <button onClick={() => openModal('publish')} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title={t('board.publish')}><Globe size={14} /></button>
          </>}
          <div className={`absolute top-2 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm transition-all duration-500 ${saveStatus === 'saved' ? 'border-emerald-500/50' : ''}`}>
            <Check size={14} className={saveStatus === 'saved' ? 'text-emerald-500' : saveStatus === 'saving' ? 'text-amber-500' : 'text-emerald-500/60'} />
            <span className={`text-xs font-medium ${saveStatus === 'saved' ? 'text-emerald-500' : saveStatus === 'saving' ? 'text-amber-500' : 'text-emerald-500/60'}`}>
              {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранено'}
            </span>
          </div>
        </div>
      )}
      <div className="grid transition-[grid-template-rows] duration-200 ease-in-out shrink-0" style={{ gridTemplateRows: showTextFormat ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/30 bg-muted/10 flex-wrap text-xs" onPointerDown={e => e.stopPropagation()}>
            <select value={textFontFamily} onChange={e => { setTextFontFamily(e.target.value); applyToSelected({ fontFamily: e.target.value }); }} className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs outline-none">
              {['Arial', 'Georgia', 'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Verdana', 'serif', 'monospace'].map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <select value={textFontSize} onChange={e => { setTextFontSize(Number(e.target.value)); applyToSelected({ fontSize: Number(e.target.value) }); }} className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs outline-none w-14">
              {[10, 12, 14, 16, 20, 24, 32, 48].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <button onClick={() => { setTextBold(!textBold); applyToSelected({ bold: !textBold }); }} className={`p-1.5 rounded ${textBold ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}><Bold size={14} /></button>
            <button onClick={() => { setTextItalic(!textItalic); applyToSelected({ italic: !textItalic }); }} className={`p-1.5 rounded ${textItalic ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}><Italic size={14} /></button>
            <button onClick={() => { setTextUnderline(!textUnderline); applyToSelected({ underline: !textUnderline }); }} className={`p-1.5 rounded ${textUnderline ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}><Underline size={14} /></button>
          </div>
        </div>
      </div>

      <div ref={ref} className="flex-1 relative overflow-hidden" tabIndex={-1}
        style={{ background: 'radial-gradient(circle,#e8e0d4 1px,transparent 1px)', backgroundSize: '24px 24px', cursor: panning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair' }}
        onMouseDown={e => { if (tool === 'select') ref.current?.focus(); bgDown(e); }} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
        onDrop={e => { e.preventDefault(); handleFileDrop(e.dataTransfer.files, e); }} onDragOver={e => e.preventDefault()}
        onPaste={e => { const files = e.clipboardData.files; if (files.length > 0) { e.preventDefault(); handleFileDrop(files); } }}>
        <div className="absolute" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {data.items.filter(i => i.type === 'line').map(item => {
            const ep = getLineEndpoints(item, data.items);
            const isSel = sels.has(item.id), sc = isSel ? '#7C5CFF' : item.color;
            const dx = ep.x2 - ep.x1, dy = ep.y2 - ep.y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len, px = -uy, py = ux;
            const a1x = ep.x2 - ux * 10 + px * 5, a1y = ep.y2 - uy * 10 + py * 5;
            const a2x = ep.x2 - ux * 10 - px * 5, a2y = ep.y2 - uy * 10 - py * 5;
            return (<React.Fragment key={item.id}>
              <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: isSel ? 20 : 6, pointerEvents: 'none' }}>
                <line x1={ep.x1} y1={ep.y1} x2={ep.x2} y2={ep.y2} stroke={sc} strokeWidth={isSel ? 5 : 3} style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))' }} />
                <polygon points={`${ep.x2},${ep.y2} ${a1x},${a1y} ${a2x},${a2y}`} fill={sc} style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))' }} />
              </svg>
              <div data-line-id={item.id} style={{ position: 'absolute', left: ep.x1, top: ep.y1 - 10, width: len, height: 20, transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`, transformOrigin: '0 50%', zIndex: isSel ? 20 : 7, cursor: 'pointer' }} />
              {isSel && !readOnly && <>
                <div className="absolute w-[12px] h-[12px] bg-white border-2 border-primary rounded-full z-30" style={{ left: ep.x1 - 6, top: ep.y1 - 6, cursor: 'grab' }} onMouseDown={e => { e.stopPropagation(); setAnchorDrag({ lineId: item.id, end: 'start' }); }} />
                <div className="absolute w-[12px] h-[12px] bg-white border-2 border-primary rounded-full z-30" style={{ left: ep.x2 - 6, top: ep.y2 - 6, cursor: 'grab' }} onMouseDown={e => { e.stopPropagation(); setAnchorDrag({ lineId: item.id, end: 'end' }); }} />
              </>}
            </React.Fragment>);
          })}

          {data.items.filter(i => i.type === 'curve' && i.points).map(item => {
            const isSel = sels.has(item.id), sc = isSel ? '#7C5CFF' : item.color;
            const pts = simplifyPath(item.points!.trim().split(' ').map(p => { const [x, y] = p.split(',').map(Number); return { x, y }; }).filter(p => !isNaN(p.x) && !isNaN(p.y)), 6);
            const last = pts[pts.length - 1] || pts[0] || { x: 0, y: 0 };
            const ld = pts.length >= 2 ? pts[pts.length - 2] : pts[0];
            const cdx = last.x - ld.x, cdy = last.y - ld.y, clen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            const cux = cdx / clen, cuy = cdy / clen, cpx = -cuy, cpy = cux;
            return (<React.Fragment key={item.id}>
              <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: isSel ? 15 : 1, pointerEvents: 'none' }}>
                <path d={freehandToPath(item.points!)} fill="none" stroke={sc} strokeWidth={isSel ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))' }} />
                <polygon points={`${last.x},${last.y} ${last.x - cux * 10 + cpx * 5},${last.y - cuy * 10 + cpy * 5} ${last.x - cux * 10 - cpx * 5},${last.y - cuy * 10 - cpy * 5}`} fill={sc} style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))' }} />
              </svg>
            </React.Fragment>);
          })}

          {drawingPoints && <svg className="absolute" style={{ left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: 30, pointerEvents: 'none' }}><path d={freehandToPath(drawingPoints)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} /></svg>}

          {data.items.filter(i => i.type === 'frame').map(item => (
            <div key={item.id} className={`absolute select-none ${readOnly ? '' : 'cursor-move'} ${sels.has(item.id) ? 'ring-2 ring-primary' : ''}`}
              style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: 2, border: `2px dashed ${item.color}80`, borderRadius: '12px', backgroundColor: `${item.color}08` }}
              onMouseDown={e => itemDown(e, item.id)} onDoubleClick={() => { if (!readOnly) setEditId(item.id); }}>
              <div className="absolute -top-3 left-3 px-2 py-0.5 text-[11px] font-medium rounded-md" style={{ backgroundColor: item.color, color: '#fff' }}>
                {editId === item.id ? <input ref={editInputRef} value={item.text} onChange={e => updateText(item.id, e.target.value)} onBlur={() => setEditId(null)} onKeyDown={e => e.key === 'Enter' && setEditId(null)} className="bg-transparent border-none outline-none text-[11px] text-white w-20" placeholder="текст" /> : item.text}
              </div>
            </div>
          ))}

          {data.items.filter(i => i.type !== 'line' && i.type !== 'curve' && i.type !== 'frame').map(item => (
            <React.Fragment key={item.id}>
              <div className={`absolute select-none overflow-visible ${readOnly ? '' : 'cursor-move'} ${sels.has(item.id) ? 'ring-2 ring-primary' : ''}`}
                style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: 10, transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined, transformOrigin: '50% 50%', borderRadius: item.type === 'circle' ? '50%' : '8px' }}
                onMouseDown={e => itemDown(e, item.id)} onDoubleClick={() => !readOnly && setEditId(item.id)}>
                {item.type === 'image' && item.src ? <img src={item.src} draggable={false} className="w-full h-full object-contain rounded-lg pointer-events-none" style={{ filter: `drop-shadow(0 0 1px ${isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'})` }} alt="" /> :
                 item.type === 'sticky' ? <div className="w-full h-full rounded-xl shadow-premium p-3 flex items-start" style={{ backgroundColor: item.color, border: `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}` }}>{editId === item.id ? <textarea ref={editInputRef} value={item.text} onChange={e => updateText(item.id, e.target.value)} onBlur={() => setEditId(null)} className="w-full h-full bg-transparent border-none outline-none text-sm resize-none text-foreground/80" placeholder="текст" style={{ fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14, fontWeight: item.bold ? 'bold' : 'normal', fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none' }} /> : <p className="text-sm text-foreground/80 whitespace-pre-wrap" style={{ fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14, fontWeight: item.bold ? 'bold' : 'normal', fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none' }}>{item.text || 'текст'}</p>}</div> :
                 item.type === 'circle' ? <div className="w-full h-full flex items-center justify-center p-2" style={{ backgroundColor: item.color, borderRadius: '50%', border: `2px solid ${isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'}` }}>{editId === item.id ? <input ref={editInputRef} value={item.text} onChange={e => updateText(item.id, e.target.value)} onBlur={() => setEditId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center" placeholder="текст" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14 }} /> : <p className="text-sm text-center" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14 }}>{item.text || 'текст'}</p>}</div> :
                 item.type === 'text' ? <div className="w-full flex items-center justify-center h-full">{editId === item.id ? <input ref={editInputRef} value={item.text} onChange={e => updateText(item.id, e.target.value)} onBlur={() => setEditId(null)} onKeyDown={e => e.key === 'Enter' && setEditId(null)} className="w-full bg-transparent border-b-2 border-primary outline-none text-center" placeholder="текст" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 24 }} /> : <p className="cursor-text" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 24, fontWeight: item.bold ? 'bold' : 'normal', fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none' }} onClick={() => !readOnly && setEditId(item.id)}>{item.text || 'текст'}</p>}</div> :
                  (() => {
                    const svgPoints: Record<string, string> = { diamond: '50,0 100,50 50,100 0,50', triangle: '50,0 0,100 100,100', hexagon: '25,0 75,0 100,50 75,100 25,100 0,50', star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35', parallelogram: '20,0 100,0 80,100 0,100' };
                    const borderC = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)';
                    const textContent = editId === item.id ? <input ref={editInputRef} value={item.text} onChange={e => updateText(item.id, e.target.value)} onBlur={() => setEditId(null)} onKeyDown={e => e.key === 'Enter' && setEditId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center px-2" placeholder="текст" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14 }} /> : <p className="text-sm text-center" style={{ color: item.textColor || '#1a1a1a', fontFamily: item.fontFamily || 'Arial', fontSize: item.fontSize || 14, fontWeight: item.bold ? 'bold' : 'normal', fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none' }}>{item.text || 'текст'}</p>;
                    const pts = svgPoints[item.type];
                    if (pts) {
                      return <div className="w-full h-full relative"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full"><polygon points={pts} fill={item.color} stroke={borderC} strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="absolute inset-0 flex items-center justify-center">{textContent}</div></div>;
                    }
                    return <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: item.color, borderRadius: '8px', border: `2px solid ${borderC}` }}>{textContent}</div>;
                  })()
                }
              </div>
              {sels.has(item.id) && !readOnly && handlePositions(item).map(({ pos, handle, cursor }) => (
                <div key={`h-${item.id}-${handle}`} className="absolute w-[10px] h-[10px] bg-white border border-primary rounded-sm z-30"
                  style={{ left: pos.left, top: pos.top, cursor }} onMouseDown={e => handleDown(e, item.id, handle)} />
              ))}
              {sels.has(item.id) && !readOnly && (
                <div key={`rot-${item.id}`} className="absolute w-[14px] h-[14px] bg-primary rounded-full z-30 flex items-center justify-center cursor-grab"
                  style={{ left: item.x + item.w / 2 - 7, top: item.y - 28 }}
                  onMouseDown={e => {
                    e.stopPropagation();
                    const pos = getPos(e);
                    const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
                    const angle = Math.atan2(pos.y - cy, pos.x - cx) * (180 / Math.PI);
                    setRotating({ id: item.id, cx, cy, startAngle: angle, origRotation: item.rotation || 0 });
                  }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {modalType && ModalComp && <ModalComp
        isOpen={modalType !== null}
        onClose={() => { setModalType(null); setModalComp(null); }}
        {...(modalType === 'share' ? { resourceId: noteId, resourceType: 'note', resourceName: boardTitle || 'Board' } : {})}
        {...(modalType === 'reminder' ? { onConfirm: async (data: any) => { const { api } = await import('../api/client'); await api.createReminder({ note_id: noteId, ...data }); } } : {})}
        {...(modalType === 'publish' ? { slug: publishSlug, title: boardTitle || 'Board', isPublished, onPublish: async (expiresHours: number) => {
          const { api } = await import('../api/client');
          const result = await api.publishNote(noteId!, expiresHours);
          if (result.slug) { setPublishSlug(result.slug); setIsPublished(true); }
        } } : {})}
      />}
      {presenting >= 0 && (() => {
        const frames = data.items.filter(i => i.type === 'frame');
        if (!frames.length) return null;
        const idx = Math.min(presenting, frames.length - 1);
        const f = frames[idx];
        const cW = ref.current?.clientWidth || window.innerWidth;
        const cH = ref.current?.clientHeight || window.innerHeight;
        const sc = Math.min((cW * 0.9) / f.w, (cH * 0.9) / f.h);
        const ox = (cW - f.w * sc) / 2, oy = (cH - f.h * sc) / 2;
        const nav = (d: number) => setPresenting(Math.max(0, Math.min(presenting + d, frames.length - 1)));
        const items = data.items.filter(i => {
          if (i.type === 'frame') return false;
          if (i.type === 'line') { const ep = getLineEndpoints(i, data.items); const in_ = (x: number, y: number) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h; return in_(ep.x1, ep.y1) && in_(ep.x2, ep.y2); }
          if (i.type === 'curve') return i.x >= f.x && i.y >= f.y;
          return i.x + i.w / 2 >= f.x && i.x + i.w / 2 <= f.x + f.w && i.y + i.h / 2 >= f.y && i.y + i.h / 2 <= f.y + f.h;
        });
        return (
          <div className="fixed inset-0 z-50 bg-black" ref={el => el && setTimeout(() => el.focus(), 0)} tabIndex={0}
            onKeyDown={e => { if (e.key === 'Escape') setPresenting(-1); if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nav(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); } }}
            onMouseDown={e => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX > r.left + r.width * 0.7) nav(1); else if (e.clientX < r.left + r.width * 0.3) nav(-1); }}
            style={{ outline: 'none' }}>
            <div className="absolute inset-0" style={{ transform: `translate(${ox}px,${oy}px) scale(${sc})`, transformOrigin: '0 0' }}>
              <div style={{ position: 'absolute', left: -f.x, top: -f.y }}>
                {items.filter(i => i.type === 'line').map(i => {
                  const ep = getLineEndpoints(i, data.items);
                  const dx = ep.x2 - ep.x1, dy = ep.y2 - ep.y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
                  const a1x = ep.x2 - ux * 10 + px * 5, a1y = ep.y2 - uy * 10 + py * 5;
                  const a2x = ep.x2 - ux * 10 - px * 5, a2y = ep.y2 - uy * 10 - py * 5;
                  return (
                    <svg key={i.id} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: 1, pointerEvents: 'none' }}>
                      <line x1={ep.x1} y1={ep.y1} x2={ep.x2} y2={ep.y2} stroke={i.color} strokeWidth={3} />
                      <polygon points={`${ep.x2},${ep.y2} ${a1x},${a1y} ${a2x},${a2y}`} fill={i.color} />
                    </svg>
                  );
                })}
                {items.filter(i => i.type === 'curve' && i.points).map(i => (
                  <svg key={i.id} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', zIndex: 1, pointerEvents: 'none' }}>
                    <path d={freehandToPath(i.points!)} fill="none" stroke={i.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ))}
                {items.filter(i => i.type !== 'line' && i.type !== 'curve').map(i => {
                  const clips: Record<string, string> = { diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)', hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', parallelogram: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)' };
                  const clip = clips[i.type]; const br = i.type === 'rounded' ? '16px' : '8px';
                  return <div key={i.id} className="absolute" style={{ left: i.x, top: i.y, width: i.w, height: i.h, zIndex: 20, transform: i.rotation ? `rotate(${i.rotation}deg)` : undefined, transformOrigin: '50% 50%' }}>
                    {i.type === 'image' && i.src ? <img src={i.src} className="w-full h-full object-contain rounded-lg" alt="" draggable={false} /> :
                     i.type === 'sticky' ? <div className="w-full h-full rounded-xl p-3" style={{ backgroundColor: i.color }}><p className="text-sm whitespace-pre-wrap" style={{ color: i.textColor || '#1a1a1a' }}>{i.text}</p></div> :
                     i.type === 'circle' ? <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: i.color }}><p className="text-sm text-center" style={{ color: i.textColor || '#1a1a1a' }}>{i.text}</p></div> :
                     <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: i.color, borderRadius: clip ? '0px' : br, clipPath: clip || undefined }}><p className="text-sm text-center" style={{ color: i.textColor || '#1a1a1a' }}>{i.text}</p></div>}
                  </div>;
                })}
              </div>
            </div>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur rounded-full px-6 py-3 z-10">
              <button onClick={e => { e.stopPropagation(); nav(-1); }} disabled={idx === 0} className="text-white/70 hover:text-white disabled:opacity-30"><ChevronLeft size={24} /></button>
              <span className="text-white/80 text-sm min-w-[60px] text-center">{idx + 1} / {frames.length}</span>
              <button onClick={e => { e.stopPropagation(); nav(1); }} disabled={idx >= frames.length - 1} className="text-white/70 hover:text-white disabled:opacity-30"><ChevronR size={24} /></button>
            </div>
            <div className="absolute top-6 right-6 z-10">
              <button onClick={e => { e.stopPropagation(); setPresenting(-1); }} className="bg-white/10 backdrop-blur text-white/80 hover:text-white px-4 py-2 rounded-full text-sm">{t('board.exitPresent')}</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}