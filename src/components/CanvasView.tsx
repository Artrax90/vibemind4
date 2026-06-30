import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Note } from '../types';
import { Plus, MousePointer2, ArrowRight, Type, Square, ZoomIn, ZoomOut, Maximize, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type CanvasViewProps = {
  notes: Note[];
  activeNoteId: string | null;
  onNoteClick: (noteId: string) => void;
};

type CardPosition = { id: string; x: number; y: number };
type Arrow = { id: string; from: string; to: string };
type CanvasShape = { id: string; type: 'rect' | 'text'; x: number; y: number; width: number; height: number; text?: string; color?: string };

type Tool = 'select' | 'connect' | 'text' | 'shape';

export default function CanvasView({ notes, activeNoteId, onNoteClick }: CanvasViewProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<CardPosition[]>(() => {
    try { return JSON.parse(localStorage.getItem('canvas_positions') || '[]'); } catch { return []; }
  });
  const [arrows, setArrows] = useState<Arrow[]>(() => {
    try { return JSON.parse(localStorage.getItem('canvas_arrows') || '[]'); } catch { return []; }
  });
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
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

  // Save positions to localStorage
  useEffect(() => {
    localStorage.setItem('canvas_positions', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('canvas_arrows', JSON.stringify(arrows));
  }, [arrows]);

  // Initialize positions for notes that don't have one
  useEffect(() => {
    const existing = new Set(positions.map(p => p.id));
    const newPositions = notes
      .filter(n => !existing.has(n.id))
      .map((n, i) => ({
        id: n.id,
        x: 100 + (i % 4) * 280,
        y: 100 + Math.floor(i / 4) * 200
      }));
    if (newPositions.length > 0) {
      setPositions(prev => [...prev, ...newPositions]);
    }
  }, [notes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (dragging) {
      const x = (e.clientX - pan.x) / zoom - dragOffset.x;
      const y = (e.clientY - pan.y) / zoom - dragOffset.y;
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
    if (tool === 'select') {
      const pos = positions.find(p => p.id === noteId);
      if (pos) {
        setDragging(noteId);
        setDragOffset({
          x: (e.clientX - pan.x) / zoom - pos.x,
          y: (e.clientY - pan.y) / zoom - pos.y
        });
      }
    }
  }, [tool, connectFrom, positions, pan, zoom]);

  const handleDoubleClick = useCallback((noteId: string) => {
    onNoteClick(noteId);
  }, [onNoteClick]);

  const getCardPosition = (id: string) => positions.find(p => p.id === id) || { x: 0, y: 0 };

  // Presentation mode
  const presentableNotes = notes.filter(n => n.id);
  const handlePresent = () => {
    setPresenting(true);
    setPresentIndex(0);
    if (presentableNotes.length > 0) {
      const pos = getCardPosition(presentableNotes[0].id);
      setPan({ x: window.innerWidth / 2 - pos.x * zoom, y: window.innerHeight / 2 - pos.y * zoom });
    }
  };

  const handlePresentNext = () => {
    if (presentIndex < presentableNotes.length - 1) {
      const next = presentIndex + 1;
      setPresentIndex(next);
      const pos = getCardPosition(presentableNotes[next].id);
      setPan({ x: window.innerWidth / 2 - pos.x * zoom, y: window.innerHeight / 2 - pos.y * zoom });
    }
  };

  const handlePresentPrev = () => {
    if (presentIndex > 0) {
      const prev = presentIndex - 1;
      setPresentIndex(prev);
      const pos = getCardPosition(presentableNotes[prev].id);
      setPan({ x: window.innerWidth / 2 - pos.x * zoom, y: window.innerHeight / 2 - pos.y * zoom });
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-background overflow-hidden cursor-grab active:cursor-grabbing relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button
            onClick={() => setTool('select')}
            className={`p-2 rounded-full transition-colors ${tool === 'select' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            title="Select"
          >
            <MousePointer2 size={14} />
          </button>
          <button
            onClick={() => setTool('connect')}
            className={`p-2 rounded-full transition-colors ${tool === 'connect' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            title="Connect"
          >
            <ArrowRight size={14} />
          </button>
          <button
            onClick={() => setTool('text')}
            className={`p-2 rounded-full transition-colors ${tool === 'text' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            title="Text"
          >
            <Type size={14} />
          </button>
          <button
            onClick={() => setTool('shape')}
            className={`p-2 rounded-full transition-colors ${tool === 'shape' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            title="Shape"
          >
            <Square size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-2 rounded-full text-muted-foreground hover:text-foreground">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-2 rounded-full text-muted-foreground hover:text-foreground">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 rounded-full text-muted-foreground hover:text-foreground">
            <Maximize size={14} />
          </button>
        </div>

        <button
          onClick={presenting ? () => setPresenting(false) : handlePresent}
          className={`p-2 rounded-full shadow-premium ring-1 ring-border/50 transition-colors ${presenting ? 'bg-primary text-primary-foreground' : 'glass-strong text-muted-foreground hover:text-foreground'}`}
          title="Present"
        >
          <Play size={14} />
        </button>
      </div>

      {/* Present mode controls */}
      {presenting && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 glass-strong rounded-full px-4 py-2 shadow-premium ring-1 ring-border/50">
          <button onClick={handlePresentPrev} disabled={presentIndex === 0} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">←</button>
          <span className="text-sm text-foreground">{presentIndex + 1} / {presentableNotes.length}</span>
          <button onClick={handlePresentNext} disabled={presentIndex >= presentableNotes.length - 1} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">→</button>
          <button onClick={() => setPresenting(false)} className="text-sm text-muted-foreground hover:text-foreground ml-2">✕</button>
        </div>
      )}

      {/* Canvas */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {/* Arrows */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          {arrows.map(arrow => {
            const from = getCardPosition(arrow.from);
            const to = getCardPosition(arrow.to);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return null;
            const nx = dx / len;
            const ny = dy / len;
            return (
              <g key={arrow.id}>
                <line
                  x1={from.x + 100} y1={from.y + 40}
                  x2={to.x + 100} y2={to.y + 40}
                  stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrowhead)"
                />
              </g>
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {/* Cards */}
        {notes.map(note => {
          const pos = getCardPosition(note.id);
          return (
            <div
              key={note.id}
              className={`absolute w-[200px] bg-card border rounded-xl shadow-premium cursor-pointer select-none transition-shadow hover:shadow-premium-lg ${activeNoteId === note.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/50'}`}
              style={{ left: pos.x, top: pos.y }}
              onMouseDown={(e) => handleCardMouseDown(e, note.id)}
              onDoubleClick={() => handleDoubleClick(note.id)}
            >
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{note.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {(note.content || '').replace(/[#*\[\]]/g, '').substring(0, 80)}
                </p>
              </div>
              <div className="px-3 pb-2 flex items-center justify-between">
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
