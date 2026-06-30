import React from 'react';
import { Note, Folder } from '../types';
import { Clock, Star } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type BentoGridProps = {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  onNoteClick: (id: string) => void;
  folderId?: string;
};

// Lumen-style warm, muted colors
const WARM_COLORS = [
  'bg-[#e8e0d4]',  // warm beige
  'bg-[#d4cfc7]',  // warm gray
  'bg-[#c8d0c4]',  // sage green
  'bg-[#d0c8b8]',  // sand
  'bg-[#c4c8d0]',  // cool gray
  'bg-[#d8d0c0]',  // cream
  'bg-[#c0c8c0]',  // muted green
  'bg-[#d0c0b0]',  // warm taupe
];

function getNoteSize(index: number, total: number): string {
  if (index === 0 && total > 2) return 'col-span-2 row-span-2';
  if (index % 7 === 0 && index > 0) return 'col-span-2 row-span-1';
  if (index % 5 === 0 && index > 0) return 'col-span-1 row-span-2';
  return 'col-span-1 row-span-1';
}

function getWarmColor(index: number): string {
  return WARM_COLORS[index % WARM_COLORS.length];
}

function extractFirstImage(content: string): string | null {
  const match = content.match(/!\[.*?\]\((.*?)\)/);
  return match ? match[1] : null;
}

function extractExcerpt(content: string, maxLen: number = 80): string {
  return content
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

export default function BentoGrid({ notes, folders, activeNoteId, onNoteClick, folderId }: BentoGridProps) {
  const { t } = useLanguage();
  const filteredNotes = folderId
    ? notes.filter(n => n.folderId === folderId)
    : notes;

  if (filteredNotes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground font-serif text-2xl">
        {t('editor.empty')}
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto scroll-elegant">
      {/* Header */}
      <div className="mb-6 px-2">
        <h1 className="font-serif text-4xl text-foreground mb-1">
          {folderId ? folders.find(f => f.id === folderId)?.name || t('bento.title') : t('bento.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{filteredNotes.length} {t('bento.notes')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[160px] gap-4 max-w-6xl mx-auto">
        {filteredNotes.map((note, i) => {
          const image = extractFirstImage(note.content || '');
          const excerpt = extractExcerpt(note.content || '');
          const sizeClass = getNoteSize(i, filteredNotes.length);
          const bgColor = getWarmColor(i);

          return (
            <div
              key={note.id}
              onClick={() => onNoteClick(note.id)}
              className={`${sizeClass} group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-premium-lg ${activeNoteId === note.id ? 'ring-2 ring-primary ring-offset-2' : 'shadow-premium'}`}
            >
              {/* Background */}
              {image ? (
                <>
                  <img
                    src={image}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                </>
              ) : (
                <div className={`absolute inset-0 ${bgColor}`} />
              )}

              {/* Content overlay */}
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                {/* Top: category badge + favorite */}
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-white/10">
                    {note.folderId
                      ? folders.find(f => f.id === note.folderId)?.name || t('bento.note')
                      : t('bento.note')}
                  </span>
                  {note.isPinned && (
                    <span className="text-white/80">
                      <Star size={14} className="fill-current" />
                    </span>
                  )}
                </div>

                {/* Bottom: title, excerpt, date */}
                <div>
                  <h3 className={`font-serif font-semibold leading-tight mb-1 line-clamp-2 ${image ? 'text-white' : 'text-foreground'} ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
                    {note.title || t('common.untitled')}
                  </h3>
                  {excerpt && (
                    <p className={`text-xs line-clamp-2 mb-2 ${image ? 'text-white/70' : 'text-muted-foreground'}`}>
                      {excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className={image ? 'text-white/50' : 'text-muted-foreground/50'} />
                      <span className={`text-[10px] ${image ? 'text-white/50' : 'text-muted-foreground/60'}`}>
                        {new Date(note.updated_at || note.created_at || '').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
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
