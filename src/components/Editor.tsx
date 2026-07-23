import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import { api } from '../api/client';
import { FileText, Eye, Edit3, Wand2, Share2, Bold, Italic, Link, Image, List, ListOrdered, Code, Table, CheckCircle, Cloud, CloudOff, Hash, Network, Globe, Bell, CalendarPlus, Check } from 'lucide-react';
import ReminderModal from './ReminderModal';
import PublishModal from './PublishModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useLanguage } from '../contexts/LanguageContext';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

const TAG_COLORS: Record<string, string> = {
  work: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ideas: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  todo: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  important: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  meeting: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  project: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

function getTagColor(tag: string): string {
  const base = tag.replace(/^#/, '').split('/')[0].toLowerCase();
  return TAG_COLORS[base] || 'bg-muted text-muted-foreground';
}

function MermaidDiagram({ code }: { code: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState('');

  React.useEffect(() => {
    if (ref.current && code) {
      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
      mermaid.render(id, code).then(({ svg }) => setSvg(svg)).catch(() => setSvg(''));
    }
  }, [code]);

  return <div ref={ref} className="my-4 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function renderContentBase(text: string): string {
  let parsed = text.replace(/\[\[(.*?)\]\]/g, '<span class="wikilink text-primary cursor-pointer hover:underline" data-title="$1">$1</span>');
  parsed = parsed.replace(/(^|\s)#([^\s#]+)/g, '$1<span class="tag text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm cursor-pointer hover:bg-primary/20" data-tag="$2">#$2</span>');
  return parsed;
}

function renderContentWithTags(text: string): React.ReactNode[] {
  const parts = text.split(/(#[\w/]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      return <span key={i} className={`inline-block px-1.5 py-0.5 rounded-md text-xs font-medium ${getTagColor(part)}`}>{part}</span>;
    }
    return <span key={i} dangerouslySetInnerHTML={{ __html: renderContentBase(part) }} />;
  });
}

function EmbedPreview({ href }: { href: string }) {
  const [embedHtml, setEmbedHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = href;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (ytMatch) {
      setEmbedHtml(`<iframe width="100%" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen class="rounded-xl"></iframe>`);
      return;
    }
    // Spotify
    const spMatch = url.match(/open\.spotify\.com\/(track|playlist|album)\/([^?]+)/);
    if (spMatch) {
      setEmbedHtml(`<iframe src="https://open.spotify.com/embed/${spMatch[1]}/${spMatch[2]}" width="100%" height="152" frameborder="0" allowfullscreen class="rounded-xl"></iframe>`);
      return;
    }
    // GitHub repo
    const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (ghMatch) {
      setEmbedHtml(`<div class="border border-border rounded-xl p-4 flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></div><div><div class="font-medium text-sm">${ghMatch[1]}/${ghMatch[2]}</div><div class="text-xs text-muted-foreground">GitHub Repository</div></div></div>`);
      return;
    }
  }, [href]);

  if (!embedHtml) return null;

  return <div className="my-3" dangerouslySetInnerHTML={{ __html: embedHtml }} />;
}

type EditorProps = {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onWikilinkClick?: (title: string) => void;
  onTagClick?: (tag: string) => void;
  isPreview?: boolean;
  onShare?: () => void;
  allNotes?: Note[];
};

export default function Editor({ note, onUpdate, onWikilinkClick, onTagClick, isPreview = false, onShare, allNotes = [] }: EditorProps) {
  const { t } = useLanguage();
  const [content, setContent] = useState(note?.content || '');
  const [title, setTitle] = useState(note?.title || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [publishSlug, setPublishSlug] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showCodeDropdown, setShowCodeDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isReadOnly = isPreview || (note && note.permission === 'read');

  useEffect(() => {
    setContent(note?.content || '');
    setTitle(note?.title || '');
  }, [note?.id, note?.content, note?.title]);

  useEffect(() => {
    if (isReadOnly || !note || (content === note.content && title === note.title)) return;
    
    setIsSaving(true);
    const timer = setTimeout(() => {
      onUpdate(note.id, { content, title });
      setTimeout(() => setIsSaving(false), 200);
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, title, note.id, note.content, note.title, onUpdate]);

  const handleSummarize = async () => {
    if (!content.trim()) return;
    setIsSummarizing(true);
    try {
      const response = await api.summarize(content);
      if (response && response.summary) {
        const summary = `\n\n> **AI Summary:**\n${response.summary}`;
        const newContent = content + summary;
        setContent(newContent);
        onUpdate(note.id, { content: newContent });
      }
    } catch (error) {
      console.error('Summarization failed:', error);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Custom renderer for tags and wikilinks
  const renderContent = renderContentBase;

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wikilink')) {
      const title = target.getAttribute('data-title');
      if (title && onWikilinkClick) onWikilinkClick(title);
    } else if (target.classList.contains('tag')) {
      const tag = target.getAttribute('data-tag');
      if (tag && onTagClick) onTagClick(tag);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (!blob) continue;
        
        const formData = new FormData();
        formData.append('file', blob, 'pasted_image.png');

        try {
          const response = await api.uploadFile(formData);
          if (response.url) {
            insertMarkdown(`![pasted image](`, `${response.url})`);
          }
        } catch (error) {
          console.error('Paste upload failed:', error);
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const formData = new FormData();
          formData.append('file', file);
          
          try {
            const response = await api.uploadFile(formData);
            if (response.url) {
              insertMarkdown(`![${file.name}](`, `${response.url})`);
            }
          } catch (error) {
            console.error('Drop upload failed:', error);
          }
        }
      }
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursor);
    const match = textBeforeCursor.match(/\[\[([^\]]*)$/);
    
    if (match) {
      setAutocompleteQuery(match[1]);
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  };

  const insertWikilink = (linkTitle: string) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = content.substring(0, cursor);
    const textAfterCursor = content.substring(cursor);
    
    const match = textBeforeCursor.match(/\[\[([^\]]*)$/);
    if (match) {
      const startPos = cursor - match[1].length;
      const hasClosing = textAfterCursor.startsWith(']]');
      const newContent = content.substring(0, startPos) + linkTitle + (hasClosing ? '' : ']]') + textAfterCursor;
      setContent(newContent);
      setShowAutocomplete(false);
      
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = startPos + linkTitle.length + (hasClosing ? 0 : 2);
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const filteredNotes = allNotes.filter(n => 
    (n.title || '').toLowerCase().includes(autocompleteQuery.toLowerCase()) && n.id !== note.id
  );

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selection = content.substring(start, end);
    const newContent = content.substring(0, start) + prefix + selection + suffix + content.substring(end);
    setContent(newContent);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = start + prefix.length + selection.length + suffix.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const insertTable = () => {
    const tableTemplate = "\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n";
    insertMarkdown(tableTemplate);
  };

  const insertWikilinkBtn = () => {
    insertMarkdown('[[', ']]');
  };

  const insertCodeBlock = (lang: string = '') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selection = content.substring(start, end);
    
    const prefix = '```' + lang + '\n';
    const suffix = '\n```';
    
    const newContent = content.substring(0, start) + prefix + selection + suffix + content.substring(end);
    setContent(newContent);
    setShowCodeDropdown(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        // If no selection, put cursor inside the block
        // If selection, put cursor at the end of the block
        const newPos = selection.length === 0 
          ? start + prefix.length 
          : start + prefix.length + selection.length + suffix.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.uploadFile(formData);
      if (response.url) {
        insertMarkdown(`![${file.name}](`, `${response.url})`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const insertLink = () => {
    insertMarkdown('[', '](url)');
  };

  const insertImage = () => {
    insertMarkdown('![alt](', ')');
  };

  const insertList = () => {
    insertMarkdown('- ');
  };

  const insertOrderedList = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selection = content.substring(start, end);
    
    if (selection.includes('\n')) {
      const lines = selection.split('\n');
      const numberedLines = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
      const newContent = content.substring(0, start) + numberedLines + content.substring(end);
      setContent(newContent);
      
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = start + numberedLines.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          textareaRef.current.focus();
        }
      }, 0);
    } else {
      insertMarkdown('1. ');
    }
  };

  const insertBold = () => {
    insertMarkdown('**', '**');
  };

  const insertItalic = () => {
    insertMarkdown('_', '_');
  };

  // Simple logic to find related notes (by tags or common words in title)
  const relatedNotes = allNotes.filter(n => 
    n.id !== note.id && 
    ((n.title || '').split(' ').some(word => word.length > 3 && (note.title || '').includes(word)) || 
     (n.content || '').includes(`[[${note.title}]]`) ||
     (note.content || '').includes(`[[${n.title}]]`))
  ).slice(0, 3);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="pl-16 pr-4 md:px-8 pt-16 pb-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isReadOnly}
            className={`text-3xl font-bold text-foreground bg-transparent outline-none flex-1 font-serif min-w-0 ${isReadOnly ? 'cursor-default' : ''}`}
            placeholder={t('editor.noteTitlePlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          <span className={`text-xs font-medium transition-all duration-500 ${isSaving ? 'text-amber-500' : 'text-emerald-500'}`}>
            {isSaving ? 'Сохранение...' : 'Сохранено'}
          </span>
          {!isReadOnly && (
            <button
              onClick={handleSummarize}
              disabled={isSummarizing}
              className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors disabled:opacity-50"
              title={t('editor.summarize')}
            >
              <Wand2 size={18} className={isSummarizing ? 'animate-spin' : ''} />
            </button>
          )}

          {onShare && note.permission === 'owner' && (
            <button
              onClick={onShare}
              className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
              title={t('editor.share')}
            >
              <Share2 size={18} />
            </button>
          )}

          {!isPreview && (
            <>
              <button
                onClick={() => setShowReminderModal(true)}
                className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
                title={t('editor.reminder') || 'Напоминание'}
              >
                <Bell size={18} />
              </button>

              <button
                onClick={async () => {
                  const { api } = await import('../api/client');
                  const status = await api.getCalendarStatus();
                  if (!status.connected) {
                    alert(t('editor.calendarNotConnected') || 'Подключите Google Calendar в настройках');
                    return;
                  }
              const now = new Date();
              const later = new Date(now.getTime() + 60 * 60 * 1000);
              await api.createCalendarEvent({
                summary: note.title,
                description: (note.content || '').substring(0, 500),
                start_datetime: now.toISOString(),
                end_datetime: later.toISOString()
              });
              alert(t('editor.calendarEventCreated') || 'Событие создано в Google Calendar!');
            }}
            className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
            title={t('editor.addToCalendar') || 'Добавить в календарь'}
          >
            <CalendarPlus size={18} />
          </button>
          </>
          )}

          {note.permission === 'owner' && (
            <button
              onClick={async () => {
                if ((note.content || '').includes('published:')) {
                  const match = note.content.match(/<!-- published:([^ ]+)/);
                  if (match) setPublishSlug(match[1]);
                }
                setShowPublishModal(true);
              }}
              className="p-2 text-muted-foreground hover:text-primary rounded-lg transition-colors"
              title={t('editor.publish') || 'Опубликовать'}
            >
              <Globe size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      {!isPreview && !isReadOnly && (
        <div className="pl-16 pr-4 md:px-8 py-2 flex items-center space-x-1 border-b border-border/30 bg-muted/30 flex-wrap gap-y-2">
          <button onClick={insertBold} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.bold')}><Bold size={16} /></button>
          <button onClick={insertItalic} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.italic')}><Italic size={16} /></button>
          <button onClick={insertLink} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.link')}><Link size={16} /></button>

          <div className="relative">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
              title={t('editor.image')}
            >
              <Image size={16} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              className="hidden" 
              accept="image/*"
            />
          </div>

          <button onClick={insertOrderedList} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.numberedList')}><ListOrdered size={16} /></button>

          <div className="w-px h-4 bg-border/50 mx-2"></div>

          <button onClick={insertList} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.list')}><List size={16} /></button>

          <div className="relative">
            <button
              onClick={() => setShowCodeDropdown(!showCodeDropdown)}
              className={`p-1.5 rounded-lg hover:bg-accent transition-colors ${showCodeDropdown ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-accent-foreground'}`}
              title={t('editor.codeBlock')}
            >
              <Code size={16} />
            </button>
            
            <div className={`absolute left-0 top-full mt-1 z-50 transition-all duration-200 ease-in-out ${showCodeDropdown ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <div className="bg-popover border border-border rounded-xl shadow-premium p-1 w-32">
                  {['python', 'javascript', 'bash', 'yaml', 'json', 'sql', 'markdown'].map(lang => (
                    <button
                      key={lang}
                      onClick={() => insertCodeBlock(lang)}
                      className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded text-foreground capitalize"
                    >
                      {lang}
                    </button>
                  ))}
                  <button
                    onClick={() => insertCodeBlock('')}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded text-muted-foreground border-t border-border/50 mt-1"
                  >
                    {t('editor.plainText')}
                  </button>
              </div>
            </div>
          </div>

          <button onClick={insertWikilinkBtn} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors font-bold text-xs" title={t('editor.wikilink')}>[[ ]]</button>
          <button onClick={insertTable} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title={t('editor.table')}><Table size={16} /></button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-8 scroll-elegant flex flex-col">
        <div className="flex-1">
          {isPreview || isReadOnly ? (
            <div className="max-w-none text-foreground/80" onClick={handleContentClick}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  h1({children}) {
                    return <h1 className="font-serif text-4xl font-bold text-foreground mt-8 mb-4 leading-tight">{children}</h1>;
                  },
                  h2({children}) {
                    return <h2 className="font-serif text-3xl font-bold text-foreground mt-6 mb-3 leading-tight">{children}</h2>;
                  },
                  h3({children}) {
                    return <h3 className="font-serif text-2xl font-semibold text-foreground mt-5 mb-2">{children}</h3>;
                  },
                  h4({children}) {
                    return <h4 className="font-serif text-xl font-semibold text-foreground mt-4 mb-2">{children}</h4>;
                  },
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    if (!inline && match) {
                      if (match[1] === 'mermaid') {
                        return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
                      }
                      return (
                        <SyntaxHighlighter
                          style={vscDarkPlus as any}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-xl border border-border/50 my-4"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      );
                    }
                    return (
                      <code className="bg-muted text-foreground/90 px-1.5 py-0.5 rounded-lg text-sm font-mono" {...props}>
                        {children}
                      </code>
                    )
                  },
                  p({children}) {
                    const childrenArray = React.Children.toArray(children);
                    if (childrenArray.length === 1 && React.isValidElement(childrenArray[0]) && childrenArray[0].type === 'br') {
                        return <p className="min-h-[1.5em] m-0 leading-relaxed">&nbsp;</p>;
                    }
                    return (
                      <p className="mb-4 leading-relaxed text-foreground/80">
                        {childrenArray.map((child, i) => {
                          if (typeof child === 'string') {
                            if (child.trim() === '' && childrenArray.length === 1) {
                                return <span key={i} className="inline-block min-h-[1.5em] w-full">&nbsp;</span>;
                            }
                            return <span key={i}>{renderContentWithTags(child)}</span>;
                          }
                          return <React.Fragment key={i}>{child}</React.Fragment>;
                        })}
                      </p>
                    );
                  },
                  blockquote({children}) {
                    return <blockquote className="border-l-2 border-primary/30 pl-4 italic text-muted-foreground my-4">{children}</blockquote>;
                  },
                  ol({children}) {
                    return <ol className="list-decimal list-inside my-4 space-y-1.5 text-foreground/80">{children}</ol>;
                  },
                  ul({children}) {
                    return <ul className="list-disc list-inside my-4 space-y-1.5 text-foreground/80">{children}</ul>;
                  },
                  li({children}) {
                    const childrenArray = React.Children.toArray(children);
                    const hasCheckbox = childrenArray.some(
                      child => React.isValidElement(child) && child.type === 'input'
                    );
                    if (hasCheckbox) {
                      let isChecked = false;
                      return (
                        <li className="flex items-center gap-2 text-foreground/80 list-none my-1">
                          {childrenArray.map((child, i) => {
                            if (React.isValidElement(child) && child.type === 'input') {
                              isChecked = (child.props as any).checked;
                              return (
                                <span key={i} className={`inline-flex items-center justify-center w-4 h-4 rounded border ${isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-background'}`}>
                                  {isChecked && <CheckCircle size={12} />}
                                </span>
                              );
                            }
                            if (typeof child === 'string') {
                              return <span key={i} className={isChecked ? 'line-through text-muted-foreground' : ''} dangerouslySetInnerHTML={{ __html: renderContent(child) }} />;
                            }
                            return <React.Fragment key={i}>{child}</React.Fragment>;
                          })}
                        </li>
                      );
                    }
                    return (
                      <li className="text-foreground/80">
                        {childrenArray.map((child, i) => {
                          if (typeof child === 'string') {
                            return <span key={i} dangerouslySetInnerHTML={{ __html: renderContent(child) }} />;
                          }
                          return <React.Fragment key={i}>{child}</React.Fragment>;
                        })}
                      </li>
                    );
                  },
                  hr() {
                    return <hr className="border-border my-8" />;
                  },
                  table({children}) {
                    return (
                      <div className="overflow-x-auto my-4 border border-border/50 rounded-xl">
                        <table className="min-w-full divide-y divide-border/50">
                          {children}
                        </table>
                      </div>
                    )
                  },
                  th({children}) {
                    return <th className="px-4 py-2.5 bg-muted/50 text-left text-xs font-bold uppercase tracking-wider text-primary">{children}</th>
                  },
                  td({children}) {
                    return <td className="px-4 py-2.5 border-t border-border/30 text-sm">{children}</td>
                  },
                  a({node, children, ...props}: any) {
                    const href = props.href || '';
                    const isEmbeddable = /youtube\.com|youtu\.be|open\.spotify\.com|github\.com\/[^/]+\/[^/]+$/.test(href);
                    return (
                      <>
                        <a
                          {...props}
                          className="text-primary underline decoration-primary/30 hover:decoration-primary underline-offset-4 transition-all"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                        {isEmbeddable && <EmbedPreview href={href} />}
                      </>
                    )
                  }
                }}
              >
                {(content || '').replace(/\n{2,}/g, (match) => '\n\n' + '\u00A0\n\n'.repeat(match.length - 2))}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="w-full h-full bg-transparent text-foreground/80 resize-none outline-none font-mono text-sm leading-relaxed"
              placeholder={t('editor.startWriting')}
            />
          )}
        </div>

        {/* Related Notes Section */}
        {relatedNotes.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border/30">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center">
              <Network size={14} className="mr-2 text-primary" /> {t('editor.relatedNotes')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {relatedNotes.map(rn => (
                <div 
                  key={rn.id}
                  onClick={() => onWikilinkClick && onWikilinkClick(rn.title)}
                  className="p-4 rounded-xl border border-border/50 bg-secondary/10 hover:bg-primary/5 hover:border-primary/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{rn.title}</span>
                    <FileText size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {(rn.content || '').replace(/[#*`[\]]/g, '')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {showAutocomplete && !isPreview && (
        <div className="absolute z-50 bg-popover border border-border rounded-md shadow-lg p-1 max-h-48 overflow-y-auto w-64 bottom-8 left-8">
          <div className="text-xs text-muted-foreground px-2 py-1 mb-1 border-b border-border/50">{t('editor.linkToNote')}</div>
          {filteredNotes.length > 0 ? (
            filteredNotes.map(n => (
              <button
                key={n.id}
                onClick={() => insertWikilink(n.title)}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-secondary rounded text-foreground flex items-center"
              >
                <FileText size={12} className="mr-2 text-primary" />
                <span className="truncate">{n.title}</span>
              </button>
            ))
          ) : (
            <button
              onClick={() => insertWikilink(autocompleteQuery)}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-secondary rounded text-foreground flex items-center"
            >
              <Edit3 size={12} className="mr-2 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{t('editor.create')}: {autocompleteQuery}</span>
            </button>
          )}
        </div>
      )}

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
        isPublished={!!(note.content || '').includes('published:')}
        onPublish={async (expiresHours: number) => {
          const { api } = await import('../api/client');
          const result = await api.publishNote(note.id, expiresHours);
          if (result.slug) {
            setPublishSlug(result.slug);
          }
        }}
        onUnpublish={async () => {
          const { api } = await import('../api/client');
          await api.unpublishNote(note.id);
          setPublishSlug(null);
        }}
      />
    </div>
  );
}
