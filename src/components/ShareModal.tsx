import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Link as LinkIcon, Copy, Check, Lock, Unlock, AlertCircle, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../api/client';

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
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [shared, setShared] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShared(false);
      setShareId(null);
      setError('');
      setPermission('read');
    }
  }, [isOpen]);

  if (!isOpen || !resourceId || !resourceType) return null;

  const shareUrl = shareId ? `${effectiveBaseUrl}/shared/${shareId}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
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

  const handleShare = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.createShare(resourceType, resourceId, {
        target_username: null,
        permission,
        is_public: 1
      });
      if (result && result.id) {
        setShareId(result.id);
        setShared(true);
        // Update local note/folder to show share icon
        if (resourceType === 'note') {
          api.updateNote(resourceId, { isSharedByMe: true });
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShare = async () => {
    if (!shareId) return;
    try {
      await api.deleteShare(shareId);
      setShared(false);
      setShareId(null);
      // Clear share icon from local note
      if (resourceType === 'note') {
        api.updateNote(resourceId, { isSharedByMe: false });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to delete share');
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
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">{t('share.title') || 'Поделиться'}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('share.description') || 'Ссылка для доступа к'} <span className="font-medium text-foreground">{resourceName}</span>
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPermission('read')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${permission === 'read' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <Lock size={14} /> {t('share.readOnly') || 'Только чтение'}
              </button>
              <button
                onClick={() => setPermission('write')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${permission === 'write' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <Unlock size={14} /> {t('share.canEdit') || 'Можно редактировать'}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {!shared ? (
              <button
                onClick={handleShare}
                disabled={loading}
                className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {loading ? '...' : <><Globe size={16} /> {t('share.createLink') || 'Создать ссылку'}</>}
              </button>
            ) : (
              <div className="space-y-3">
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
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {permission === 'read'
                      ? (t('share.readOnlyHint') || 'Получатель сможет только читать.')
                      : (t('share.canEditHint') || 'Получатель сможет редактировать.')}
                  </p>
                  <button
                    onClick={handleDeleteShare}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <Trash2 size={12} /> {t('share.delete') || 'Удалить'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
