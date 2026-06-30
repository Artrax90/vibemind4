import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Copy, Check, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type PublishModalProps = {
  isOpen: boolean;
  onClose: () => void;
  slug: string | null;
  title: string;
};

export default function PublishModal({ isOpen, onClose, slug, title }: PublishModalProps) {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

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
      // Fallback
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
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">{t('publish.title')}</h3>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Note info */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{title}</p>
                <p className="text-xs text-muted-foreground">{t('publish.ready')}</p>
              </div>
            </div>

            {/* URL */}
            {slug && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t('publish.url')}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-xl text-sm text-foreground font-mono truncate">
                    {url}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`p-2 rounded-xl transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Note */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('publish.description')}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
            >
              {t('common.close')}
            </button>
            {slug && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl shadow-premium hover:shadow-premium-lg transition-all"
              >
                <ExternalLink size={14} />
                {t('publish.open')}
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
