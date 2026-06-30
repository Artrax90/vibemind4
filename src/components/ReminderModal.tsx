import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Calendar, Clock, Repeat } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type ReminderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { remind_at: string; repeat_type: string; message: string }) => void;
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'Без повтора' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekly', label: 'Каждую неделю' },
  { value: 'monthly', label: 'Каждый месяц' },
];

export default function ReminderModal({ isOpen, onClose, onConfirm }: ReminderModalProps) {
  const { t } = useLanguage();
  const today = new Date();
  const [date, setDate] = useState(today.toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [repeat, setRepeat] = useState('none');
  const [message, setMessage] = useState('');

  // Quick presets
  const presets = [
    { label: 'Через 1 час', date: (() => { const d = new Date(); d.setHours(d.getHours() + 1); return d; })() },
    { label: 'Завтра', date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0); return d; })() },
    { label: 'Через неделю', date: (() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0); return d; })() },
  ];

  const handlePreset = (presetDate: Date) => {
    setDate(presetDate.toISOString().split('T')[0]);
    setTime(`${String(presetDate.getHours()).padStart(2, '0')}:${String(presetDate.getMinutes()).padStart(2, '0')}`);
  };

  const handleConfirm = () => {
    const remindAt = `${date}T${time}:00`;
    onConfirm({ remind_at: remindAt, repeat_type: repeat, message });
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-premium-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">{t('reminder.title')}</h3>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Quick presets */}
            <div className="flex gap-2">
              {presets.map(({ label, date: presetDate }) => (
                <button
                  key={label}
                  onClick={() => handlePreset(presetDate)}
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date picker */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar size={12} /> {t('reminder.date')}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today.toISOString().split('T')[0]}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
              <p className="text-[10px] text-muted-foreground/60 ml-1">{formatDate(date)}</p>
            </div>

            {/* Time picker */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock size={12} /> {t('reminder.time')}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>

            {/* Repeat */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Repeat size={12} /> {t('reminder.repeat')}
              </label>
              <div className="flex gap-1.5">
                {REPEAT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRepeat(opt.value)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                      repeat === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('reminder.message')}</label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('reminder.messagePlaceholder')}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl shadow-premium hover:shadow-premium-lg transition-all"
            >
              {t('reminder.set')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
