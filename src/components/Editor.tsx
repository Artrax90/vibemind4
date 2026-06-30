import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import ReactMarkdown from 'react-markdown';
import ReminderModal from './ReminderModal';
import PublishModal from './PublishModal';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Bold, Italic, Link, Image, List, ListOrdered, Code, Table, Hash, ChevronDown } from 'lucide-react';

// Code block renderer - kept simple to avoid crashes

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCodeDropdown, setShowCodeDropdown] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [publishSlug, setPublishSlug] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);

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

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selected = content.substring(start, end);
    const newContent = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = start + prefix.length + selected.length + suffix.length;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const insertCodeBlock = (lang: string = '') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selected = content.substring(start, end);
    const prefix = '```' + lang + '\n';
    const suffix = '\n```';
    const newContent = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(newContent);
    setShowCodeDropdown(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = selected.length === 0 ? start + prefix.length : start + prefix.length + selected.length + suffix.length;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-8 py-4 border-b border-border/50 flex items-center justify-between">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPreview}
          className="text-3xl font-bold text-foreground bg-transparent outline-none flex-1 font-serif"
          placeholder={t('editor.noteTitlePlaceholder')}
        />
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => setShowReminderModal(true)}
            className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
            title={t('editor.reminder')}
          >
            <span className="text-lg">🔔</span>
          </button>
          <button
            onClick={async () => {
              const { api } = await import('../api/client');
              const result = await api.publishNote(note.id);
              if (result.slug) {
                setPublishSlug(result.slug);
                setShowPublishModal(true);
              }
            }}
            className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
            title={t('editor.publish')}
          >
            <span className="text-lg">🌐</span>
          </button>
          {onShare && (
            <button
              onClick={onShare}
              className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
              title="Share"
            >
              <span className="text-lg">↗</span>
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      {!isPreview && (
        <div className="px-8 py-2 flex items-center gap-1 border-b border-border/30 bg-muted/30">
          <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Bold"><Bold size={14} /></button>
          <button onClick={() => insertMarkdown('_', '_')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Italic"><Italic size={14} /></button>
          <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Link"><Link size={14} /></button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button onClick={() => insertMarkdown('1. ')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Numbered List"><ListOrdered size={14} /></button>
          <div className="relative">
            <button
              onClick={() => setShowCodeDropdown(!showCodeDropdown)}
              className={`p-1.5 rounded-lg hover:bg-accent transition-colors flex items-center gap-0.5 ${showCodeDropdown ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Code Block"
            >
              <Code size={14} />
              <ChevronDown size={10} />
            </button>
            {showCodeDropdown && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-premium p-1 w-32 overflow-hidden">
                {['python', 'javascript', 'bash', 'yaml', 'json', 'sql', 'markdown'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => insertCodeBlock(lang)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded-lg text-foreground capitalize"
                  >
                    {lang}
                  </button>
                ))}
                <button
                  onClick={() => insertCodeBlock('')}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded-lg text-muted-foreground border-t border-border/50 mt-1"
                >
                  Plain Text
                </button>
              </div>
            )}
          </div>
          <button onClick={() => insertMarkdown('[[', ']]')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors text-xs font-bold" title="Wikilink">[[ ]]</button>
          <button onClick={() => insertMarkdown('| Col1 | Col2 |\n| --- | --- |\n| ', ' |  |')} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Table"><Table size={14} /></button>
        </div>
      )}

      {/* Content */}
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
                code: ({children}: any) => {
                  return <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">{String(children || '')}</code>;
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
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent text-foreground/80 resize-none outline-none font-mono text-sm leading-relaxed"
            placeholder={t('editor.startWriting')}
          />
        )}
      </div>

      <ReminderModal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
        onConfirm={async (data) => {
          const { api } = await import('../api/client');
          await api.createReminder({ note_id: note.id, ...data });
        }}
      />

      <PublishModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        slug={publishSlug}
        title={note.title}
      />
    </div>
  );
}
