import React, { useState, useEffect, Suspense } from 'react';
import { Component, ErrorInfo, ReactNode } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Chat from './components/Chat';
import Settings from './components/Settings';
import GraphView from './components/GraphView';
import BentoGrid from './components/BentoGrid';
import NotificationsPanel from './components/NotificationsPanel';
import ShareModal from './components/ShareModal';
import ReminderModal from './components/ReminderModal';
import SharedNoteView from './components/SharedNoteView';
import Login from './pages/Login';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Edit3, Eye, Search, X, Menu, Maximize2, Minimize2, Sun, Moon, AlertTriangle, Lock, Sparkles, BarChart3, Calendar, Hash, FileText, LayoutGrid, Layout, MessageSquare, PanelLeftOpen, ChevronLeft, ChevronRight, Bell, Plus, Repeat, Trash2 } from 'lucide-react';

const BoardEditor = React.lazy(() => import('./components/BoardEditor'));
import { useLanguage } from './contexts/LanguageContext';
import { Note, Folder } from './types';
import { api } from './api/client';
import { isReminderOnDate, getRepeatLabel } from './lib/utils';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-4 max-w-md">The application crashed. This might be due to a loading error or data mismatch.</p>
          <pre className="p-4 bg-secondary/50 rounded-lg text-xs font-mono mb-4 max-w-full overflow-auto">
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('access_token');
    } catch (e) {
      return null;
    }
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set());
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'graph' | 'stats' | 'calendar' | 'bento' | 'board'>('preview');
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [reminders, setReminders] = useState<any[]>([]);
  const [showCalendarReminder, setShowCalendarReminder] = useState(false);
  const [calReminderDate, setCalReminderDate] = useState('');
  const [editingReminder, setEditingReminder] = useState<any>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: string; id: string; title: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [smartFilter, setSmartFilter] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
      }
    } catch (e) {}
    return 'dark';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareResource, setShareResource] = useState<{ id: string, type: 'note' | 'folder', name: string } | null>(null);

  // Robust check for shared resource in URL
  const sharedNoteId = (() => {
    try {
      const searchId = new URLSearchParams(window.location.search).get('share');
      if (searchId) return searchId;
      
      const pathMatch = window.location.pathname.match(/\/shared\/([^\/\?]+)/);
      return pathMatch ? pathMatch[1] : null;
    } catch (e) {
      console.error("Failed to parse share ID from URL", e);
      return null;
    }
  })();

  const handleSetTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch (e) {}
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      localStorage.removeItem('access_token');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (token) {
      setIsLoading(true);
      Promise.all([api.getNotes(), api.getFolders(), api.getReminders()]).then(([fetchedNotes, fetchedFolders, fetchedReminders]) => {
        setNotes(fetchedNotes || []);
        setFolders(fetchedFolders || []);
        setReminders(fetchedReminders || []);
        setIsLoading(false);
      }).catch(err => {
        console.error("Failed to fetch data", err);
        setIsLoading(false);
      });
    }
  }, [token]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNoteSelect = (id: string, mode: 'edit' | 'preview' = 'preview') => {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    if (note.folderId) {
      let curId: string | undefined = note.folderId;
      const visited = new Set<string>();
      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const folder = folders.find(f => f.id === curId);
        if (!folder) break;
        if (folder.isProtected && !unlockedFolders.has(folder.id)) {
          document.dispatchEvent(new CustomEvent('request-folder-unlock', { detail: { folderId: folder.id, noteId: id, mode } }));
          return;
        }
        curId = folder.parentId;
      }
    }

    // Track recent notes
    try {
      const recent: string[] = JSON.parse(localStorage.getItem('recentNotes') || '[]');
      const updated = [id, ...recent.filter(r => r !== id)].slice(0, 10);
      localStorage.setItem('recentNotes', JSON.stringify(updated));
    } catch (e) {}

    setActiveNoteId(id);
    setShowSettings(false);
    // Detect board notes and switch to board view
    if (note.content && note.content.includes('<!-- board:')) {
      setViewMode('board');
    } else {
      setViewMode(mode === 'edit' ? 'edit' : 'preview');
    }
    setShowSearch(false);
    setIsMobileMenuOpen(false);
  };

  const availableNotes = React.useMemo(() => {
    let filtered = notes.filter(n => {
      if (!n.folderId) return true;
      let curId: string | undefined = n.folderId;
      const visited = new Set<string>();
      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const f = folders.find(f => f.id === curId);
        if (!f) break;
        if (f.isProtected && !unlockedFolders.has(f.id)) return false;
        curId = f.parentId;
      }
      return true;
    });

    if (smartFilter) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(n => {
        const content = n.content || '';
        switch (smartFilter) {
          case 'recent-week': {
            const dateStr = n.updated_at || n.created_at || '';
            if (!dateStr) return false;
            const d = new Date(dateStr);
            return !isNaN(d.getTime()) && d > weekAgo;
          }
          case 'with-tags':
            return /(^|\s)#[a-zA-Zа-яА-Я]/.test(content);
          case 'with-images':
            return /!\[.*?\]\(.*?\)/.test(content);
          case 'with-tasks':
            return /^- \[[ x]\]/m.test(content);
          case 'no-tags':
            return !/(^|\s)#[a-zA-Zа-яА-Я]/.test(content) && !n.folderId;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [notes, folders, unlockedFolders, smartFilter]);

  const activeNote = notes.find(n => n.id === activeNoteId);

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prev => {
      const now = new Date().toISOString();
      const newNotes = prev.map(n => n.id === id ? { ...n, ...updates, updated_at: now } : n);
      const updatedNote = newNotes.find(n => n.id === id);
      if (updatedNote) api.createNote(updatedNote);
      return newNotes;
    });
  };

  const addNote = (newNote: Note) => {
    setNotes(prev => [...prev, newNote]);
    api.createNote(newNote).catch(console.error);
    setActiveNoteId(newNote.id);
    setViewMode('edit');
    setShowSearch(false);
    setIsMobileMenuOpen(false);
  };

  const addFolder = (newFolder: Folder) => {
    setFolders(prev => [...prev, newFolder]);
    api.createFolder(newFolder);
  };

  const addBoard = () => {
    const newNote: Note = {
      id: `n${Date.now()}`,
      title: `Board: ${t('common.newNote')}`,
      content: '<!-- board:{"items":[]} -->',
      permission: 'owner',
    };
    addNote(newNote);
    setViewMode('board');
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
    api.deleteNote(id);
  };

  const deleteFolder = (id: string) => {
    const getSubfolders = (parentId: string): string[] => {
      const children = folders.filter(f => f.parentId === parentId);
      let ids = [parentId];
      for (const c of children) {
        ids = ids.concat(getSubfolders(c.id));
      }
      return ids;
    };
    
    const allIds = getSubfolders(id);
    
    setFolders(folders.filter(f => !allIds.includes(f.id)));
    setNotes(notes.filter(n => !n.folderId || !allIds.includes(n.folderId)));
    api.deleteFolder(id);
  };

  const renameFolder = (id: string, newName: string) => {
    setFolders(folders.map(f => {
      if (f.id === id) {
        const updated = { ...f, name: newName, updated_at: new Date().toISOString() };
        api.createFolder(updated);
        return updated;
      }
      return f;
    }));
  };

  const handleWikilinkClick = (title: string) => {
    const note = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
    if (note) {
      handleNoteSelect(note.id);
    } else {
      // Create new note if it doesn't exist
      const newNote = { id: `n${Date.now()}`, title, content: `# ${title}\n\n` };
      setNotes([...notes, newNote]);
      handleNoteSelect(newNote.id);
    }
  };

  const handleTagClick = (tag: string) => {
    setSearchQuery(`#${tag}`);
    setShowSearch(true);
  };

  const handleShare = (type: 'note' | 'folder', id: string) => {
    let name = '';
    if (type === 'note') {
      name = notes.find(n => n.id === id)?.title || '';
    } else {
      name = folders.find(f => f.id === id)?.name || '';
    }
    setShareResource({ id, type, name });
    setShareModalOpen(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setNotes([]);
    setFolders([]);
    setActiveNoteId(null);
  };

  if (sharedNoteId) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-full flex flex-col bg-background">
          <SharedNoteView shareId={sharedNoteId} />
        </div>
      </ErrorBoundary>
    );
  }

  if (!token) {
    return <Login onLogin={(newToken) => setToken(newToken)} />;
  }

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden bg-background text-foreground">
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Animated slide in/out */}
      {!isFocusMode && (
        <div className={`overflow-hidden transition-all duration-300 ease-in-out hidden md:block ${sidebarOpen ? 'w-60 opacity-100' : 'w-0 opacity-0'}`}
          style={{ flexShrink: 0 }}>
          <div className="w-60 h-full">
            <Sidebar
              notes={notes}
              folders={folders}
              unlockedFolders={unlockedFolders}
              setUnlockedFolders={setUnlockedFolders}
              activeNoteId={activeNoteId}
              onSelectNote={handleNoteSelect}
              onOpenSettings={() => { setShowSettings(true); setIsMobileMenuOpen(false); }}
              onOpenSearch={() => { setShowSearch(true); setIsMobileMenuOpen(false); }}
          onLogout={handleLogout}
          onNotesChange={setNotes}
          onFoldersChange={setFolders}
          onAddNote={addNote}
          onAddFolder={addFolder}
          onDeleteNote={deleteNote}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onShare={handleShare}
          onClose={() => setIsMobileMenuOpen(false)}
          smartFilter={smartFilter}
          onSmartFilter={setSmartFilter}
          onSwitchView={setViewMode}
          onSelectFolder={setSelectedFolderId}
          onAddBoard={addBoard}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
          </div>
        </div>
      )}

      {!isFocusMode && !sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)}
          className="fixed top-20 left-2 z-20 p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background transition-all duration-200 shadow-sm"
          title="Show sidebar">
          <PanelLeftOpen size={16} />
        </button>
      )}

      <main className="flex-1 flex flex-col relative border-r min-w-0 border-border/50">
        {/* Header Toggle & Mobile Controls - Moved to top center and slightly enlarged */}
        {!showSettings && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-1 rounded-full glass-strong p-1 shadow-premium-lg ring-1 ring-border/50">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'edit' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.editMode')}
            >
              <Edit3 size={16} />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'preview' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.previewMode')}
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'graph' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.graphView')}
            >
              <Network size={16} />
            </button>
            <button
              onClick={() => setViewMode('stats')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'stats' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.stats')}
            >
              <BarChart3 size={16} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'calendar' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.calendar')}
            >
              <Calendar size={16} />
            </button>
            <button
              onClick={() => setViewMode('bento')}
              className={`p-2 rounded-full flex items-center transition-all duration-200 ${viewMode === 'bento' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              title={t('app.bento')}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        )}

        {/* Notifications */}
        {!showSettings && (
          <div className="absolute top-6 right-20 z-10 flex items-center gap-2">
            <button onClick={() => setChatOpen(!chatOpen)} title={chatOpen ? 'Hide chat' : 'Show chat'}
              className={`p-2 rounded-full transition-all duration-200 ${chatOpen ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}>
              <MessageSquare size={16} />
            </button>
            <NotificationsPanel onNoteClick={handleNoteSelect} />
          </div>
        )}

        {/* Mobile Hamburger */}
        {!isFocusMode && (
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden absolute top-4 left-4 z-10 p-2 border border-border/50 rounded-lg bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
          >
            <Menu size={20} />
          </button>
        )}

        <AnimatePresence mode="wait">
          {showSettings ? (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full w-full"
            >
              <Settings onClose={() => setShowSettings(false)} theme={theme} setTheme={handleSetTheme} />
            </motion.div>
          ) : viewMode === 'graph' ? (
            <motion.div
              key="graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <GraphView notes={availableNotes} activeNoteId={activeNoteId} onNodeClick={handleNoteSelect} />
            </motion.div>
          ) : viewMode === 'stats' ? (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full w-full p-8 scroll-elegant"
            >
              <h2 className="font-serif text-3xl font-bold text-foreground mb-6">{t('stats.title')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: t('stats.totalNotes'), value: notes.length, icon: FileText },
                  { label: t('stats.totalWords'), value: notes.reduce((acc, n) => acc + (n.content || '').split(/\s+/).filter(Boolean).length, 0), icon: Edit3 },
                  { label: t('stats.totalLinks'), value: notes.reduce((acc, n) => acc + ((n.content || '').match(/\[\[/g) || []).length, 0), icon: Network },
                  { label: t('stats.totalTags'), value: new Set((notes.flatMap(n => (n.content || '').match(/#\w+/g) || [])).map(t => t.toLowerCase())).size, icon: Hash },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-card rounded-xl border border-border/50 p-4 shadow-premium">
                    <Icon size={20} className="text-primary mb-2" />
                    <div className="text-2xl font-bold text-foreground">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <h3 className="font-serif text-xl font-semibold text-foreground mb-3">{t('stats.topTags')}</h3>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const tagCounts: Record<string, number> = {};
                  notes.forEach(n => {
                    const tags: string[] = (n.content || '').match(/#\w+/g) || [];
                    tags.forEach((tag: string) => { tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] || 0) + 1; });
                  });
                  return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm">{tag} ({count})</span>
                  ));
                })()}
              </div>
            </motion.div>
          ) : viewMode === 'bento' ? (
            <motion.div
              key="bento"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <BentoGrid
                notes={smartFilter ? availableNotes : notes.filter(n => !n.folderId || folders.some(f => f.id === n.folderId && (!f.isProtected || unlockedFolders.has(f.id))))}
                folders={folders}
                activeNoteId={activeNoteId}
                onNoteClick={handleNoteSelect}
                folderId={selectedFolderId || undefined}
              />
            </motion.div>
          ) : viewMode === 'calendar' ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full w-full px-8 pt-4 pb-8 scroll-elegant relative"
              onClick={() => expandedDay && setExpandedDay(null)}
            >
              <div className="flex items-center mb-6">
                <h2 className="font-serif text-2xl font-bold text-foreground">{new Date(calYear, calMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => { setCalMonth(m => m === 0 ? 11 : m - 1); if (calMonth === 0) setCalYear(y => y - 1); setExpandedDay(null); }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft size={16} /></button>
                  <button onClick={() => { setCalMonth(m => m === 11 ? 0 : m + 1); if (calMonth === 11) setCalYear(y => y + 1); setExpandedDay(null); }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><ChevronRight size={16} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
                {(() => {
                  const firstDay = new Date(calYear, calMonth, 1).getDay();
                  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                  const cells = [];
                  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  return cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayNotes = notes.filter(n => (n.created_at || '').startsWith(dateStr) || (n.updated_at || '').startsWith(dateStr));
                    const dayReminders = reminders.filter(r => isReminderOnDate(r, dateStr));
                    const seenReminderKeys = new Set<string>();
                    const uniqueDayReminders = dayReminders.filter(r => {
                      const key = `${r.note_id || ''}:${r.message || ''}:${r.repeat_type || 'none'}`;
                      if (seenReminderKeys.has(key)) return false;
                      seenReminderKeys.add(key);
                      return true;
                    });
                    const allItems = [...dayNotes.map(n => ({ type: 'note' as const, id: n.id, title: n.title })), ...uniqueDayReminders.map(r => ({ type: 'reminder' as const, id: r.id, noteId: r.note_id, title: r.message || notes.find(n => n.id === r.note_id)?.title || 'Напоминание', time: r.remind_at }))];
                    const expanded = expandedDay === dateStr;
                    const today = new Date();
                    const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear;
                    const isRightCol = (i % 7) >= 4;
                    return (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setExpandedDay(dateStr); }}
                        className={`rounded-xl border p-2.5 min-h-[88px] transition-all duration-200 cursor-pointer hover:shadow-md relative group flex flex-col justify-between ${isToday ? 'border-primary ring-2 ring-primary/40 bg-primary/5 font-semibold' : uniqueDayReminders.length > 0 ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30 dark:bg-violet-950/30 dark:border-violet-400/30' : allItems.length > 0 ? 'border-border/60 bg-muted/20' : 'border-border/30 hover:border-border/60'}`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-semibold ${isToday ? 'w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center -ml-0.5 -mt-0.5 text-[11px] shadow-sm' : 'text-muted-foreground'}`}>{day}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCalReminderDate(dateStr);
                                setShowCalendarReminder(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                              title="Добавить напоминание"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="space-y-1">
                            {allItems.slice(0, 2).map(item => (
                              <div
                                key={item.type + item.id}
                                className={`text-[11px] truncate rounded-md px-1.5 py-0.5 flex items-center gap-1 font-medium ${item.type === 'reminder' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'}`}
                              >
                                {item.type === 'reminder' ? <Bell size={10} className="shrink-0" /> : <FileText size={10} className="shrink-0" />}
                                <span className="truncate">{item.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {allItems.length > 2 && (
                          <div className="text-[10px] text-muted-foreground font-semibold mt-1">+{allItems.length - 2} ещё</div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Dedicated Day Details Modal */}
              <AnimatePresence>
                {expandedDay && (() => {
                  const [eYear, eMonth, eDay] = expandedDay.split('-').map(Number);
                  const dayDate = new Date(eYear, eMonth - 1, eDay);
                  const dayName = dayDate.toLocaleDateString('ru-RU', { weekday: 'long' });
                  const formattedDate = dayDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                  
                  const dayNotes = notes.filter(n => (n.created_at || '').startsWith(expandedDay) || (n.updated_at || '').startsWith(expandedDay));
                  const dayReminders = reminders.filter(r => isReminderOnDate(r, expandedDay));
                  const seenReminderKeys = new Set<string>();
                  const uniqueDayReminders = dayReminders.filter(r => {
                    const key = `${r.note_id || ''}:${r.message || ''}:${r.repeat_type || 'none'}`;
                    if (seenReminderKeys.has(key)) return false;
                    seenReminderKeys.add(key);
                    return true;
                  });
                  
                  return (
                    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setExpandedDay(null)}>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
                          <div>
                            <div className="text-xs font-semibold text-primary capitalize">{dayName}</div>
                            <h3 className="text-lg font-bold text-foreground font-serif">{formattedDate}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setCalReminderDate(expandedDay);
                                setShowCalendarReminder(true);
                                setExpandedDay(null);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:shadow-md hover:bg-primary/90 transition-all"
                            >
                              <Plus size={14} /> Напоминание
                            </button>
                            <button
                              onClick={() => setExpandedDay(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 scroll-elegant">
                          {uniqueDayReminders.length === 0 && dayNotes.length === 0 ? (
                            <div className="py-8 text-center flex flex-col items-center justify-center text-muted-foreground">
                              <Calendar size={36} className="text-muted-foreground/30 mb-2 stroke-[1.5]" />
                              <p className="text-sm font-medium">Нет запланированных событий</p>
                              <p className="text-xs text-muted-foreground/70 mt-0.5">Нажмите «Напоминание», чтобы добавить событие на этот день</p>
                            </div>
                          ) : (
                            <>
                              {uniqueDayReminders.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">Напоминания</div>
                                  {uniqueDayReminders.map(r => {
                                    const repeatLabel = getRepeatLabel(r.repeat_type || r.repeatType);
                                    const timeStr = (r.remind_at || r.remindAt || '').slice(11, 16);
                                    const title = r.message || notes.find(n => n.id === (r.note_id || r.noteId))?.title || 'Напоминание';
                                    return (
                                      <div key={r.id} className="group p-3 rounded-xl bg-muted/40 border border-border/40 hover:border-violet-500/40 hover:bg-muted/60 transition-all flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                                            <Bell size={16} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {timeStr && (
                                                <span className="text-xs font-mono font-bold text-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/50">
                                                  {timeStr}
                                                </span>
                                              )}
                                              {repeatLabel && (
                                                <span className="text-[10px] font-medium text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20 flex items-center gap-1">
                                                  <Repeat size={10} /> {repeatLabel}
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-sm font-medium text-foreground mt-1 break-words">{title}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => {
                                              setEditingReminder(r);
                                              setShowCalendarReminder(true);
                                              setExpandedDay(null);
                                            }}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                            title="Редактировать"
                                          >
                                            <Edit3 size={14} />
                                          </button>
                                          <button
                                            onClick={() => {
                                              setDeletingItem({ type: 'reminder', id: r.id, title });
                                            }}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                            title="Удалить"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {dayNotes.length > 0 && (
                                <div className="space-y-1.5 pt-2">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">Заметки</div>
                                  {dayNotes.map(n => (
                                    <div
                                      key={n.id}
                                      onClick={() => {
                                        handleNoteSelect(n.id);
                                        setViewMode('preview');
                                        setExpandedDay(null);
                                      }}
                                      className="p-2.5 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/40 hover:bg-muted/60 transition-all cursor-pointer flex items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FileText size={15} className="text-primary shrink-0" />
                                        <span className="text-sm font-medium text-foreground truncate">{n.title || 'Без названия'}</span>
                                      </div>
                                      <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  );
                })()}
              </AnimatePresence>
            </motion.div>
          ) : viewMode === 'board' && activeNote ? (
              <motion.div
                  key={`board-${activeNote.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-muted-foreground">Loading board...</div>}>
                <BoardEditor
                  content={activeNote.content || ''}
                  title={activeNote.title || ''}
                  onChange={(content) => updateNote(activeNote.id, { content })}
                  onTitleChange={(title) => updateNote(activeNote.id, { title })}
                  noteId={activeNote.id}
                />
              </Suspense>
            </motion.div>
          ) : activeNote ? (
            <motion.div 
              key={`editor-${activeNote.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full w-full"
            >
              <Editor 
                note={activeNote} 
                allNotes={availableNotes}
                onUpdate={updateNote} 
                onWikilinkClick={handleWikilinkClick}
                onTagClick={handleTagClick}
                isPreview={viewMode === 'preview'}
                onShare={() => handleShare('note', activeNote.id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 flex flex-col items-center justify-center text-center px-8"
            >
              <Sparkles className="text-primary mb-4 opacity-60" size={32} />
              <h2 className="font-serif text-4xl text-foreground mb-2">{t('editor.emptyTitle') || 'Ваши заметки'}</h2>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                {t('editor.empty')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Chat - Animated slide in/out */}
      {!isFocusMode && (
        <div className={`overflow-hidden transition-all duration-300 ease-in-out hidden lg:block ${chatOpen ? 'w-80 opacity-100' : 'w-0 opacity-0'}`}
          style={{ flexShrink: 0 }}>
          <div className="w-80 h-full">
            <Chat notes={notes} folders={folders} unlockedFolders={unlockedFolders} activeNoteId={activeNoteId} onNoteClick={handleNoteSelect} api={api} />
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      <AnimatePresence>
        {shareModalOpen && shareResource && (
          <ShareModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            resourceId={shareResource.id}
            resourceType={shareResource.type}
            resourceName={shareResource.name}
            onShareStatusChange={(isShared) => {
              if (shareResource.id) {
                if (shareResource.type === 'note') {
                  setNotes(prev => prev.map(n => n.id === shareResource.id ? { ...n, isSharedByMe: isShared } : n));
                } else if (shareResource.type === 'folder') {
                  setFolders(prev => prev.map(f => f.id === shareResource.id ? { ...f, isSharedByMe: isShared } : f));
                }
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] glass-strong px-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-2xl bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-premium-lg overflow-hidden ring-1 ring-border/30"
            >
              <div className="flex items-center px-5 py-4 border-b border-border/50">
                <Search size={18} className="text-muted-foreground mr-3" />
                <input
                  autoFocus
                  type="text"
                  placeholder={`${t('sidebar.search')}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-lg text-foreground placeholder-muted-foreground"
                />
                <button onClick={() => setShowSearch(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2 scroll-elegant">
                {notes.filter(n => {
                  // Only match real text, don't match locked notes text
                  const f = folders.find(f => f.id === n.folderId);
                  const isLocked = f?.isProtected && !unlockedFolders.has(n.folderId!);
                  if (isLocked) {
                    // Do not search by content/title if locked, to prevent leaks
                    // But if the folder itself matches the query, MAYBE show it? 
                    // Let's just always show matching notes, BUT we don't want to leak content.
                    // If we don't match text, how can user find it?
                    // "в поиске заметка должна отображаться, но быть замазанной" indicates it SHOULD match.
                    // Okay, we will match the text normally.
                  }
                  return (n.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                         (n.content?.toLowerCase() || '').includes(searchQuery.toLowerCase());
                }).map(note => {
                  const isLocked = note.folderId && folders.find(f => f.id === note.folderId)?.isProtected && !unlockedFolders.has(note.folderId);
                  
                  return (
                  <div
                    key={note.id}
                    onClick={() => handleNoteSelect(note.id)}
                    className="px-4 py-3 rounded-xl cursor-pointer flex flex-col hover:bg-accent transition-colors relative"
                  >
                    <div className={isLocked ? 'blur-[4px] opacity-70 select-none' : ''}>
                      <span className="text-primary font-medium">{note.title || t('common.untitled')}</span>
                      <span className="text-sm text-muted-foreground line-clamp-1 mt-1">{note.content || '...'}</span>
                    </div>
                    {isLocked && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                         <Lock size={20} className="text-foreground/50 drop-shadow-md" />
                      </div>
                    )}
                  </div>
                )})}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Calendar Reminder Modal */}
      <ReminderModal
        isOpen={showCalendarReminder}
        onClose={() => { setShowCalendarReminder(false); setEditingReminder(null); }}
        initialDate={editingReminder ? editingReminder.remind_at?.slice(0, 10) : calReminderDate}
        initialTime={editingReminder ? editingReminder.remind_at?.slice(11, 16) : undefined}
        initialRepeat={editingReminder?.repeat_type}
        initialMessage={editingReminder?.message}
        initialNoteId={editingReminder?.note_id}
        notes={notes}
        isEditing={!!editingReminder}
        onConfirm={async (data) => {
          const { api } = await import('./api/client');
          if (editingReminder) {
            await api.deleteReminder(editingReminder.id);
          }
          let noteId = data.note_id || null;
          if (!noteId && data.note_title) {
            const note = await api.createNote({ title: data.note_title, content: '' });
            noteId = note.id;
          }
          await api.createReminder({ note_id: noteId, remind_at: data.remind_at, repeat_type: data.repeat_type, message: data.message });
          const [updatedNotes, updatedReminders] = await Promise.all([api.getNotes(), api.getReminders()]);
          setNotes(updatedNotes || []);
          setReminders(updatedReminders || []);
          setEditingReminder(null);
        }}
      />

      {/* Delete confirmation */}
      {deletingItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setDeletingItem(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs bg-card border border-border/50 rounded-2xl shadow-premium-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground mb-2">Удалить?</h3>
            <p className="text-sm text-muted-foreground mb-4">{deletingItem.type === 'reminder' ? 'Напоминание' : 'Заметка'} «{deletingItem.title}» будет удалён.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingItem(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Отмена</button>
              <button onClick={async () => {
                const { api } = await import('./api/client');
                if (deletingItem.type === 'reminder') await api.deleteReminder(deletingItem.id);
                else await api.deleteNote(deletingItem.id);
                const [updatedNotes, updatedReminders] = await Promise.all([api.getNotes(), api.getReminders()]);
                setNotes(updatedNotes || []);
                setReminders(updatedReminders || []);
                setDeletingItem(null);
              }} className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">Удалить</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
