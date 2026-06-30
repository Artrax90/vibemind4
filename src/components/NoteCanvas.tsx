import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, MousePointer2, Type, Trash2, Undo2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type NoteCanvasProps = {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
};

type CanvasItem = {
  id: string;
  type: 'sticky' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
};

const COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#e0f2fe'];

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
  const [tool, setTool] = useState<'select' | 'sticky' | 'text'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
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

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    setSelectedId(null);
    setEditingId(null);
    if (tool === 'sticky' || tool === 'text') {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left - pan.x;
      const y = e.clientY - rect.top - pan.y;
      const newItem: CanvasItem = {
        id: `item-${Date.now()}`,
        type: tool === 'sticky' ? 'sticky' : 'text',
        x, y,
        width: tool === 'sticky' ? 180 : 300,
        height: tool === 'sticky' ? 120 : 40,
        text: '',
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
      save([...items, newItem]);
      setEditingId(newItem.id);
    }
  };

  const handleItemMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (readOnly) return;
    setSelectedId(id);
    const item = items.find(i => i.id === id);
    if (item) {
      const rect = containerRef.current!.getBoundingClientRect();
      setDragging(id);
      setDragOffset({
        x: e.clientX - rect.left - pan.x - item.x,
        y: e.clientY - rect.top - pan.y - item.y
      });
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragging) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left - pan.x - dragOffset.x;
      const y = e.clientY - rect.top - pan.y - dragOffset.y;
      setItems(prev => prev.map(i => i.id === dragging ? { ...i, x, y } : i));
    }
  }, [isPanning, pan, dragging, dragOffset, panStart]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      onChange(serializeCanvasItems(items, content));
    }
    setIsPanning(false);
    setDragging(null);
  }, [dragging, items, content, onChange]);

  const serializeCanvasItems = (its: CanvasItem[], orig: string) => {
    const clean = orig.replace(/<!-- canvas:.*?-->/s, '').trim();
    return clean + '\n\n<!-- canvas:' + JSON.stringify(its) + ' -->';
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
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/30">
          <button onClick={() => setTool('select')} className={`p-1.5 rounded-lg text-xs ${tool === 'select' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>
            <MousePointer2 size={14} />
          </button>
          <button onClick={() => setTool('sticky')} className={`p-1.5 rounded-lg text-xs ${tool === 'sticky' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>
            <Plus size={14} />
          </button>
          <button onClick={() => setTool('text')} className={`p-1.5 rounded-lg text-xs ${tool === 'text' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>
            <Type size={14} />
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
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {tool === 'sticky' ? t('canvas.clickToCreate') : tool === 'text' ? t('canvas.clickToAddText') : t('canvas.dragToMove')}
          </span>
        </div>
      )}

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${readOnly ? '' : 'cursor-crosshair'}`}
        style={{ background: 'radial-gradient(circle, #e8e0d4 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onClick={handleBackgroundClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {items.map(item => (
            <div
              key={item.id}
              className={`absolute select-none ${readOnly ? '' : 'cursor-move'}`}
              style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height }}
              onMouseDown={(e) => handleItemMouseDown(e, item.id)}
              onDoubleClick={() => !readOnly && setEditingId(item.id)}
            >
              {item.type === 'sticky' ? (
                <div
                  className="w-full h-full rounded-xl shadow-premium p-3 flex flex-col"
                  style={{ backgroundColor: item.color }}
                >
                  {editingId === item.id ? (
                    <textarea
                      autoFocus
                      value={item.text}
                      onChange={(e) => updateItemText(item.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      className="w-full h-full bg-transparent border-none outline-none text-sm resize-none text-foreground/80"
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.text || t('canvas.doubleClickToEdit')}</p>
                  )}
                </div>
              ) : (
                <div className="w-full">
                  {editingId === item.id ? (
                    <input
                      autoFocus
                      value={item.text}
                      onChange={(e) => updateItemText(item.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                      className="w-full bg-transparent border-b-2 border-primary outline-none text-lg font-serif text-foreground"
                    />
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
