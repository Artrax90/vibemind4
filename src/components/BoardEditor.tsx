import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, MousePointer2, Type, Square, Circle, Minus, ArrowRight, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Palette, Save } from 'lucide-react';

type BoardItem = {
  id: string;
  type: 'sticky' | 'text' | 'rect' | 'circle' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize?: number;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
};

type BoardState = {
  items: BoardItem[];
  connections: { from: string; to: string; id: string }[];
};

type Tool = 'select' | 'sticky' | 'text' | 'rect' | 'circle' | 'line' | 'connect';

const COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#e0f2fe', '#fed7aa', '#d1fae5', '#fecaca', '#e0e7ff'];

type BoardEditorProps = {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
};

function parseBoard(content: string): BoardState {
  try {
    const match = content.match(/<!-- board:(.*?) -->/s);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return { items: [], connections: [] };
}

function serializeBoard(state: BoardState, original: string): string {
  const clean = original.replace(/<!-- board:.*?-->/s, '').trim();
  return clean + '\n\n<!-- board:' + JSON.stringify(state) + ' -->';
}

export default function BoardEditor({ content, onChange, readOnly = false }: BoardEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BoardState>(() => parseBoard(content));
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [history, setHistory] = useState<BoardState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);

  const save = (newState: BoardState) => {
    setState(newState);
    setHistory(prev => [...prev.slice(0, historyIndex + 1), state]);
    setHistoryIndex(prev => prev + 1);
    onChange(serializeBoard(newState, content));
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setState(prev);
      setHistoryIndex(historyIndex - 1);
      onChange(serializeBoard(prev, content));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setState(next);
      setHistoryIndex(historyIndex + 1);
      onChange(serializeBoard(next, content));
    }
  };

  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    setSelectedId(null);
    setEditingId(null);

    if (tool === 'line') {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setLineStart({ x, y });
      return;
    }

    if (['sticky', 'text', 'rect', 'circle'].includes(tool)) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const item: BoardItem = {
        id: `item-${Date.now()}`,
        type: tool as any,
        x, y,
        width: tool === 'sticky' ? 200 : tool === 'text' ? 300 : tool === 'rect' ? 240 : 140,
        height: tool === 'sticky' ? 160 : tool === 'text' ? 40 : tool === 'rect' ? 160 : 140,
        text: '',
        color: selectedColor,
        fontSize: tool === 'text' ? 24 : 14
      };
      save({ ...state, items: [...state.items, item] });
      setEditingId(item.id);
      return;
    }

    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (dragging) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x;
      const y = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y;
      setState(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === dragging ? { ...i, x, y } : i)
      }));
    }
    if (lineStart) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const tempItem: BoardItem = {
        id: '__temp_line__',
        type: 'line',
        x: 0, y: 0, width: 0, height: 0,
        text: '', color: selectedColor,
        from: lineStart, to: { x, y }
      };
      setState(prev => ({
        ...prev,
        items: [...prev.items.filter(i => i.id !== '__temp_line__'), tempItem]
      }));
    }
  }, [isPanning, pan, zoom, dragging, dragOffset, panStart, lineStart, selectedColor]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      onChange(serializeBoard(state, content));
    }
    if (lineStart) {
      const tempItem = state.items.find(i => i.id === '__temp_line__');
      if (tempItem && tempItem.from && tempItem.to) {
        const dx = tempItem.to.x - tempItem.from.x;
        const dy = tempItem.to.y - tempItem.from.y;
        if (Math.sqrt(dx * dx + dy * dy) > 20) {
          const newItem: BoardItem = {
            id: `line-${Date.now()}`,
            type: 'line',
            x: 0, y: 0, width: 0, height: 0,
            text: '', color: selectedColor,
            from: tempItem.from, to: tempItem.to
          };
          save({ ...state, items: [...state.items.filter(i => i.id !== '__temp_line__'), newItem] });
        } else {
          setState(prev => ({ ...prev, items: prev.items.filter(i => i.id !== '__temp_line__') }));
        }
      }
      setLineStart(null);
    }
    setIsPanning(false);
    setDragging(null);
  }, [dragging, state, content, onChange, lineStart, selectedColor]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.2, z * delta)));
  }, []);

  const handleItemMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (readOnly) return;
    if (tool === 'connect') {
      if (!connectFrom) {
        setConnectFrom(id);
      } else if (connectFrom !== id) {
        save({ ...state, connections: [...state.connections, { from: connectFrom, to: id, id: `conn-${Date.now()}` }] });
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(id);
    const item = state.items.find(i => i.id === id);
    if (item) {
      const rect = containerRef.current!.getBoundingClientRect();
      setDragging(id);
      setDragOffset({
        x: (e.clientX - rect.left - pan.x) / zoom - item.x,
        y: (e.clientY - rect.top - pan.y) / zoom - item.y
      });
    }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    save({
      ...state,
      items: state.items.filter(i => i.id !== selectedId),
      connections: state.connections.filter(c => c.from !== selectedId && c.to !== selectedId)
    });
    setSelectedId(null);
  };

  const updateItemText = (id: string, text: string) => {
    save({ ...state, items: state.items.map(i => i.id === id ? { ...i, text } : i) });
  };

  const getItemById = (id: string) => state.items.find(i => i.id === id);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 bg-muted/30 shrink-0 flex-wrap">
          {[
            { id: 'select' as Tool, icon: MousePointer2, label: 'Select' },
            { id: 'sticky' as Tool, icon: Plus, label: 'Sticky' },
            { id: 'text' as Tool, icon: Type, label: 'Text' },
            { id: 'rect' as Tool, icon: Square, label: 'Rect' },
            { id: 'circle' as Tool, icon: Circle, label: 'Circle' },
            { id: 'line' as Tool, icon: Minus, label: 'Line' },
            { id: 'connect' as Tool, icon: ArrowRight, label: 'Connect' },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => { setTool(id); setConnectFrom(null); setLineStart(null); }}
              className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${tool === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
              title={label}>
              <Icon size={14} />
            </button>
          ))}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <div className="relative">
            <button onClick={() => setColorPickerOpen(!colorPickerOpen)}
              className="p-1.5 rounded-lg text-xs flex items-center gap-1 text-muted-foreground hover:bg-muted"
              title="Color">
              <Palette size={14} />
              <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: selectedColor }} />
            </button>
            {colorPickerOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-premium p-2 grid grid-cols-5 gap-1">
                {COLORS.map(c => (
                  <button key={c} onClick={() => { setSelectedColor(c); setColorPickerOpen(false); }}
                    className="w-6 h-6 rounded-lg border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><Undo2 size={14} /></button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><Redo2 size={14} /></button>
          {selectedId && <button onClick={deleteSelected} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><ZoomOut size={14} /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><Maximize size={14} /></button>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {tool === 'select' ? 'Drag to move' : tool === 'connect' ? (connectFrom ? 'Click target' : 'Click source') : tool === 'line' ? 'Click & drag' : 'Click to create'}
          </span>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: 'radial-gradient(circle, #e8e0d4 1px, transparent 1px)', backgroundSize: '24px 24px', cursor: isPanning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair' }}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}>

        <div className="absolute" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Connections */}
          <svg className="absolute" style={{ width: '1px', height: '1px', overflow: 'visible', zIndex: 5 }}>
            <defs>
              <marker id="board-arrow" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 1 L 11 4 L 0 7 L 2 4 Z" fill="#6366f1" />
              </marker>
            </defs>
            {state.connections.map(conn => {
              const from = getItemById(conn.from);
              const to = getItemById(conn.to);
              if (!from || !to) return null;
              const fx = from.x + (from.width || 100) / 2;
              const fy = from.y + (from.height || 50) / 2;
              const tx = to.x + (to.width || 100) / 2;
              const ty = to.y + (to.height || 50) / 2;
              const mx = (fx + tx) / 2;
              const my = (fy + ty) / 2 - 30;
              return (
                <g key={conn.id}>
                  <path d={`M ${fx} ${fy} Q ${mx} ${my} ${tx} ${ty}`} fill="none" stroke="#6366f1" strokeWidth={2.5} markerEnd="url(#board-arrow)" />
                </g>
              );
            })}
          </svg>

          {/* Items */}
          {state.items.map(item => {
            if (item.type === 'line' && item.from && item.to) {
              return (
                <svg key={item.id} className="absolute" style={{ width: '1px', height: '1px', overflow: 'visible', zIndex: 6 }}>
                  <line x1={item.from.x} y1={item.from.y} x2={item.to.x} y2={item.to.y}
                    stroke={item.color} strokeWidth={3} strokeLinecap="round" />
                </svg>
              );
            }
            return (
              <div key={item.id}
                className={`absolute select-none ${readOnly ? '' : 'cursor-move'} ${selectedId === item.id ? 'ring-2 ring-primary' : ''}`}
                style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height, zIndex: 10 }}
                onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                onDoubleClick={() => !readOnly && setEditingId(item.id)}>
                {item.type === 'sticky' ? (
                  <div className="w-full h-full rounded-xl shadow-premium p-3 flex flex-col" style={{ backgroundColor: item.color }}>
                    {editingId === item.id ? (
                      <textarea autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)}
                        className="w-full h-full bg-transparent border-none outline-none text-sm resize-none text-foreground/80" />
                    ) : (
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.text || 'Double click to edit'}</p>
                    )}
                  </div>
                ) : item.type === 'rect' ? (
                  <div className="w-full h-full rounded-xl border-2 flex items-center justify-center p-2" style={{ borderColor: item.color + '60', backgroundColor: item.color + '20' }}>
                    {editingId === item.id ? (
                      <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)}
                        className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground" />
                    ) : (
                      <p className="text-sm text-foreground/60 text-center">{item.text || 'Click to edit'}</p>
                    )}
                  </div>
                ) : item.type === 'circle' ? (
                  <div className="w-full flex items-center justify-center p-2" style={{ backgroundColor: item.color + '20', borderRadius: '50%', border: `2px solid ${item.color}60` }}>
                    {editingId === item.id ? (
                      <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)}
                        className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground" />
                    ) : (
                      <p className="text-sm text-foreground/60 text-center">{item.text || 'Click'}</p>
                    )}
                  </div>
                ) : (
                  <div className="w-full">
                    {editingId === item.id ? (
                      <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                        className="w-full bg-transparent border-b-2 border-primary outline-none font-serif text-foreground"
                        style={{ fontSize: item.fontSize || 24 }} />
                    ) : (
                      <p className="font-serif cursor-text" style={{ fontSize: item.fontSize || 24, color: item.color === COLORS[0] ? undefined : item.color }}
                        onClick={() => !readOnly && setEditingId(item.id)}>
                        {item.text || 'Click to edit'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
