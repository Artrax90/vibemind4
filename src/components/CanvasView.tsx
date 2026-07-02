import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Note } from '../types';
import { Plus, MousePointer2, ArrowRight, ZoomIn, ZoomOut, Maximize, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type CanvasViewProps = {
  notes: Note[];
  activeNoteId: string | null;
  onNoteClick: (noteId: string) => void;
  onAddNote: (note: Note) => void;
};

type CardPosition = { id: string; x: number; y: number };
type Arrow = { id: string; from: string; to: string };
type Tool = 'select' | 'connect' | 'add';

export default function CanvasView({ notes, activeNoteId, onNoteClick, onAddNote }: CanvasViewProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<CardPosition[]>(() => {
    try { return JSON.parse(localStorage.getItem('canvas_positions') || '[]'); } catch { return []; }
  });
  const [arrows, setArrows] = useState<Arrow[]>(() => {
    try { return JSON.parse(localStorage.getItem('canvas_arrows') || '[]'); } catch { return []; }
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);

  useEffect(() => { localStorage.setItem('canvas_positions', JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem('canvas_arrows', JSON.stringify(arrows)); }, [arrows]);

  useEffect(() => {
    const existing = new Set(positions.map(p => p.id));
    const newPositions = notes
      .filter(n => !existing.has(n.id))
      .map((n, i) => ({ id: n.id, x: 100 + (i % 4) * 280, y: 100 + Math.floor(i / 4) * 200 }));
    if (newPositions.length > 0) setPositions(prev => [...prev, ...newPositions]);
  }, [notes]);

  // Pan: left click on background
  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'add') {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const newNote: Note = { id: `n${Date.now()}`, title: t('canvas.newNote'), content: '', permission: 'owner' } as Note;
      setPositions(prev => [...prev, { id: newNote.id, x, y }]);
      onAddNote(newNote);
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan, zoom, tool, onAddNote]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragging) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x;
      const y = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y;
      setPositions(prev => prev.map(p => p.id === dragging ? { ...p, x, y } : p));
    }
  }, [isPanning, pan, zoom, dragging, dragOffset, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragging(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.2, z * delta)));
  }, []);

  const handleCardMouseDown = useCallback((e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (tool === 'connect') {
      if (!connectFrom) {
        setConnectFrom(noteId);
      } else if (connectFrom !== noteId) {
        setArrows(prev => [...prev, { id: `${Date.now()}`, from: connectFrom, to: noteId }]);
        setConnectFrom(null);
      }
      return;
    }
    const pos = positions.find(p => p.id === noteId);
    if (pos) {
      const rect = containerRef.current!.getBoundingClientRect();
      setDragging(noteId);
      setDragOffset({
        x: (e.clientX - rect.left - pan.x) / zoom - pos.x,
        y: (e.clientY - rect.top - pan.y) / zoom - pos.y
      });
    }
  }, [tool, connectFrom, positions, pan, zoom]);

  const getCardPosition = (id: string) => positions.find(p => p.id === id) || { x: 0, y: 0 };

  const presentableNotes = notes.filter(n => n.id);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full bg-background overflow-hidden relative ${tool === 'add' ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleBackgroundMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button onClick={() => setTool('select')} className={`p-2 rounded-full transition-colors ${tool === 'select' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} title={t('canvas.selectDrag')}>
            <MousePointer2 size={14} />
          </button>
          <button onClick={() => setTool('connect')} className={`p-2 rounded-full transition-colors ${tool === 'connect' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} title={t('canvas.connect')}>
            <ArrowRight size={14} />
          </button>
          <button onClick={() => setTool('add')} className={`p-2 rounded-full transition-colors ${tool === 'add' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} title={t('canvas.addNote')}>
            <Plus size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-2 rounded-full text-muted-foreground hover:text-foreground"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-2 rounded-full text-muted-foreground hover:text-foreground"><ZoomOut size={14} /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 rounded-full text-muted-foreground hover:text-foreground"><Maximize size={14} /></button>
        </div>
        <button onClick={presenting ? () => setPresenting(false) : () => { setPresenting(true); setPresentIndex(0); }} className={`p-2 rounded-full shadow-premium ring-1 ring-border/50 transition-colors ${presenting ? 'bg-primary text-primary-foreground' : 'glass-strong text-muted-foreground hover:text-foreground'}`} title={t('canvas.present')}>
          <Play size={14} />
        </button>
      </div>

      {/* Present controls */}
      {presenting && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 glass-strong rounded-full px-4 py-2 shadow-premium ring-1 ring-border/50">
          <button onClick={() => { if (presentIndex > 0) { const next = presentIndex - 1; setPresentIndex(next); const pos = getCardPosition(presentableNotes[next].id); setPan({ x: window.innerWidth / 2 - pos.x * zoom, y: window.innerHeight / 2 - pos.y * zoom }); } }} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={presentIndex === 0}>←</button>
          <span className="text-sm text-foreground">{presentIndex + 1} / {presentableNotes.length}</span>
          <button onClick={() => { if (presentIndex < presentableNotes.length - 1) { const next = presentIndex + 1; setPresentIndex(next); const pos = getCardPosition(presentableNotes[next].id); setPan({ x: window.innerWidth / 2 - pos.x * zoom, y: window.innerHeight / 2 - pos.y * zoom }); } }} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={presentIndex >= presentableNotes.length - 1}>→</button>
          <button onClick={() => setPresenting(false)} className="text-sm text-muted-foreground hover:text-foreground ml-2">✕</button>
        </div>
      )}

      {/* Canvas */}
      <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {/* Arrows — rendered first, below cards */}
        <svg className="absolute" style={{ width: '1px', height: '1px', overflow: 'visible', zIndex: 5 }}>
          <defs>
            <marker id="arrowhead" markerWidth="14" markerHeight="10" refX="13" refY="5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M 0 1 L 13 5 L 0 9 L 3 5 Z" fill="#7C5CFF" />
            </marker>
          </defs>
          {arrows.map(arrow => {
            const from = getCardPosition(arrow.from);
            const to = getCardPosition(arrow.to);
            const fromX = from.x + 110;
            const fromY = from.y + 55;
            const toX = to.x + 110;
            const toY = to.y + 55;
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2 - 50;
            return (
              <g key={arrow.id}>
                <path
                  d={`M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`}
                  fill="none"
                  stroke="#7C5CFF"
                  strokeWidth={3}
                  markerEnd="url(#arrowhead)"
                />
              </g>
            );
          })}
        </svg>

        {/* Cards — rendered above arrows */}
        {notes.map(note => {
          const pos = getCardPosition(note.id);
          return (
            <div
              key={note.id}
              className={`absolute w-[220px] bg-card border rounded-2xl shadow-premium cursor-pointer select-none transition-shadow hover:shadow-premium-lg ${activeNoteId === note.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/50'}`}
              style={{ left: pos.x, top: pos.y, zIndex: 10 }}
              onMouseDown={(e) => handleCardMouseDown(e, note.id)}
              onDoubleClick={() => onNoteClick(note.id)}
            >
              <div className="p-4">
                <p className="text-sm font-semibold text-foreground truncate font-serif">{note.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                  {(note.content || '').replace(/[#*\[\]]/g, '').substring(0, 100)}
                </p>
              </div>
              <div className="px-4 pb-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/50">
                  {new Date(note.updated_at || '').toLocaleDateString('ru-RU')}
                </span>
                {note.isPinned && <span className="text-yellow-500 text-xs">★</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
