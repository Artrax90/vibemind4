import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, MousePointer2, Type, Trash2, Undo2, Square, Circle, ZoomIn, ZoomOut } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type NoteCanvasProps = {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
};

type CanvasItem = {
  id: string;
  type: 'sticky' | 'text' | 'rect' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
};

const COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#e0f2fe', '#fed7aa', '#d1fae5'];

function parseCanvasContent(content: string): CanvasItem[] {
  try {
    const match = content.match(/<!-- canvas:(.*?) -->/s);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return [];
}

function serializeCanvasContent(items: CanvasItem[], originalContent: string): string {
  const clean = originalContent.replace(/<!-- canvas:.*?-->/s, '').trim();
  return clean + '\n\n<!-- canvas:' + JSON.stringify(items) + ' -->';
}

export default function NoteCanvas({ content, onChange, readOnly = false }: NoteCanvasProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<CanvasItem[]>(() => parseCanvasContent(content));
  const [tool, setTool] = useState<'select' | 'sticky' | 'text' | 'rect' | 'circle'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasItem[][]>([]);

  const save = (newItems: CanvasItem[]) => {
    setItems(newItems);
    setHistory(prev => [...prev.slice(-20), items]);
    onChange(serializeCanvasContent(newItems, content));
  };

  const undo = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      setItems(prev);
      onChange(serializeCanvasContent(prev, content));
    }
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    setSelectedId(null);
    setEditingId(null);
    if (tool === 'sticky' || tool === 'text' || tool === 'rect' || tool === 'circle') {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const newItem: CanvasItem = {
        id: `item-${Date.now()}`,
        type: tool === 'sticky' ? 'sticky' : tool === 'text' ? 'text' : tool === 'rect' ? 'rect' : 'circle',
        x, y,
        width: tool === 'sticky' ? 180 : tool === 'text' ? 250 : tool === 'rect' ? 200 : 120,
        height: tool === 'sticky' ? 140 : tool === 'text' ? 40 : tool === 'rect' ? 120 : 120,
        text: '',
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
      save([...items, newItem]);
      setEditingId(newItem.id);
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragging) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x;
      const y = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y;
      setItems(prev => prev.map(i => i.id === dragging ? { ...i, x, y } : i));
    }
  }, [isPanning, pan, zoom, dragging, dragOffset, panStart]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      onChange(serializeCanvasContent(items, content));
    }
    setIsPanning(false);
    setDragging(null);
  }, [dragging, items, content, onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.3, z * delta)));
  }, []);

  const handleItemMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (readOnly) return;
    setSelectedId(id);
    const item = items.find(i => i.id === id);
    if (item) {
      const rect = containerRef.current!.getBoundingClientRect();
      setDragging(id);
      setDragOffset({
        x: (e.clientX - rect.left - pan.x) / zoom - item.x,
        y: (e.clientY - rect.top - pan.y) / zoom - item.y
      });
    }
  };

  const deleteItem = (id: string) => {
    save(items.filter(i => i.id !== id));
    setSelectedId(null);
  };

  const updateItemText = (id: string, text: string) => {
    save(items.map(i => i.id === id ? { ...i, text } : i));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Canvas toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/30 shrink-0">
          <button onClick={() => setTool('select')} className={`p-1.5 rounded-lg text-xs ${tool === 'select' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('canvas.select')}>
            <MousePointer2 size={14} />
          </button>
          <button onClick={() => setTool('sticky')} className={`p-1.5 rounded-lg text-xs ${tool === 'sticky' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('canvas.sticky')}>
            <Plus size={14} />
          </button>
          <button onClick={() => setTool('text')} className={`p-1.5 rounded-lg text-xs ${tool === 'text' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('canvas.text')}>
            <Type size={14} />
          </button>
          <button onClick={() => setTool('rect')} className={`p-1.5 rounded-lg text-xs ${tool === 'rect' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('canvas.rectangle')}>
            <Square size={14} />
          </button>
          <button onClick={() => setTool('circle')} className={`p-1.5 rounded-lg text-xs ${tool === 'circle' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} title={t('canvas.circle')}>
            <Circle size={14} />
          </button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={undo} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted text-xs" title="Undo">
            <Undo2 size={14} />
          </button>
          {selectedId && (
            <button onClick={() => deleteItem(selectedId)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 text-xs">
              <Trash2 size={14} />
            </button>
          )}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted text-xs"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted text-xs"><ZoomOut size={14} /></button>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {tool === 'select' ? t('canvas.dragToMove') : tool === 'sticky' ? t('canvas.clickToCreate') : t('canvas.clickToAddText')}
          </span>
        </div>
      )}

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: 'radial-gradient(circle, #e8e0d4 1px, transparent 1px)', backgroundSize: '24px 24px', cursor: isPanning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair' }}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div className="absolute" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {items.map(item => (
            <div
              key={item.id}
              className={`absolute select-none ${readOnly ? '' : 'cursor-move'} ${selectedId === item.id ? 'ring-2 ring-primary' : ''}`}
              style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height }}
              onMouseDown={(e) => handleItemMouseDown(e, item.id)}
              onDoubleClick={() => !readOnly && setEditingId(item.id)}
            >
              {item.type === 'sticky' ? (
                <div className="w-full h-full rounded-xl shadow-premium p-3 flex flex-col" style={{ backgroundColor: item.color }}>
                  {editingId === item.id ? (
                    <textarea autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)} className="w-full h-full bg-transparent border-none outline-none text-sm resize-none text-foreground/80" />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.text || t('canvas.doubleClickToEdit')}</p>
                  )}
                </div>
              ) : item.type === 'rect' ? (
                <div className="w-full h-full rounded-xl border-2 border-foreground/20 flex items-center justify-center p-2" style={{ backgroundColor: item.color + '40' }}>
                  {editingId === item.id ? (
                    <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground" />
                  ) : (
                    <p className="text-sm text-foreground/60 text-center">{item.text || t('canvas.clickToEdit')}</p>
                  )}
                </div>
              ) : item.type === 'circle' ? (
                <div className="w-full flex items-center justify-center p-2" style={{ backgroundColor: item.color + '40', borderRadius: '50%', border: '2px solid rgba(0,0,0,0.1)' }}>
                  {editingId === item.id ? (
                    <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground" />
                  ) : (
                    <p className="text-sm text-foreground/60 text-center">{item.text || t('canvas.clickToEdit')}</p>
                  )}
                </div>
              ) : (
                <div className="w-full">
                  {editingId === item.id ? (
                    <input autoFocus value={item.text} onChange={(e) => updateItemText(item.id, e.target.value)} onBlur={() => setEditingId(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)} className="w-full bg-transparent border-b-2 border-primary outline-none text-lg font-serif text-foreground" />
                  ) : (
                    <p className="text-lg font-serif text-foreground cursor-text" onClick={() => !readOnly && setEditingId(item.id)}>
                      {item.text || t('canvas.clickToEdit')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
