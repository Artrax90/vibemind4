import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Copy, Check, ExternalLink, Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type PublishModalProps = {
  isOpen: boolean;
  onClose: () => void;
  slug: string | null;
  title: string;
  onPublish?: (expiresMinutes: number) => void;
  isPublished?: boolean;
};

export default function PublishModal({ isOpen, onClose, slug, title, onPublish, isPublished }: PublishModalProps) {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expireH, setExpireH] = useState(0);
  const [expireM, setExpireM] = useState(30);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const url = slug ? `${window.location.origin}/api/published/${slug}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePublish = async () => {
    if (!onPublish) return;
    setPublishing(true);
    try {
      await onPublish(expireH * 60 + expireM);
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          ref={panelRef}
          className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-premium-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">{t('publish.title') || 'Publish'}</h3>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{title}</p>
                <p className="text-xs text-muted-foreground">{isPublished ? (t('publish.ready') || 'Published') : t('publish.notPublished')}</p>
              </div>
            </div>

            {!slug && onPublish && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock size={12} /> {t('publish.expiresIn')}
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={72} value={expireH} onChange={e => setExpireH(Math.max(0, Math.min(72, Number(e.target.value))))}
                      className="w-14 px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground text-center outline-none focus:border-primary" />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                  <span className="text-muted-foreground">:</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={59} value={expireM} onChange={e => setExpireM(Math.max(0, Math.min(59, Number(e.target.value))))}
                      className="w-14 px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground text-center outline-none focus:border-primary" />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                  <button onClick={() => { setExpireH(0); setExpireM(0); }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors">
                    {t('publish.noLimit')}
                  </button>
                </div>
              </div>
            )}

            {slug && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t('publish.url') || 'Public URL'}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-xl text-sm text-foreground font-mono truncate">
                    {url}
                  </div>
                  <button onClick={handleCopy}
                    className={`p-2 rounded-xl transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('publish.description') || 'This content will be available at the public URL.'}
            </p>
          </div>

          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
              {t('common.close') || 'Close'}
            </button>
            {!slug && onPublish ? (
              <button onClick={handlePublish} disabled={publishing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl shadow-premium hover:shadow-premium-lg transition-all disabled:opacity-50">
                <Globe size={14} />
                {publishing ? t('publish.publishing') : t('publish.publish')}
              </button>
            ) : slug ? (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl shadow-premium hover:shadow-premium-lg transition-all">
                <ExternalLink size={14} />
                {t('publish.open') || 'Open'}
              </a>
            ) : null}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
