import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

type EditorProps = {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onWikilinkClick?: (title: string) => void;
  onTagClick?: (tag: string) => void;
  isPreview?: boolean;
  onShare?: () => void;
  allNotes?: Note[];
};

export default function Editor({ note, onUpdate, isPreview = false }: EditorProps) {
  const { t } = useLanguage();
  const [content, setContent] = useState(note?.content || '');
  const [title, setTitle] = useState(note?.title || '');

  useEffect(() => {
    setContent(note?.content || '');
    setTitle(note?.title || '');
  }, [note?.id, note?.content, note?.title]);

  useEffect(() => {
    if (isPreview || !note || (content === note.content && title === note.title)) return;
    const timer = setTimeout(() => {
      onUpdate(note.id, { content, title });
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, title]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-8 py-4 border-b border-border/50">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPreview}
          className="text-2xl font-bold text-foreground bg-transparent outline-none w-full"
          placeholder={t('editor.noteTitlePlaceholder')}
        />
      </div>
      <div className="flex-1 p-8 overflow-y-auto">
        {isPreview ? (
          <div className="prose max-w-none text-foreground/80 whitespace-pre-wrap">
            {content}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent text-foreground/80 resize-none outline-none font-mono text-sm leading-relaxed"
            placeholder={t('editor.startWriting')}
          />
        )}
      </div>
    </div>
  );
}
