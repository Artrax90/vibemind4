import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Sidebar from '../components/Sidebar';
import Editor from './Editor';
import Settings from './Settings';
import GraphView from '../components/GraphView';
import Chat from '../components/Chat';
import ShareModal from '../components/ShareModal';
import BentoGrid from '../components/BentoGrid';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Edit3, Eye, Search, X, Menu, RefreshCw, MessageSquare, BarChart3, Calendar, LayoutGrid, FileText, Hash, ChevronLeft, ChevronRight, Plus, Bell, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useSync } from '../contexts/SyncContext';
import { Capacitor } from '@capacitor/core';
import { dbApi } from '../lib/db';
import { api } from './client';
import SyncManager from '../components/SyncManager';
import { Note, Folder } from '../types';

const BoardEditor = React.lazy(() => import('../components/BoardEditor'));

(window as any).desktopApi = api;

export default function App() {
  const { t } = useLanguage();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'graph' | 'stats' | 'calendar' | 'bento' | 'board'>('preview');
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<any[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [showCalendarReminder, setShowCalendarReminder] = useState(false);
  const [calReminderDate, setCalReminderDate] = useState('');

  // Share Modal State
  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    type: 'note' | 'folder' | null;
    id: string | null;
    name: string | null;
  }>({ isOpen: false, type: null, id: null, name: null });

  const { status, progress } = useSync();

  const syncProgress = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  useEffect(() => {
    api.getNormalizedUrl().then(url => {
      if (url) setBaseUrl(url);
    });
  }, []);

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout? This will clear all local data and sync settings.')) {
      await api.clearLocalData();
      setNotes([]);
      setFolders([]);
      setActiveNoteId(null);
      window.location.reload();
    }
  };

  const handleShare = (type: 'note' | 'folder', id: string) => {
    const name = type === 'note' 
      ? notes.find(n => n.id === id)?.title || '' 
      : folders.find(f => f.id === id)?.name || '';
    setShareModal({ isOpen: true, type, id, name });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleCloseSidebar = () => setIsMobileMenuOpen(false);
    document.addEventListener('close-sidebar', handleCloseSidebar);
    return () => document.removeEventListener('close-sidebar', handleCloseSidebar);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedNotes, fetchedFolders] = await Promise.all([
        api.getNotes(),
        api.getFolders()
      ]);
      console.log(`[Data] Loaded ${fetchedNotes.length} notes and ${fetchedFolders.length} folders`);
      setNotes(fetchedNotes || []);
      setFolders(fetchedFolders || []);
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (viewMode === 'calendar') {
      api.getReminders?.().then(r => setReminders(r || [])).catch(() => {});
    }
  }, [viewMode]);

  const handleSyncComplete = useCallback(() => {
    loadData();
    // Force editor refresh if active note was updated
    if (activeNoteId) {
      setActiveNoteId(prev => prev);
    }
  }, [loadData, activeNoteId]);

  const handleNoteSelect = (id: string, mode: 'edit' | 'preview' = 'preview') => {
    setActiveNoteId(id);
    setShowSettings(false);
    setViewMode(mode);
    setShowSearch(false);
    setIsMobileMenuOpen(false);
    // Auto-detect board
    const note = notes.find(n => n.id === id);
    if (note?.content?.includes('<!-- board:')) {
      setViewMode('board');
    }
  };

  const activeNote = notes.find(n => n.id === activeNoteId);

  const updateNote = async (id: string, updates: Partial<Note>) => {
    const updated_at = new Date().toISOString();
    const finalUpdates = { ...updates, updated_at };
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...finalUpdates } : n));
    await api.updateNote(id, finalUpdates);
  };

  const addNote = async (newNote: Note) => {
    setNotes(prev => [...prev, newNote]);
    await api.createNote(newNote);
    setActiveNoteId(newNote.id);
    setViewMode('edit');
  };

  const addFolder = async (newFolder: Folder) => {
    setFolders(prev => [...prev, newFolder]);
    await api.createFolder(newFolder);
  };

  const addBoard = async () => {
    const newNote: Note = {
      id: `n${Date.now()}`,
      title: `${t('common.newBoard') || 'Доска'} ${notes.length + 1}`,
      content: '<!-- board:{"items":[]} -->',
      permission: 'owner'
    };
    await addNote(newNote);
    setViewMode('board');
  };

  const deleteNote = async (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
    await api.deleteNote(id);
  };

  const deleteFolder = async (id: string) => {
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
    await api.deleteFolder(id);
  };

  const renameFolder = async (id: string, newName: string) => {
    const updated_at = new Date().toISOString();
    setFolders(folders.map(f => f.id === id ? { ...f, name: newName, updated_at } : f));
    await api.updateFolder(id, { name: newName, updated_at });
  };

  const handleWikilinkClick = (title: string) => {
    const note = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
    if (note) {
      handleNoteSelect(note.id);
    } else {
      const newNote = { id: `n${Date.now()}`, title, content: `# ${title}\n\n` };
      addNote(newNote);
      handleNoteSelect(newNote.id);
    }
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
    api.getNormalizedUrl().then(url => {
      if (url) setBaseUrl(url);
    });
  };

  const handleQuit = async () => {
    try {
      const config = await dbApi.getSyncConfig();
      if (config.server_url && config.username && config.password) {
        // Trigger sync and wait
        window.dispatchEvent(new CustomEvent('force-sync'));
        
        // Wait for sync-finished or timeout after 10 seconds
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.log('Sync on quit timed out');
            resolve();
          }, 10000);
          
          window.addEventListener('sync-finished', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    } catch (e) {
      console.error('Error during sync on quit', e);
    } finally {
      dbApi.quitApp();
    }
  };

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden bg-background text-foreground">
      <SyncManager onSyncComplete={loadData} />
      
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)} />
      
      <div className={`flex ${isMobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden md:flex'}`}>
        <Sidebar 
          notes={notes} 
          folders={folders} 
          unlockedFolders={unlockedFolders}
          setUnlockedFolders={setUnlockedFolders}
          activeNoteId={activeNoteId} 
          onSelectNote={handleNoteSelect}
          onOpenSettings={() => { setShowSettings(true); setShowChat(false); }}
          onOpenSearch={() => setShowSearch(true)}
          onLogout={handleLogout}
          onNotesChange={setNotes}
          onFoldersChange={setFolders}
          onAddNote={addNote}
          onAddFolder={addFolder}
          onDeleteNote={deleteNote}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onShare={handleShare}
          onSwitchView={(mode) => setViewMode(mode as any)}
          onAddBoard={addBoard}
          smartFilter=""
          onSmartFilter={() => {}}
          onSelectFolder={() => {}}
          onQuit={!Capacitor.isNativePlatform() ? handleQuit : undefined}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      </div>
      
      <main className="flex-1 flex flex-col relative border-r min-w-0 border-border/50">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="md:hidden absolute top-8 left-4 z-20 p-2 bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg text-foreground shadow-lg"
        >
          <Menu size={20} />
        </button>

        {!showSettings && (
          <div className="absolute bottom-6 md:top-8 md:bottom-auto left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm p-1.5 shadow-xl">
            <div className="flex items-center px-2 mr-2 border-r border-border/50 space-x-2">
              <div className="relative flex items-center justify-center">
                {status === 'syncing' && <RefreshCw size={16} className="text-primary animate-spin" />}
                {status === 'success' && <RefreshCw size={16} className="text-accent" />}
                {status === 'error' && <RefreshCw size={16} className="text-destructive" />}
                {status === 'idle' && <RefreshCw size={16} className="text-muted-foreground opacity-30" />}
              </div>
              {status === 'syncing' && progress.total > 0 && (
                <div className="flex flex-col w-20">
                  <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300" 
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-muted-foreground mt-0.5 text-center font-mono">
                    {progress.current}/{progress.total}
                  </span>
                </div>
              )}
            </div>
            <button 
              onClick={() => {
                if (!activeNoteId) {
                  const newNote: Note = { id: `n${Date.now()}`, title: t('common.newNote'), content: '', permission: 'owner' };
                  addNote(newNote);
                  handleNoteSelect(newNote.id, 'edit');
                } else {
                  setViewMode('edit');
                }
              }} 
              className={`p-2 rounded-lg ${viewMode === 'edit' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}
            >
              <Edit3 size={18} />
            </button>
            <button onClick={() => setViewMode('preview')} className={`p-2 rounded-lg ${viewMode === 'preview' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}><Eye size={18} /></button>
            <button onClick={() => setViewMode('graph')} className={`p-2 rounded-lg ${viewMode === 'graph' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}><Network size={18} /></button>
            <button onClick={() => setViewMode('stats')} className={`p-2 rounded-lg ${viewMode === 'stats' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`} title={t('app.stats')}><BarChart3 size={18} /></button>
            <button onClick={() => setViewMode('calendar')} className={`p-2 rounded-lg ${viewMode === 'calendar' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`} title={t('app.calendar')}><Calendar size={18} /></button>
            <button onClick={() => setViewMode('bento')} className={`p-2 rounded-lg ${viewMode === 'bento' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`} title={t('app.bento')}><LayoutGrid size={18} /></button>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <button 
              onClick={() => setShowChat(!showChat)} 
              className={`p-2 rounded-lg transition-colors ${showChat ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="AI Assistant"
            >
              <MessageSquare size={18} />
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {showSettings ? (
            <motion.div key="settings" className="h-full w-full">
              <Settings onClose={handleCloseSettings} theme={theme} setTheme={(t) => { setTheme(t); localStorage.setItem('theme', t); }} />
            </motion.div>
          ) : viewMode === 'graph' ? (
            <motion.div key="graph" className="h-full w-full">
              <GraphView notes={notes} activeNoteId={activeNoteId} onNodeClick={handleNoteSelect} />
            </motion.div>
          ) : viewMode === 'stats' ? (
            <motion.div key="stats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full w-full p-8 scroll-elegant">
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
                    const matches = (n.content || '').match(/#\w+/g);
                    if (matches) matches.forEach(tag => { tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] || 0) + 1; });
                  });
                  return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm">{tag} ({count})</span>
                  ));
                })()}
              </div>
            </motion.div>
          ) : viewMode === 'bento' ? (
            <motion.div key="bento" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full w-full">
              <BentoGrid
                notes={notes.filter(n => !n.folderId || folders.some(f => f.id === n.folderId && (!f.isProtected || unlockedFolders.has(f.id))))}
                folders={folders}
                activeNoteId={activeNoteId}
                onNoteClick={handleNoteSelect}
              />
            </motion.div>
          ) : viewMode === 'calendar' ? (
            <motion.div key="calendar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full w-full px-8 pt-4 pb-8 scroll-elegant relative" onClick={() => expandedDay && setExpandedDay(null)}>
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
                    const dayNotes = notes.filter(n => (n.updatedAt || '').startsWith(dateStr));
                    const dayReminders = reminders.filter(r => (r.remind_at || '').startsWith(dateStr));
                    const allItems = [...dayNotes.map(n => ({ type: 'note' as const, id: n.id, title: n.title })), ...dayReminders.map(r => ({ type: 'reminder' as const, id: r.id, noteId: r.note_id, title: r.message || 'Напоминание', time: r.remind_at }))];
                    const expanded = expandedDay === dateStr;
                    const today = new Date();
                    const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear;
                    return (
                      <div key={i} className="relative">
                        <div onClick={(e) => { e.stopPropagation(); setExpandedDay(expanded ? null : dateStr); }}
                          className={`rounded-lg border p-2 min-h-[80px] transition-all duration-200 cursor-pointer hover:shadow-md ${isToday ? 'border-primary ring-1 ring-primary/30' : dayReminders.length > 0 ? 'border-violet-500/80 bg-violet-200 ring-2 ring-violet-400/60 dark:bg-violet-950/20 dark:ring-violet-300/30' : allItems.length > 0 ? 'border-primary/30 bg-primary/5' : 'border-border/30'} ${expanded ? 'shadow-lg' : ''}`}>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{day}</div>
                          {allItems.slice(0, 2).map(item => (
                            <div key={item.type + item.id} className="text-xs truncate text-foreground/80 flex items-center gap-1">
                              {item.type === 'reminder' && <Bell size={8} className="text-amber-500 shrink-0" />}
                              {item.title}
                            </div>
                          ))}
                          {!expanded && allItems.length > 2 && (
                            <div className="text-xs text-primary font-medium mt-0.5">+{allItems.length - 2}</div>
                          )}
                        </div>
                        <AnimatePresence>
                          {expanded && (
                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 4 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
                              className="absolute left-0 right-0 top-full z-50 bg-background border border-border/50 rounded-xl shadow-xl p-3 space-y-1"
                              onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-muted-foreground">{day} — {allItems.length} элементов</div>
                                <button onClick={(e) => { e.stopPropagation(); setCalReminderDate(dateStr); setShowCalendarReminder(true); setExpandedDay(null); }}
                                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors">
                                  <Plus size={12} /> Напоминание
                                </button>
                              </div>
                              {allItems.map(item => (
                                <div key={item.type + item.id} onClick={() => { if (item.type === 'note') handleNoteSelect(item.id); setExpandedDay(null); }}
                                  className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-muted cursor-pointer text-sm">
                                  <span className="flex items-center gap-1.5 truncate">
                                    {item.type === 'reminder' && <Bell size={10} className="text-amber-500 shrink-0" />}
                                    <span className="truncate">{item.title}</span>
                                  </span>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          ) : viewMode === 'board' && activeNote ? (
            <motion.div key={`board-${activeNote.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
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
            <motion.div key={`editor-${activeNote.id}`} className="h-full w-full">
              <Editor 
                note={activeNote} 
                allNotes={notes}
                onUpdate={updateNote} 
                onWikilinkClick={handleWikilinkClick}
                onTagClick={(tag) => { setSearchQuery(`#${tag}`); setShowSearch(true); }}
                isPreview={viewMode === 'preview'}
              />
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">{t('editor.empty')}</div>
          )}
        </AnimatePresence>
      </main>

      <ShareModal 
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ ...shareModal, isOpen: false })}
        resourceId={shareModal.id}
        resourceType={shareModal.type}
        resourceName={shareModal.name}
        baseUrl={baseUrl}
        onShareStatusChange={(isShared) => {
          if (shareModal.id) {
            if (shareModal.type === 'note') {
              updateNote(shareModal.id, { isSharedByMe: isShared });
            } else if (shareModal.type === 'folder') {
              setFolders(prev => prev.map(f => f.id === shareModal.id ? { ...f, isSharedByMe: isShared } : f));
              api.updateFolder(shareModal.id, { isSharedByMe: isShared });
            }
          }
        }}
      />

      <AnimatePresence>
        {showChat && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChat(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 md:hidden"
            />
            <motion.div 
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="fixed right-0 top-0 bottom-0 z-40 shadow-2xl"
            >
              <Chat notes={notes} folders={folders} unlockedFolders={unlockedFolders} activeNoteId={activeNoteId} onNoteClick={handleNoteSelect} api={api} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm px-4">
            <motion.div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center px-4 py-3 border-b border-border/50">
                <Search size={20} className="text-muted-foreground mr-3" />
                <input autoFocus type="text" placeholder={`${t('sidebar.search')}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-transparent border-none outline-none text-lg text-foreground" />
                <button onClick={() => setShowSearch(false)} className="p-1 text-muted-foreground"><X size={20} /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase())).map(note => (
                  <div key={note.id} onClick={() => handleNoteSelect(note.id)} className="px-4 py-3 rounded-lg cursor-pointer hover:bg-secondary">
                    <span className="text-primary font-medium">{note.title}</span>
                    <span className="text-sm text-muted-foreground line-clamp-1 mt-1">{note.content}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
