import React, { useState, useRef, useCallback } from 'react';
import { Plus, MousePointer2, Type, Square, Circle, Minus, ArrowRight, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Palette } from 'lucide-react';

type Item = {
  id: string;
  type: 'sticky' | 'text' | 'rect' | 'circle' | 'line';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize?: number;
  x2?: number;
  y2?: number;
};

type BoardData = { items: Item[] };

type Tool = 'select' | 'sticky' | 'text' | 'rect' | 'circle' | 'line' | 'connect';

const PALETTE = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#e0f2fe', '#fed7aa', '#d1fae5', '#fecaca', '#e0e7ff'];

function parseBoard(c: string): BoardData {
  try { const m = c.match(/<!-- board:(.*?) -->/s); if (m) return JSON.parse(m[1]); } catch {}
  return { items: [] };
}

function saveBoard(d: BoardData, orig: string): string {
  const clean = orig.replace(/<!-- board:.*?-->/s, '').trim();
  return clean + '\n\n<!-- board:' + JSON.stringify(d) + ' -->';
}

type Props = { content: string; onChange: (c: string) => void; readOnly?: boolean };

export default function BoardEditor({ content, onChange, readOnly }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<BoardData>(() => parseBoard(content));
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<string | null>(null);
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
  const [lineStart, setLineStart] = useState<{x:number;y:number}|null>(null);

  const push = (d: BoardData) => {
    setData(d);
    setHist(h => [...h.slice(0, histIdx + 1), data]);
    setHistIdx(i => i + 1);
    onChange(saveBoard(d, content));
  };
  const undo = () => { if (histIdx > 0) { const p = hist[histIdx-1]; setData(p); setHistIdx(histIdx-1); onChange(saveBoard(p, content)); } };
  const redo = () => { if (histIdx < hist.length-1) { const n = hist[histIdx+1]; setData(n); setHistIdx(histIdx+1); onChange(saveBoard(n, content)); } };

  const bgDown = (e: React.MouseEvent) => {
    if (e.target !== ref.current) return;
    setSel(null); setEditId(null);
    if (tool === 'line') {
      const r = ref.current!.getBoundingClientRect();
      setLineStart({ x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom });
      return;
    }
    if (['sticky','text','rect','circle'].includes(tool)) {
      const r = ref.current!.getBoundingClientRect();
      const x = (e.clientX - r.left - pan.x) / zoom;
      const y = (e.clientY - r.top - pan.y) / zoom;
      const item: Item = { id: `i-${Date.now()}`, type: tool as any, x, y, w: tool==='sticky'?200:tool==='text'?300:tool==='rect'?240:140, h: tool==='sticky'?160:tool==='text'?40:tool==='rect'?160:140, text: '', color, fontSize: tool==='text'?24:14 };
      push({ items: [...data.items, item] });
      setEditId(item.id);
      return;
    }
    setPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const onMove = useCallback((e: React.MouseEvent) => {
    if (panning) { setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); return; }
    if (drag) {
      const r = ref.current!.getBoundingClientRect();
      const x = (e.clientX - r.left - pan.x) / zoom - off.x;
      const y = (e.clientY - r.top - pan.y) / zoom - off.y;
      setData(d => ({ ...d, items: d.items.map(i => i.id === drag ? { ...i, x, y } : i) }));
    }
    if (lineStart) {
      const r = ref.current!.getBoundingClientRect();
      const temp: Item = { id: '__tmp__', type: 'line', x: 0, y: 0, w: 0, h: 0, text: '', color, x2: (e.clientX - r.left - pan.x) / zoom, y2: (e.clientY - r.top - pan.y) / zoom };
      setData(d => ({ ...d, items: [...d.items.filter(i => i.id !== '__tmp__'), temp] }));
    }
  }, [panning, pan, zoom, drag, off, lineStart, color]);

  const onUp = useCallback(() => {
    if (drag) onChange(saveBoard(data, content));
    if (lineStart) {
      const tmp = data.items.find(i => i.id === '__tmp__');
      if (tmp && tmp.x2 !== undefined && tmp.y2 !== undefined) {
        const dx = tmp.x2 - lineStart.x, dy = tmp.y2 - lineStart.y;
        if (Math.sqrt(dx*dx+dy*dy) > 20) {
          const item: Item = { id: `line-${Date.now()}`, type: 'line', x: 0, y: 0, w: 0, h: 0, text: '', color, x2: tmp.x2, y2: tmp.y2 };
          push({ items: [...data.items.filter(i => i.id !== '__tmp__'), item] });
        } else {
          setData(d => ({ ...d, items: d.items.filter(i => i.id !== '__tmp__') }));
        }
      }
      setLineStart(null);
    }
    setPanning(false); setDrag(null);
  }, [drag, data, content, onChange, lineStart, color]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.2, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const itemDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (readOnly) return;
    if (tool === 'connect') {
      if (!connectFrom) setConnectFrom(id);
      setSel(id);
      return;
    }
    setSel(id);
    const item = data.items.find(i => i.id === id);
    if (item) {
      const r = ref.current!.getBoundingClientRect();
      setDrag(id);
      setOff({ x: (e.clientX - r.left - pan.x) / zoom - item.x, y: (e.clientY - r.top - pan.y) / zoom - item.y });
    }
  };

  const delSel = () => { if (!sel) return; push({ items: data.items.filter(i => i.id !== sel) }); setSel(null); };
  const updateText = (id: string, t: string) => push({ items: data.items.map(i => i.id === id ? { ...i, text: t } : i) });

  return (
    <div className="flex flex-col h-full bg-background">
      {!readOnly && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 bg-muted/30 shrink-0 flex-wrap">
          {([['select',MousePointer2],['sticky',Plus],['text',Type],['rect',Square],['circle',Circle],['line',Minus],['connect',ArrowRight]] as [Tool,any][]).map(([id,Icon]) => (
            <button key={id} onClick={() => { setTool(id); setConnectFrom(null); setLineStart(null); }}
              className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${tool===id?'bg-foreground text-background':'text-muted-foreground hover:bg-muted'}`}>
              <Icon size={14} />
            </button>
          ))}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <div className="relative">
            <button onClick={() => setShowColors(!showColors)} className="p-1.5 rounded-lg text-xs flex items-center gap-1 text-muted-foreground hover:bg-muted">
              <Palette size={14} /><span className="w-3 h-3 rounded-full border border-border" style={{backgroundColor:color}} />
            </button>
            {showColors && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-premium p-2 grid grid-cols-5 gap-1">
                {PALETTE.map(c => <button key={c} onClick={() => { setColor(c); setShowColors(false); }} className="w-6 h-6 rounded-lg border border-border hover:scale-110" style={{backgroundColor:c}} />)}
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={undo} disabled={histIdx<=0} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><Undo2 size={14}/></button>
          <button onClick={redo} disabled={histIdx>=hist.length-1} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><Redo2 size={14}/></button>
          {sel && <button onClick={delSel} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 size={14}/></button>}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={() => setZoom(z=>Math.min(3,z*1.2))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><ZoomIn size={14}/></button>
          <button onClick={() => setZoom(z=>Math.max(0.2,z*0.8))} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><ZoomOut size={14}/></button>
          <button onClick={() => {setZoom(1);setPan({x:0,y:0});}} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><Maximize size={14}/></button>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {tool==='select'?'Drag':tool==='connect'?(connectFrom?'Click target':'Click source'):tool==='line'?'Drag':'Click to add'}
          </span>
        </div>
      )}

      <div ref={ref} className="flex-1 relative overflow-hidden"
        style={{background:'radial-gradient(circle,#e8e0d4 1px,transparent 1px)',backgroundSize:'24px 24px',cursor:panning?'grabbing':tool==='select'?'default':'crosshair'}}
        onMouseDown={bgDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}>
        <div className="absolute" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:'0 0'}}>
          {data.items.map(item => {
            if (item.type==='line' && item.x2!==undefined) {
              return <svg key={item.id} className="absolute" style={{width:'1px',height:'1px',overflow:'visible',zIndex:6}}>
                <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={3} strokeLinecap="round" />
              </svg>;
            }
            return (
              <div key={item.id} className={`absolute select-none ${readOnly?'':'cursor-move'} ${sel===item.id?'ring-2 ring-primary':''}`}
                style={{left:item.x,top:item.y,width:item.w,minHeight:item.h,zIndex:10}}
                onMouseDown={e => itemDown(e,item.id)}
                onDoubleClick={() => !readOnly && setEditId(item.id)}>
                {item.type==='sticky' ? (
                  <div className="w-full h-full rounded-xl shadow-premium p-3" style={{backgroundColor:item.color}}>
                    {editId===item.id
                      ? <textarea autoFocus value={item.text} onChange={e=>updateText(item.id,e.target.value)} onBlur={()=>setEditId(null)} className="w-full h-full bg-transparent border-none outline-none text-sm resize-none text-foreground/80"/>
                      : <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.text||'Double click to edit'}</p>}
                  </div>
                ) : item.type==='rect' ? (
                  <div className="w-full h-full rounded-xl border-2 flex items-center justify-center p-2" style={{borderColor:item.color+'60',backgroundColor:item.color+'20'}}>
                    {editId===item.id
                      ? <input autoFocus value={item.text} onChange={e=>updateText(item.id,e.target.value)} onBlur={()=>setEditId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground"/>
                      : <p className="text-sm text-foreground/60 text-center">{item.text||'Click to edit'}</p>}
                  </div>
                ) : item.type==='circle' ? (
                  <div className="w-full flex items-center justify-center p-2" style={{backgroundColor:item.color+'20',borderRadius:'50%',border:`2px solid ${item.color}60`}}>
                    {editId===item.id
                      ? <input autoFocus value={item.text} onChange={e=>updateText(item.id,e.target.value)} onBlur={()=>setEditId(null)} className="w-full bg-transparent border-none outline-none text-sm text-center text-foreground"/>
                      : <p className="text-sm text-foreground/60 text-center">{item.text||'Click'}</p>}
                  </div>
                ) : (
                  <div className="w-full">
                    {editId===item.id
                      ? <input autoFocus value={item.text} onChange={e=>updateText(item.id,e.target.value)} onBlur={()=>setEditId(null)} onKeyDown={e=>e.key==='Enter'&&setEditId(null)} className="w-full bg-transparent border-b-2 border-primary outline-none font-serif text-foreground" style={{fontSize:item.fontSize||24}}/>
                      : <p className="font-serif cursor-text" style={{fontSize:item.fontSize||24,color:item.color===PALETTE[0]?undefined:item.color}} onClick={()=>!readOnly&&setEditId(item.id)}>{item.text||'Click to edit'}</p>}
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
