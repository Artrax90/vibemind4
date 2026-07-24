import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Link as LinkIcon, Copy, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  resourceId: string | null;
  resourceType: 'note' | 'folder' | null;
  resourceName: string | null;
  baseUrl?: string;
};

export default function ShareModal({ isOpen, onClose, resourceId, resourceType, resourceName, baseUrl }: ShareModalProps) {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const effectiveBaseUrl = baseUrl || window.location.origin;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen || !resourceId || !resourceType) return null;

  // Generate share link locally — NO server calls
  const shareId = crypto.randomUUID();
  const shareUrl = `${effectiveBaseUrl}/shared/${shareId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">{t('share.title') || 'Поделиться'}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('share.description') || 'Ссылка для доступа к'} <span className="font-medium text-foreground">{resourceName}</span>
            </p>

            {/* Share URL */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground font-mono truncate flex items-center gap-2">
                <LinkIcon size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate">{shareUrl}</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 text-sm shrink-0"
              >
                {copied ? <><Check size={14} /> {t('share.copied') || 'Скопировано'}</> : <><Copy size={14} /> {t('share.copy') || 'Копировать'}</>}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('share.hint') || 'Скопируйте ссылку и отправьте тому, кому хотите дать доступ.'}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
