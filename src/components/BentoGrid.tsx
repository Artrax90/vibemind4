import React from 'react';
import { Note, Folder } from '../types';
import { FileText, Image, Tag, Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type BentoGridProps = {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  onNoteClick: (id: string) => void;
  folderId?: string;
};

const SIZES = ['col-span-1 row-span-1', 'col-span-1 row-span-2', 'col-span-2 row-span-1', 'col-span-2 row-span-2'];
const COLORS = [
  'from-primary/20 to-primary/5',
  'from-accent/20 to-accent/5',
  'from-blue-500/20 to-blue-500/5',
  'from-emerald-500/20 to-emerald-500/5',
  'from-amber-500/20 to-amber-500/5',
  'from-rose-500/20 to-rose-500/5',
];

function getNoteSize(index: number): string {
  if (index === 0) return 'col-span-2 row-span-2';
  if (index % 7 === 0) return 'col-span-2 row-span-1';
  if (index % 5 === 0) return 'col-span-1 row-span-2';
  return 'col-span-1 row-span-1';
}

function getNoteColor(index: number): string {
  return COLORS[index % COLORS.length];
}

function extractFirstImage(content: string): string | null {
  const match = content.match(/!\[.*?\]\((.*?)\)/);
  return match ? match[1] : null;
}

function extractExcerpt(content: string, maxLen: number = 100): string {
  return content.replace(/[#*\[\]`!>-]/g, '').replace(/\n+/g, ' ').trim().slice(0, maxLen);
}

export default function BentoGrid({ notes, folders, activeNoteId, onNoteClick, folderId }: BentoGridProps) {
  const { t } = useLanguage();
  const filteredNotes = folderId
    ? notes.filter(n => n.folderId === folderId)
    : notes;

  if (filteredNotes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t('editor.empty')}
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto scroll-elegant">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[140px] gap-3 max-w-6xl mx-auto">
        {filteredNotes.map((note, i) => {
          const image = extractFirstImage(note.content || '');
          const excerpt = extractExcerpt(note.content || '');
          const sizeClass = getNoteSize(i);
          const colorClass = getNoteColor(i);

          return (
            <div
              key={note.id}
              onClick={() => onNoteClick(note.id)}
              className={`${sizeClass} group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-premium-lg ${activeNoteId === note.id ? 'ring-2 ring-primary' : ''}`}
            >
              {image ? (
                <>
                  <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </>
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${colorClass}`} />
              )}

              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-white/70 bg-white/10 backdrop-blur-sm rounded-full px-2 py-0.5">
                    {note.folderId ? folders.find(f => f.id === note.folderId)?.name || 'Note' : 'Note'}
                  </span>
                  {note.isPinned && <span className="text-yellow-400 text-xs">★</span>}
                </div>

                <div>
                  <h3 className="text-white font-semibold text-lg leading-tight mb-1 line-clamp-2">
                    {note.title || t('common.untitled')}
                  </h3>
                  {excerpt && (
                    <p className="text-white/60 text-xs line-clamp-2">{excerpt}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Clock size={10} className="text-white/40" />
                    <span className="text-[10px] text-white/40">
                      {new Date(note.updated_at || note.created_at || '').toLocaleDateString('ru-RU')}
                    </span>
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
