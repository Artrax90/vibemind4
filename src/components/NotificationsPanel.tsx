import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2, Clock, FileText } from 'lucide-react';
import { api } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';

type Reminder = {
  id: string;
  note_id: string;
  remind_at: string;
  repeat_type: string;
  message: string;
  is_sent: number;
  created_at: string;
};

export default function NotificationsPanel({ onNoteClick }: { onNoteClick: (id: string) => void }) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReminders();
    // Poll every 30 seconds
    const interval = setInterval(loadReminders, 30000);
    return () => clearInterval(interval);
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Check for due reminders (browser notifications)
  useEffect(() => {
    const checkBrowserNotifications = () => {
      const now = new Date();
      reminders.forEach(r => {
        if (r.is_sent) return;
        const remindAt = new Date(r.remind_at);
        if (remindAt <= now) {
          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🔔 VibeMind', {
              body: r.message || t('reminder.defaultMessage'),
              icon: '/icon.svg'
            });
          }
        }
      });
    };

    const interval = setInterval(checkBrowserNotifications, 10000);
    return () => clearInterval(interval);
  }, [reminders]);

  const loadReminders = async () => {
    setLoading(true);
    const data = await api.getReminders();
    setReminders(data || []);
    setLoading(false);
  };

  const handleDismiss = async (id: string) => {
    await api.deleteReminder(id);
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const activeReminders = reminders.filter(r => !r.is_sent);
  const pastReminders = reminders.filter(r => r.is_sent);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
      >
        <Bell size={18} />
        {activeReminders.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
            {activeReminders.length}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border/50 rounded-2xl shadow-premium-lg overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t('notifications.title')}</h3>
              <span className="text-xs text-muted-foreground">{activeReminders.length} {t('notifications.active')}</span>
            </div>

            <div className="max-h-80 overflow-y-auto scroll-elegant">
              {loading && reminders.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">{t('notifications.loading')}</div>
              ) : reminders.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">{t('notifications.empty')}</div>
              ) : (
                <>
                  {/* Active reminders */}
                  {activeReminders.map(r => (
                    <div key={r.id} className="px-4 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Clock size={10} />
                            {new Date(r.remind_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                            {r.repeat_type !== 'none' && (
                              <span className="px-1.5 py-0.5 bg-accent/50 rounded text-[9px]">{r.repeat_type}</span>
                            )}
                          </div>
                          {r.message && (
                            <p className="text-sm text-foreground truncate">{r.message}</p>
                          )}
                          <button
                            onClick={() => r.note_id && onNoteClick(r.note_id)}
                            className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                          >
                            <FileText size={10} /> {t('notifications.openNote')}
                          </button>
                        </div>
                        <button
                          onClick={() => handleDismiss(r.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Past reminders */}
                  {pastReminders.length > 0 && (
                    <div className="px-4 py-2">
                      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-2">{t('notifications.completed')}</p>
                      {pastReminders.slice(0, 5).map(r => (
                        <div key={r.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground/50">
                          <Check size={10} className="text-emerald-500" />
                          <span className="truncate">{r.message || t('reminder.defaultMessage')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
