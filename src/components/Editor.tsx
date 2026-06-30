import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

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
          className="text-3xl font-bold text-foreground bg-transparent outline-none w-full font-serif"
          placeholder={t('editor.noteTitlePlaceholder')}
        />
      </div>
      <div className="flex-1 p-8 overflow-y-auto scroll-elegant">
        {isPreview ? (
          <div className="prose max-w-none text-foreground/80">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                h1: ({children}) => <h1 className="font-serif text-4xl font-bold text-foreground mt-8 mb-4">{children}</h1>,
                h2: ({children}) => <h2 className="font-serif text-3xl font-bold text-foreground mt-6 mb-3">{children}</h2>,
                h3: ({children}) => <h3 className="font-serif text-2xl font-semibold text-foreground mt-5 mb-2">{children}</h3>,
                p: ({children}) => <p className="mb-4 leading-relaxed text-foreground/80">{children}</p>,
                blockquote: ({children}) => <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4">{children}</blockquote>,
                a: ({children, ...props}) => <a {...props} className="text-primary underline decoration-primary/30 hover:decoration-primary">{children}</a>,
                code: ({children, className}) => {
                  if (className) {
                    return <code className="block bg-card border border-border/50 rounded-xl p-4 text-sm font-mono overflow-x-auto my-4">{children}</code>;
                  }
                  return <code className="bg-muted px-1.5 py-0.5 rounded-lg text-sm font-mono">{children}</code>;
                },
                ul: ({children}) => <ul className="list-disc list-inside my-4 space-y-1 text-foreground/80">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal list-inside my-4 space-y-1 text-foreground/80">{children}</ol>,
                hr: () => <hr className="border-border my-8" />,
              }}
            >
              {content}
            </ReactMarkdown>
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
