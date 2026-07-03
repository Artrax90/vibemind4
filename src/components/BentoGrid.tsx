import React from 'react';
import { Note, Folder } from '../types';
import { Clock, Star, GripVertical } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type BentoGridProps = {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  onNoteClick: (id: string) => void;
  folderId?: string;
};

const WARM_COLORS = [
  'bg-[#e8e0d4]',
  'bg-[#d4cfc7]',
  'bg-[#c8d0c4]',
  'bg-[#d0c8b8]',
  'bg-[#c4c8d0]',
  'bg-[#d8d0c0]',
  'bg-[#c0c8c0]',
  'bg-[#d0c0b0]',
];

const DARK_WARM_COLORS = [
  'bg-[#2a2535]',
  'bg-[#252a30]',
  'bg-[#2a3028]',
  'bg-[#302a25]',
  'bg-[#252a35]',
  'bg-[#2e2820]',
  'bg-[#252e25]',
  'bg-[#302528]',
];

function getNoteSize(index: number, total: number): string {
  if (index === 0 && total > 2) return 'col-span-2 row-span-2';
  if (index % 7 === 0 && index > 0) return 'col-span-2 row-span-1';
  if (index % 5 === 0 && index > 0) return 'col-span-1 row-span-2';
  return 'col-span-1 row-span-1';
}

function getWarmColor(index: number, dark: boolean): string {
  return dark ? DARK_WARM_COLORS[index % DARK_WARM_COLORS.length] : WARM_COLORS[index % WARM_COLORS.length];
}

function isBoardNote(note: Note): boolean {
  return !!(note.content && note.content.includes('<!-- board:'));
}

function parseBoardItems(note: Note): any[] {
  try {
    const m = (note.content || '').match(/<!-- board:(.*?) -->/s);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    return data.items || [];
  } catch { return []; }
}

function extractFirstImage(content: string): string | null {
  const match = content.match(/!\[.*?\]\((.*?)\)/);
  return match ? match[1] : null;
}

function extractEmbedUrl(content: string): { type: 'youtube' | 'spotify' | 'github'; url: string; id: string; thumb?: string } | null {
  const ytMatch = content.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (ytMatch) return { type: 'youtube', url: ytMatch[0], id: ytMatch[1], thumb: `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg` };
  const spMatch = content.match(/open\.spotify\.com\/(track|playlist|album)\/([^?]+)/);
  if (spMatch) return { type: 'spotify', url: spMatch[0], id: spMatch[2] };
  const ghMatch = content.match(/github\.com\/([^/]+)\/([^/\s]+)/);
  if (ghMatch) return { type: 'github', url: ghMatch[0], id: `${ghMatch[1]}/${ghMatch[2]}` };
  return null;
}

function extractExcerpt(content: string, maxLen: number = 80): string {
  return content
    .replace(/<!--.*?-->/gs, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function getOrderKey(folderId?: string): string {
  return `bento_order_${folderId || 'all'}`;
}

function loadOrder(folderId?: string): string[] {
  try {
    const raw = localStorage.getItem(getOrderKey(folderId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOrder(ids: string[], folderId?: string) {
  localStorage.setItem(getOrderKey(folderId), JSON.stringify(ids));
}

function sortNotesByOrder(notes: Note[], folderId?: string): Note[] {
  const order = loadOrder(folderId);
  if (order.length === 0) return notes;
  const byId = new Map(notes.map(n => [n.id, n]));
  const sorted: Note[] = [];
  for (const id of order) {
    const note = byId.get(id);
    if (note) { sorted.push(note); byId.delete(id); }
  }
  for (const note of byId.values()) sorted.push(note);
  return sorted;
}

function BoardMiniPreview({ items, dark }: { items: any[]; dark: boolean }) {
  if (items.length === 0) return null;
  const svgW = 280;
  const svgH = 180;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  items.forEach((it: any) => {
    minX = Math.min(minX, it.x || 0);
    minY = Math.min(minY, it.y || 0);
    maxX = Math.max(maxX, (it.x || 0) + (it.w || 120));
    maxY = Math.max(maxY, (it.y || 0) + (it.h || 80));
  });
  const bw = Math.max(maxX - minX + 40, 100);
  const bh = Math.max(maxY - minY + 40, 100);
  const scale = Math.min(svgW / bw, svgH / bh);

  const clipPaths: Record<string, string> = {
    diamond: '50,0 100,50 50,100 0,50',
    triangle: '50,0 0,100 100,100',
    hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
    star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35',
    parallelogram: '20,0 100,0 80,100 0,100',
  };

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
      <rect width={svgW} height={svgH} fill="transparent" />
      <g transform={`translate(${(svgW - bw * scale) / 2 - minX * scale + 20 * scale}, ${(svgH - bh * scale) / 2 - minY * scale + 20 * scale}) scale(${scale})`}>
        {items.filter((it: any) => it.type !== 'line' && it.type !== 'curve').map((it: any, i: number) => {
          const x = it.x || 0;
          const y = it.y || 0;
          const w = it.w || 120;
          const h = it.h || 80;
          const color = it.color || '#fef3c7';
          const border = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

          if (it.type === 'circle') {
            return <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={color} stroke={border} strokeWidth={1.5} />;
          }
          const pts = clipPaths[it.type];
          if (pts) {
            return <polygon key={i} points={pts} fill={color} stroke={border} strokeWidth={2} vectorEffect="non-scaling-stroke"
              transform={`translate(${x},${y}) scale(${w / 100},${h / 100})`} />;
          }
          const r = it.type === 'rounded' ? 8 : 4;
          return <rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={color} stroke={border} strokeWidth={1.5} />;
        })}
        {items.filter((it: any) => it.type === 'line' || it.type === 'curve').map((it: any, i: number) => (
          <line key={`l-${i}`} x1={it.x || 0} y1={it.y || 0} x2={it.x2 || it.x || 0} y2={it.y2 || it.y || 0}
            stroke={it.color || '#888'} strokeWidth={2} />
        ))}
      </g>
    </svg>
  );
}

function EmbedBadge({ embed }: { embed: { type: string; id: string; thumb?: string } }) {
  if (embed.type === 'youtube' && embed.thumb) {
    return (
      <div className="absolute inset-0">
        <img src={embed.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      </div>
    );
  }
  if (embed.type === 'spotify') {
    return (
      <div className="absolute inset-0 bg-[#1DB954] flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-12 h-12 text-white/80 fill-current">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      </div>
    );
  }
  if (embed.type === 'github') {
    return (
      <div className="absolute inset-0 bg-[#24292e] flex flex-col items-center justify-center gap-2">
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-white fill-current">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        <span className="text-white/80 text-xs font-mono">{embed.id}</span>
      </div>
    );
  }
  return null;
}

export default function BentoGrid({ notes, folders, activeNoteId, onNoteClick, folderId }: BentoGridProps) {
  const { t } = useLanguage();
  const [isDark, setIsDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);
  const [orderVersion, setOrderVersion] = React.useState(0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const filteredNotes = React.useMemo(() => {
    const base = folderId
      ? notes.filter(n => n.folderId === folderId)
      : notes;
    return sortNotesByOrder(base, folderId);
  }, [notes, folderId, orderVersion]);

  if (filteredNotes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground font-serif text-2xl">
        {t('editor.empty')}
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && dragIdx !== idx) {
      setOverIdx(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;

    const newNotes = [...filteredNotes];
    const [moved] = newNotes.splice(dragIdx, 1);
    newNotes.splice(dropIdx, 0, moved);

    saveOrder(newNotes.map(n => n.id), folderId);
    setOrderVersion(v => v + 1);
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="p-6 h-full overflow-y-auto scroll-elegant">
      <div className="mb-6 px-2">
        <h1 className="font-serif text-4xl text-foreground mb-1">
          {folderId ? folders.find(f => f.id === folderId)?.name || t('bento.title') : t('bento.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{filteredNotes.length} {t('bento.notes')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[160px] gap-4 max-w-6xl mx-auto">
        {filteredNotes.map((note, i) => {
          const board = isBoardNote(note);
          const items = board ? parseBoardItems(note) : [];
          const image = board ? null : extractFirstImage(note.content || '');
          const embed = board ? null : extractEmbedUrl(note.content || '');
          const excerpt = board
            ? (items.length > 0 ? `${items.length} элементов` : 'Пустая доска')
            : extractExcerpt(note.content || '');
          const sizeClass = getNoteSize(i, filteredNotes.length);
          const bgColor = getWarmColor(i, isDark);
          const isDragOver = overIdx === i && dragIdx !== null && dragIdx !== i;

          return (
            <div
              key={note.id}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onClick={() => onNoteClick(note.id)}
              className={`${sizeClass} group relative rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-300 hover:-translate-y-1 hover:shadow-premium-lg ${isDragOver ? 'ring-2 ring-primary scale-[1.02]' : ''} ${activeNoteId === note.id ? `ring-2 ring-primary ${isDark ? 'ring-offset-[#1a1a2e]' : 'ring-offset-2'}` : isDark ? 'shadow-[0_2px_12px_rgba(0,0,0,0.4)]' : 'shadow-premium'}`}
            >
              {/* Background */}
              {embed ? (
                <EmbedBadge embed={embed} />
              ) : image ? (
                <>
                  <img
                    src={image}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                </>
              ) : board ? (
                <div className={`absolute inset-0 ${isDark ? 'bg-[#1e1e2e]' : 'bg-[#f8f5f0]'}`}>
                  <BoardMiniPreview items={items} dark={isDark} />
                </div>
              ) : (
                <div className={`absolute inset-0 ${bgColor}`} />
              )}

              {/* Drag handle */}
              <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical size={16} className="text-white/60 drop-shadow" />
              </div>

              {/* Content overlay */}
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-white/10">
                    {note.folderId
                      ? folders.find(f => f.id === note.folderId)?.name || (board ? t('bento.board') : t('bento.note'))
                      : board ? t('bento.board') : t('bento.note')}
                  </span>
                  {note.isPinned && (
                    <span className="text-white/80">
                      <Star size={14} className="fill-current" />
                    </span>
                  )}
                </div>

                <div>
                  <h3 className={`font-serif font-semibold leading-tight mb-1 line-clamp-2 ${(embed || image) ? 'text-white' : 'text-foreground'} ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
                    {note.title || t('common.untitled')}
                  </h3>
                  {excerpt && (
                    <p className={`text-xs line-clamp-2 mb-2 ${(embed || image) ? 'text-white/70' : 'text-muted-foreground'}`}>
                      {excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className={(embed || image) ? 'text-white/50' : 'text-muted-foreground/50'} />
                      <span className={`text-[10px] ${(embed || image) ? 'text-white/50' : 'text-muted-foreground/60'}`}>
                        {new Date(note.updated_at || (note as any).created_at || '').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
