import React, { useState, useEffect } from 'react';
import { X, Globe, Shield, User, Download, Upload, Cpu, Webhook, MessageSquare, Plus, Save, Trash2, CheckCircle, Check, AlertCircle, Database, Edit2, Server, Lock, Key, Sun, Moon, Terminal, RefreshCw, Calendar, Sparkles, Brain, Zap, TestTube } from 'lucide-react';
import CreateUserModal from '../components/modals/CreateUserModal';
import AddDBModal from '../components/modals/AddDBModal';
import { api, getAuthHeaders } from './client';
import { useLanguage } from '../contexts/LanguageContext';
import { updateSettings, getBotStatus, getSettings } from '../api/settings';

function GoogleCalendarSection() {
  const { t } = useLanguage();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getCalendarStatus().then(res => {
      setConnected(res.connected);
      setLoading(false);
    });
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId || !clientSecret) return;
    try {
      const url = await api.getNormalizedUrl();
      const res = await fetch(`${url}/api/calendar/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret })
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConnect = async () => {
    if (!clientId || !clientSecret) {
      alert(t('settings.calendarEnterCredentials') || 'Сначала введите Client ID и Client Secret');
      return;
    }
    const res = await api.getCalendarAuthUrl();
    if (res.auth_url) {
      window.open(res.auth_url, '_blank', 'width=500,height=600');
      const interval = setInterval(async () => {
        const status = await api.getCalendarStatus();
        if (status.connected) {
          setConnected(true);
          clearInterval(interval);
        }
      }, 2000);
      setTimeout(() => clearInterval(interval), 30000);
    }
  };

  const handleDisconnect = async () => {
    await api.disconnectCalendar();
    setConnected(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">{t('settings.loading')}</div>;

  return (
    <div className="bg-card p-4 rounded-xl border border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Google Calendar</p>
            <p className="text-xs text-muted-foreground">
              {connected ? t('settings.connected') : t('settings.notConfigured')}
            </p>
          </div>
        </div>
        {connected ? (
          <button onClick={handleDisconnect} className="px-3 py-1.5 text-xs rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
            {t('settings.disconnect')}
          </button>
        ) : (
          <button onClick={handleConnect} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            {t('settings.connect')}
          </button>
        )}
      </div>

      {!connected && (
        <div className="space-y-3 pt-2 border-t border-border/30">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="your-client-id.apps.googleusercontent.com"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Client Secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-..."
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={handleSaveCredentials}
            className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            {saved ? '✓' : t('settings.save')}
          </button>
        </div>
      )}
    </div>
  );
}

type SettingsProps = {
  onClose: () => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
};

export default function Settings({ onClose, theme, setTheme }: SettingsProps) {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'connection' | 'general' | 'ai' | 'bots' | 'users' | 'profile' | 'logs'>('connection');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [logs, setLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [syncConfig, setSyncConfig] = useState({ server_url: '', username: '', password: '' });
  
  // Proxy State
  const [proxyConfig, setProxyConfig] = useState({
    protocol: 'HTTP',
    host: '',
    port: '',
    username: '',
    password: ''
  });
  
  const [webhookUrl, setWebhookUrl] = useState('');

  // AI & LLM State
  const [providers, setProviders] = useState([
    { id: 'mimo', label: 'Xiaomi MiMo', provider: 'mimo', apiKey: '', baseUrl: 'https://api.xiaomi.com/v1', modelName: 'mimo-auto', isActive: false, status: 'idle' },
    { id: 'openai', label: 'OpenAI', provider: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4o-mini', isActive: true, status: 'idle' },
    { id: 'gemini', label: 'Google Gemini', provider: 'gemini', apiKey: '', baseUrl: '', modelName: 'gemini-1.5-flash', isActive: false, status: 'idle' },
    { id: 'openrouter', label: 'OpenRouter', provider: 'openrouter', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', modelName: 'google/gemini-2.0-flash-001', isActive: false, status: 'idle' },
    { id: 'ollama', label: 'Ollama', provider: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434/v1', modelName: 'llama3', isActive: false, status: 'idle' }
  ]);

  // AI Tab State
  const [aiChatModel, setAiChatModel] = useState('auto');
  const [aiSummaryModel, setAiSummaryModel] = useState('auto');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('Ты — VibeMind AI, умный помощник для работы с заметками. Отвечай кратко и по делу на языке пользователя.');
  const [aiTemperature, setAiTemperature] = useState(0.7);
  const [aiMaxTokens, setAiMaxTokens] = useState(2048);
  const [ragStats, setRagStats] = useState<any>(null);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  // External DB State
  const [externalDbs, setExternalDbs] = useState<any[]>([]);
  const [isAddDBOpen, setIsAddDBOpen] = useState(false);

  // Telegram State
  const [botToken, setBotToken] = useState('');
  const [adminId, setAdminId] = useState('');
  const [botStatus, setBotStatus] = useState<any>({ status: 'disconnected' });
  const [allBots, setAllBots] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  // Users State
  const [isReindexing, setIsReindexing] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const serverFetch = async (path: string, options?: RequestInit) => {
    const url = await api.getNormalizedUrl();
    const headers = { ...getAuthHeaders(), ...options?.headers };
    return fetch(`${url}${path}`, { ...options, headers });
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const me = await api.getMe();
        console.log('Current user:', me);
        setCurrentUser(me);
        
        const config = await getSettings();
        if (config) {
          if (config.tg_token) setBotToken(config.tg_token);
          if (config.tg_admin_id) setAdminId(config.tg_admin_id);
          if (config.proxy_config) setProxyConfig(config.proxy_config);
          
          if (config.llm_provider) {
            setProviders(prev => prev.map(p => {
              if (p.provider === config.llm_provider) {
                return { 
                  ...p, 
                  isActive: true, 
                  apiKey: config.api_key || '', 
                  baseUrl: config.base_url || p.baseUrl,
                  modelName: config.model_name || p.modelName,
                  status: 'connected'
                };
              }
              return { ...p, isActive: false };
            }));
          }
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && currentUser?.role === 'admin') {
      api.getUsers().then(setUsers).catch(console.error);
    }
    if (activeTab === 'logs' && currentUser?.role === 'admin') {
      fetchLogs();
    }
    if (activeTab === 'general') {
      api.getExternalDbs()
        .then(dbs => setExternalDbs(dbs || []))
        .catch(() => setExternalDbs([]));
    }
    if (activeTab === 'bots' && currentUser?.role === 'admin') {
      serverFetch('/api/admin/bots', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      .then(res => res.json())
      .then(setAllBots)
      .catch(console.error);
    }
  }, [activeTab, currentUser]);

  const fetchLogs = async () => {
    console.log('Fetching logs...');
    setIsLoadingLogs(true);
    try {
      const response = await api.getLogs();
      console.log('Logs response:', response);
      setLogs(response.logs || '');
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch RAG stats when AI tab opens
  useEffect(() => {
    if (activeTab === 'ai') {
      serverFetch('/api/notes', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      .then(res => res.json())
      .then(data => {
        const notes = Array.isArray(data) ? data : [];
        setRagStats({ total_notes: notes.length });
      })
      .catch(() => setRagStats({ total_notes: 0 }));
    }
  }, [activeTab]);

  const handleTestAI = async () => {
    if (!testPrompt.trim()) return;
    setIsTestingAI(true);
    setTestResponse('');
    try {
      const response = await serverFetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ message: testPrompt })
      });
      const data = await response.json();
      setTestResponse(data.answer || data.response || data.message || 'No response');
    } catch (e) {
      setTestResponse('Error: failed to connect');
    } finally {
      setIsTestingAI(false);
    }
  };

  // Poll bot status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await getBotStatus();
        setBotStatus(data);
      } catch (e) {
        setBotStatus({ status: 'error' });
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        tg_token: botToken,
        tg_admin_id: adminId,
        proxy_config: proxyConfig,
        llm_provider: providers.find(p => p.isActive)?.provider,
        api_key: providers.find(p => p.isActive)?.apiKey,
        base_url: providers.find(p => p.isActive)?.baseUrl,
        model_name: providers.find(p => p.isActive)?.modelName
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestBot = async () => {
    if (!botToken) {
      setBotStatus({ status: 'error' });
      return;
    }
    
    setIsTesting(true);
    try {
      const data = await api.testBotConnection(botToken, proxyConfig);
      if (data.message && !data.detail) {
        setBotStatus({ status: 'connected' });
        alert(data.message || t('settings.connSuccess'));
      } else {
        setBotStatus({ status: 'error' });
        alert(`${t('settings.connFailed')}${data.detail || t('settings.unknownError')}`);
      }
    } catch (error) {
      console.error('Network Error:', error);
      setBotStatus({ status: 'error' });
      alert(t('settings.apiFailed'));
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestProxy = async () => {
    if (!proxyConfig.host) {
      alert(t('settings.proxyHostReq'));
      return;
    }
    try {
      const data = await api.testProxy(proxyConfig);
      if (data.status === 'success') {
        alert(t('settings.proxySuccess'));
      } else {
        alert(`${t('settings.proxyFailed')}${data.detail || t('settings.unknownError')}`);
      }
    } catch (e) {
      alert(t('settings.proxyReqFailed'));
    }
  };

  const handleAddExternalDB = async (dbData: any) => {
    try {
      const dbs = await api.addExternalDb(dbData);
      setExternalDbs(dbs);
      alert(t('settings.dbSuccess'));
    } catch (e) {
      console.error(e);
      alert(t('settings.dbError'));
    }
  };

  const handleDeleteExternalDB = async (dbId: string) => {
    if (!confirm(t('settings.confirmDeleteDb') || 'Are you sure you want to delete this database connection?')) return;
    try {
      const dbs = await api.deleteExternalDb(dbId);
      setExternalDbs(dbs);
    } catch (e) {
      console.error(e);
      alert(t('settings.deleteDbFailed') || 'Failed to delete database connection');
    }
  };

  const handleTestProvider = async (provider: any) => {
    setTestingProviderId(provider.id);
    setTestResult(null);
    try {
      const data = await api.testProvider(provider);
      if (data.status === 'success') {
        setProviders(providers.map(p => p.id === provider.id ? { ...p, status: 'connected' } : p));
        setTestResult({ id: provider.id, ok: true, msg: t('settings.connSuccess') });
      } else {
        setProviders(providers.map(p => p.id === provider.id ? { ...p, status: 'error' } : p));
        setTestResult({ id: provider.id, ok: false, msg: data.detail || data.message || t('settings.unknownError') });
      }
    } catch (error) {
      console.error('Test Provider Error:', error);
      setProviders(providers.map(p => p.id === provider.id ? { ...p, status: 'error' } : p));
      setTestResult({ id: provider.id, ok: false, msg: t('settings.connFailed') });
    } finally {
      setTestingProviderId(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleCreateUser = async (user: any) => {
    try {
      if (editingUser) {
        const updatedUser = await api.updateUser(editingUser.id, user);
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...updatedUser } : u));
        setEditingUser(null);
      } else {
        const newUser = await api.createUser(user);
        setUsers([...users, newUser]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addProvider = () => {
    setProviders([...providers, { id: Date.now().toString(), label: 'New Provider', provider: 'custom', apiKey: '', baseUrl: 'https://api.example.com/v1', modelName: 'default-model', isActive: false, status: 'idle' }]);
  };

  const updateProvider = (id: string, field: string, value: any) => {
    setProviders(providers.map(p => {
      if (p.id === id) {
        let updated = { ...p, [field]: value };
        
        // Set defaults when provider type changes
        if (field === 'provider') {
          if (value === 'openai') {
            updated.baseUrl = 'https://api.openai.com/v1';
            updated.modelName = 'gpt-4o-mini';
          } else if (value === 'gemini') {
            updated.baseUrl = '';
            updated.modelName = 'gemini-1.5-flash';
          } else if (value === 'openrouter') {
            updated.baseUrl = 'https://openrouter.ai/api/v1';
            updated.modelName = 'google/gemini-2.0-flash-001';
          } else if (value === 'ollama') {
            updated.baseUrl = 'http://localhost:11434/v1';
            updated.modelName = 'llama3';
          }
        }

        if (field === 'isActive' && value === true) {
          // Deactivate others
          return updated;
        }
        return updated;
      }
      if (field === 'isActive' && value === true) return { ...p, isActive: false };
      return p;
    }));
  };

  const removeProvider = (id: string) => {
    setProviders(providers.filter(p => p.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      <div className="px-8 py-6 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold text-foreground">{t('settings.title')}</h2>
        <div className="flex items-center space-x-4">
          <button onClick={handleSave} disabled={isSaving} className={`flex items-center px-4 py-2 rounded-xl shadow-premium hover:shadow-premium-lg hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground'}`}>
            {saveSuccess ? <><Check size={16} className="mr-2" /> {t('settings.saved')}</> : <><Save size={16} className={`mr-2 ${isSaving ? 'animate-spin' : ''}`} /> {isSaving ? t('settings.saving') : t('settings.save')}</>}
          </button>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar Tabs — horizontal on mobile, vertical on desktop */}
        <div className="md:w-64 md:border-r border-b md:border-b-0 border-border/50 p-2 md:p-4 overflow-x-auto md:overflow-y-auto md:scroll-elegant flex md:flex-col gap-1 shrink-0">
          <button onClick={() => setActiveTab('connection')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'connection' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Server size={16} className="mr-2" /> {t('settings.connection')}
          </button>
          <button onClick={() => setActiveTab('general')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'general' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Globe size={16} className="mr-2" /> {t('settings.general')}
          </button>
          <button onClick={() => setActiveTab('ai')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Sparkles size={16} className="mr-2" /> {t('settings.ai')}
          </button>
          <button onClick={() => setActiveTab('bots')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'bots' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <MessageSquare size={16} className="mr-2" /> {t('settings.bots')}
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'profile' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <User size={16} className="mr-2" /> {t('settings.profile') || 'Profile'}
          </button>
          {currentUser?.role === 'admin' && (
            <>
              <button onClick={() => setActiveTab('users')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'users' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <Shield size={16} className="mr-2" /> {t('settings.users')}
              </button>
              <button onClick={() => setActiveTab('logs')} className={`flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <Terminal size={16} className="mr-2" /> {t('settings.logs') || 'Logs'}
              </button>
            </>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-elegant">
          <div className="max-w-3xl mx-auto space-y-8">

            {activeTab === 'connection' && (
              <section className="space-y-6">
                <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.connection')}</h3>
                <p className="text-sm text-muted-foreground">{t('settings.connectionDesc')}</p>
                <div className="bg-card p-5 rounded-xl border border-border/50 space-y-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">{t('settings.serverUrl')}</label>
                    <input type="text" value={syncConfig.server_url} onChange={(e) => setSyncConfig({ ...syncConfig, server_url: e.target.value })}
                      placeholder="http://localhost:3344" className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">{t('settings.username')}</label>
                      <input type="text" value={syncConfig.username} onChange={(e) => setSyncConfig({ ...syncConfig, username: e.target.value })}
                        placeholder="admin" className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">{t('settings.password')}</label>
                      <input type="password" value={syncConfig.password} onChange={(e) => setSyncConfig({ ...syncConfig, password: e.target.value })}
                        placeholder="••••••" className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">{t('settings.status')}:</span>
                      <span className="text-xs text-muted-foreground">{t('settings.notTested')}</span>
                    </div>
                    <button onClick={async () => {
                      try {
                        await api.updateSettings(syncConfig);
                        setSaveSuccess(true);
                        setTimeout(() => setSaveSuccess(false), 2000);
                      } catch (e) { console.error(e); }
                    }} className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center text-sm">
                      {saveSuccess ? <><Check size={14} className="mr-1" /> {t('settings.saved')}</> : t('settings.save')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'general' && (
              <>
                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.systemStatus')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-card p-4 rounded-xl border border-border/50 flex items-center justify-between shadow-premium">
                      <div className="flex items-center">
                        <Cpu size={18} className="mr-3 text-primary" />
                        <div>
                          <div className="text-xs text-muted-foreground">{t('settings.aiAssistant')}</div>
                          <div className="text-sm font-medium text-foreground">
                            {providers.find(p => p.isActive)?.status === 'connected' ? t('settings.connected') : t('settings.notConfigured')}
                          </div>
                        </div>
                      </div>
                      {providers.find(p => p.isActive)?.status === 'connected' ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <AlertCircle size={16} className="text-muted-foreground" />
                      )}
                    </div>

                    <div className="bg-card p-4 rounded-xl border border-border/50 flex items-center justify-between">
                      <div className="flex items-center">
                        <MessageSquare size={18} className="mr-3 text-primary" />
                        <div>
                          <div className="text-xs text-muted-foreground">{t('settings.telegramBot')}</div>
                          <div className="text-sm font-medium text-foreground">
                            {botStatus.status === 'connected' ? (botStatus.username ? `@${botStatus.username}` : t('settings.live')) : t('settings.offline')}
                          </div>
                        </div>
                      </div>
                      {botStatus.status === 'connected' ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <AlertCircle size={16} className="text-muted-foreground" />
                      )}
                    </div>

                    <div className="bg-card p-4 rounded-xl border border-border/50 flex items-center justify-between">
                      <div className="flex items-center">
                        <Server size={18} className="mr-3 text-primary" />
                        <div>
                          <div className="text-xs text-muted-foreground">{t('settings.proxyStatus')}</div>
                          <div className="text-sm font-medium text-foreground">
                            {proxyConfig.host ? t('settings.configured') : t('settings.direct')}
                          </div>
                        </div>
                      </div>
                      {proxyConfig.host ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-border/50" />
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.language')}</h3>
                  <div className="flex items-center space-x-4 bg-card p-4 rounded-lg border border-border/50">
                    <button onClick={() => setLanguage('EN')} className={`px-4 py-2 rounded-lg transition-colors ${language === 'EN' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>English</button>
                    <button onClick={() => setLanguage('RU')} className={`px-4 py-2 rounded-lg transition-colors ${language === 'RU' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>Русский</button>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.theme')}</h3>
                  <div className="flex items-center space-x-4 bg-card p-4 rounded-lg border border-border/50">
                    <button 
                      onClick={() => setTheme('light')} 
                      className={`flex items-center px-4 py-2 rounded-lg transition-colors ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                      <Sun size={16} className="mr-2" /> {t('settings.light')}
                    </button>
                    <button 
                      onClick={() => setTheme('dark')} 
                      className={`flex items-center px-4 py-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                      <Moon size={16} className="mr-2" /> {t('settings.dark')}
                    </button>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.googleCalendar')}</h3>
                  <GoogleCalendarSection />
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.webhooks')}</h3>
                  <div className="bg-card p-4 rounded-lg border border-border/50">
                    <input type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="http://homeassistant.local:8123/api/webhook/vibemind" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.dataManagement')}</h3>
                  <div className="bg-card p-4 rounded-lg border border-border/50 flex justify-between items-center">
                    <div>
                      <div className="text-foreground font-medium">{t('settings.reindexSearch')}</div>
                      <div className="text-sm text-muted-foreground">{t('settings.reindexDesc')}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        setIsReindexing(true);
                        try {
                          const res = await serverFetch('/api/notes/reindex', {
                            method: 'POST',
                            headers: { 
                              'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                              'Content-Type': 'application/json'
                            }
                          });
                          const data = await res.json();
                          if (res.ok) {
                            alert(data.message || t('settings.reindexSuccess'));
                          } else {
                            alert(`Error: ${data.detail || t('settings.reindexFailed')}`);
                          }
                        } catch (e) {
                          console.error(e);
                          alert(t('settings.reindexFailed'));
                        } finally {
                          setIsReindexing(false);
                        }
                      }}
                      disabled={isReindexing}
                      className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors flex items-center disabled:opacity-50"
                    >
                      <Database size={16} className={`mr-2 ${isReindexing ? 'animate-spin' : ''}`} /> {isReindexing ? t('settings.reindexing') : t('settings.reindex')}
                    </button>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.export')}</h3>
                  <div className="bg-card p-4 rounded-lg border border-border/50 flex justify-between items-center">
                    <div>
                      <div className="text-foreground font-medium">{t('settings.markdownExport')}</div>
                      <div className="text-sm text-muted-foreground">{t('settings.exportDesc')}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const res = await serverFetch('/api/notes/export', {
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
                          });
                          if (res.ok) {
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `notes_export_${new Date().toISOString().slice(0,10)}.zip`;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            }, 1000);
                          } else {
                            alert(t('settings.exportFailed'));
                          }
                        } catch (e) {
                          console.error(e);
                          alert(t('settings.exportError'));
                        }
                      }}
                      className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors flex items-center"
                    >
                      <Download size={16} className="mr-2" /> {t('settings.exportZip')}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/50">
                    <div>
                      <div className="text-foreground font-medium">{t('settings.importNotes')}</div>
                      <div className="text-sm text-muted-foreground">{t('settings.importDesc')}</div>
                    </div>
                    <label className="px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border/50 hover:border-primary transition-all flex items-center cursor-pointer">
                      <Upload size={16} className="mr-2" /> {t('settings.importZip')}
                      <input 
                        type="file" 
                        accept=".zip" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const formData = new FormData();
                          formData.append('file', file);
                          
                          const res = await api.importNotes(formData);
                          if (res.count > 0) {
                            alert(`${t('settings.importSuccess')} (${res.count})`);
                            // Optionally trigger a re-fetch of notes here if needed
                          } else {
                            alert(t('settings.importFailed'));
                          }
                          
                          // Reset input
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.externalDatabases')}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('settings.externalDbDesc')}
                      </p>
                    </div>
                    <button 
                      onClick={() => setIsAddDBOpen(true)}
                      className="flex items-center px-3 py-1.5 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border/50 hover:border-primary transition-all"
                    >
                      <Plus size={16} className="mr-2" /> {t('settings.addDb')}
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {externalDbs && externalDbs.length > 0 ? (
                      externalDbs.map((db, idx) => (
                        <div key={db.id || idx} className="bg-card p-4 rounded-xl border border-border/50 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <Database className="text-primary w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-foreground font-medium">{db.display_name || db.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{(db.db_type || db.type || 'DB').toUpperCase()} // {db.connection_string ? (db.connection_string.split('@')[1] || 'Local') : '...'}</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteExternalDB(db.id)}
                            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="bg-card p-6 rounded-lg border border-border/50 text-center text-muted-foreground">
                        <Database size={32} className="mx-auto mb-2 opacity-50" />
                        <p>{t('settings.noExternalDbs')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-8">
                {/* Active Provider — compact dropdown */}
                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.aiProviders')}</h3>
                  <div className="bg-card p-4 rounded-xl border border-border/50 flex items-center space-x-4">
                    <Sparkles size={18} className="text-primary shrink-0" />
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground mb-1">{t('settings.aiActiveProvider')}</label>
                      <select
                        value={providers.find(p => p.isActive)?.id || 'openai'}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id === '__custom__') {
                            const newProvider = { id: `custom-${Date.now()}`, label: 'Custom', provider: 'custom', apiKey: '', baseUrl: '', modelName: '', isActive: true, status: 'idle' };
                            setProviders(providers.map(p => ({ ...p, isActive: false })).concat(newProvider));
                          } else {
                            setProviders(providers.map(p => ({ ...p, isActive: p.id === id })));
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      >
                        <option value="__custom__">{t('settings.aiAddCustom')}</option>
                        {providers.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.label} — {p.modelName || '...'}
                            {p.status === 'connected' ? ' ✓' : p.status === 'error' ? ' ✗' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="shrink-0">
                      {providers.find(p => p.isActive)?.status === 'connected' ? (
                        <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-medium"><CheckCircle size={14} className="mr-1" /> {t('settings.connected')}</span>
                      ) : providers.find(p => p.isActive)?.status === 'error' ? (
                        <span className="flex items-center text-destructive text-xs"><AlertCircle size={14} className="mr-1" /> {t('settings.error')}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t('settings.notTested')}</span>
                      )}
                    </div>
                  </div>
                </section>

                {/* Provider Config (expanded for active) */}
                {providers.filter(p => p.isActive).map(provider => (
                  <section key={provider.id} className="space-y-4">
                    <h3 className="font-serif text-xl font-semibold text-foreground">
                      {provider.label} — {t('settings.configuration')}
                    </h3>
                    <div className="bg-card p-5 rounded-xl border border-border/50 space-y-4">
                      {provider.provider === 'custom' && (
                        <div>
                          <label className="block text-sm text-muted-foreground mb-1">{t('settings.label')}</label>
                          <input
                            type="text"
                            value={provider.label}
                            onChange={(e) => updateProvider(provider.id, 'label', e.target.value)}
                            placeholder="My Custom Provider"
                            className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-muted-foreground mb-1">{t('settings.apiKey')}</label>
                          <input
                            type="password"
                            value={provider.apiKey}
                            onChange={(e) => updateProvider(provider.id, 'apiKey', e.target.value)}
                            placeholder={provider.provider === 'mimo' ? 'xiaomi-...' : 'sk-...'}
                            className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-muted-foreground mb-1">{t('settings.modelName')}</label>
                          {(() => {
                            const knownModels: Record<string, string[]> = {
                              mimo: ['mimo-auto', 'mimo-pro', 'mimo-lite'],
                              openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
                              gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
                              openrouter: ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
                              ollama: ['llama3', 'llama3.1', 'mistral', 'phi3', 'gemma2', 'qwen2.5']
                            };
                            const models = knownModels[provider.provider] || [];
                            const isCustom = models.length > 0 && !models.includes(provider.modelName);
                            return (
                              <>
                                <select
                                  value={isCustom ? '__custom__' : provider.modelName}
                                  onChange={(e) => {
                                    if (e.target.value === '__custom__') {
                                      updateProvider(provider.id, 'modelName', '');
                                    } else {
                                      updateProvider(provider.id, 'modelName', e.target.value);
                                    }
                                  }}
                                  className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                >
                                  {models.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                  <option value="__custom__">{t('settings.aiCustomModel')}</option>
                                </select>
                                {(isCustom || models.length === 0) && (
                                  <input
                                    type="text"
                                    value={provider.modelName}
                                    onChange={(e) => updateProvider(provider.id, 'modelName', e.target.value)}
                                    placeholder="model-name"
                                    className="w-full mt-2 bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      {provider.provider !== 'gemini' && (
                        <div>
                          <label className="block text-sm text-muted-foreground mb-1">{t('settings.baseUrl')}</label>
                          <input
                            type="text"
                            value={provider.baseUrl}
                            onChange={(e) => updateProvider(provider.id, 'baseUrl', e.target.value)}
                            placeholder="https://api.example.com/v1"
                            className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">{t('settings.status')}:</span>
                          {provider.status === 'connected' && <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-medium"><CheckCircle size={14} className="mr-1" /> {t('settings.connected')}</span>}
                          {provider.status === 'error' && <span className="flex items-center text-destructive text-xs"><AlertCircle size={14} className="mr-1" /> {t('settings.error')}</span>}
                          {provider.status === 'idle' && <span className="text-muted-foreground text-xs">{t('settings.notTested')}</span>}
                        </div>
                        <button
                          onClick={() => handleTestProvider(provider)}
                          disabled={testingProviderId === provider.id}
                          className="px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border/50 hover:border-primary transition-all disabled:opacity-50"
                        >
                          {testingProviderId === provider.id ? t('settings.testing') : t('settings.testConnection')}
                        </button>
                      </div>
                      {testResult && testResult.id === provider.id && (
                        <div className={`flex items-center gap-2 text-sm font-medium px-4 py-3 rounded-lg border ${
                          testResult.ok
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
                        }`}>
                          {testResult.ok ? <CheckCircle size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                          <span>{testResult.msg}</span>
                        </div>
                      )}
                    </div>
                  </section>
                ))}

                {/* Per-task Model Selection — Chat & Summary only */}
                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.aiTaskModels')}</h3>
                  <p className="text-sm text-muted-foreground">{t('settings.aiTaskModelsDesc')}</p>
                  <div className="bg-card p-5 rounded-xl border border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-muted-foreground mb-1">{t('settings.aiChat')}</label>
                        <select
                          value={aiChatModel}
                          onChange={(e) => setAiChatModel(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        >
                          <option value="auto">{t('settings.aiAuto')} ({t('settings.aiDefault')})</option>
                          {providers.map(p => (
                            <option key={p.id} value={p.id}>{p.label} — {p.modelName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-muted-foreground mb-1">{t('settings.aiSummary')}</label>
                        <select
                          value={aiSummaryModel}
                          onChange={(e) => setAiSummaryModel(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        >
                          <option value="auto">{t('settings.aiAuto')} ({t('settings.aiDefault')})</option>
                          {providers.map(p => (
                            <option key={p.id} value={p.id}>{p.label} — {p.modelName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Behavior Settings */}
                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.aiBehavior')}</h3>
                  <div className="bg-card p-5 rounded-xl border border-border/50 space-y-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">{t('settings.aiSystemPrompt')}</label>
                      <textarea
                        value={aiSystemPrompt}
                        onChange={(e) => setAiSystemPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-muted-foreground mb-1">
                          {t('settings.aiTemperature')}: {aiTemperature}
                        </label>
                        <p className="text-xs text-muted-foreground/70 mb-2">{t('settings.aiTemperatureDesc')}</p>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={aiTemperature}
                          onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{t('settings.aiPrecise')}</span>
                          <span>{t('settings.aiCreative')}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-muted-foreground mb-1">{t('settings.aiMaxTokens')}</label>
                        <input
                          type="number"
                          min="256"
                          max="8192"
                          step="256"
                          value={aiMaxTokens}
                          onChange={(e) => setAiMaxTokens(parseInt(e.target.value) || 2048)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* RAG Status */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.aiRagStatus')}</h3>
                    <button
                      onClick={async () => {
                        setIsReindexing(true);
                        try {
                          const res = await serverFetch('/api/notes/reindex', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}`, 'Content-Type': 'application/json' }
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setRagStats((prev: any) => ({ ...prev, total_notes: data.total_notes || prev?.total_notes }));
                          }
                        } catch (e) { console.error(e); }
                        finally { setIsReindexing(false); }
                      }}
                      disabled={isReindexing}
                      className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors flex items-center text-sm disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={`mr-1.5 ${isReindexing ? 'animate-spin' : ''}`} />
                      {isReindexing ? t('settings.reindexing') : t('settings.reindex')}
                    </button>
                  </div>
                  <div className="bg-card p-5 rounded-xl border border-border/50">
                    <div className="flex items-center justify-center space-x-8">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">{ragStats?.total_notes ?? '—'}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t('settings.aiTotalNotes')}</div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Test Playground */}
                <section className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.aiPlayground')}</h3>
                  <div className="bg-card p-5 rounded-xl border border-border/50 space-y-3">
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-2">
                      <TestTube size={14} />
                      <span>{t('settings.aiPlaygroundDesc')}</span>
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={testPrompt}
                        onChange={(e) => setTestPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTestAI()}
                        placeholder={t('settings.aiPlaygroundPlaceholder')}
                        className="flex-1 bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      />
                      <button
                        onClick={handleTestAI}
                        disabled={isTestingAI || !testPrompt.trim()}
                        className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center"
                      >
                        {isTestingAI ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                      </button>
                    </div>
                    {testResponse && (
                      <div className="bg-background border border-border/50 rounded-lg p-4 text-sm text-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {testResponse}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'bots' && (
              <section className="space-y-8">
                <div className="space-y-6">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.botConfig')}</h3>
                  
                  <div className="bg-card p-6 rounded-lg border border-border/50 space-y-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">{t('settings.botToken')}</label>
                      <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456789:ABCDEF..." className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">{t('settings.adminId')}</label>
                      <input type="text" value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder={t('settings.phAdminId')} className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                      <p className="text-[10px] text-muted-foreground mt-1">{t('settings.adminIdDesc')}</p>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">{t('settings.status')}:</span>
                        <span className={botStatus.status === 'connected' ? 'text-accent' : 'text-muted-foreground'}>
                          {botStatus.status === 'connected' ? t('settings.live') : t('settings.offline')}
                        </span>
                      </div>
                      <button onClick={handleTestBot} disabled={isTesting} className="px-6 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border/50 hover:border-primary transition-all">
                        {isTesting ? t('settings.testing') : t('settings.testBot')}
                      </button>
                    </div>
                  </div>
                </div>

                {currentUser?.role === 'admin' && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.allBots')}</h3>
                    <div className="space-y-3">
                      {allBots.map((bot, idx) => (
                        <div key={idx} className="bg-card p-4 rounded-lg border border-border/50 flex items-center space-x-4">
                          <div className="p-2 bg-secondary rounded-lg">
                            <MessageSquare size={20} className="text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-foreground font-medium">{bot.username}</div>
                            <div className="text-xs text-muted-foreground">{bot.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.proxy')}</h3>
                  <div className="bg-card p-6 rounded-lg border border-border/50 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-muted-foreground mb-1">{t('settings.protocol')}</label>
                        <select value={proxyConfig.protocol} onChange={(e) => setProxyConfig({ ...proxyConfig, protocol: e.target.value })} className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                          <option value="HTTP">HTTP</option>
                          <option value="HTTPS">HTTPS</option>
                          <option value="SOCKS4">SOCKS4</option>
                          <option value="SOCKS5">SOCKS5</option>
                        </select>
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs uppercase text-muted-foreground mb-1">{t('settings.host')}</label>
                        <input type="text" value={proxyConfig.host} onChange={(e) => setProxyConfig({ ...proxyConfig, host: e.target.value })} placeholder="127.0.0.1" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-muted-foreground mb-1">{t('settings.port')}</label>
                        <input type="text" value={proxyConfig.port} onChange={(e) => setProxyConfig({ ...proxyConfig, port: e.target.value })} placeholder="8080" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-muted-foreground mb-1">{t('settings.usernameOptional')}</label>
                        <div className="relative">
                          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input type="text" value={proxyConfig.username} onChange={(e) => setProxyConfig({ ...proxyConfig, username: e.target.value })} placeholder="user" className="w-full bg-background border border-border rounded-lg pl-9 p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-muted-foreground mb-1">{t('settings.passwordOptional')}</label>
                        <div className="relative">
                          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input type="password" value={proxyConfig.password} onChange={(e) => setProxyConfig({ ...proxyConfig, password: e.target.value })} placeholder="••••" className="w-full bg-background border border-border rounded-lg pl-9 p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button onClick={handleTestProxy} className="px-6 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border/50 hover:border-primary transition-all">
                        {t('settings.testProxy')}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'profile' && (
              <section className="space-y-6">
                <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.profile')}</h3>
                <div className="bg-card p-6 rounded-lg border border-border/50 space-y-4">
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                      {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{currentUser?.username}</div>
                      <div className="text-sm text-muted-foreground">{currentUser?.role === 'admin' ? t('settings.admin') : t('settings.user')}</div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">{t('settings.newPassword')}</label>
                    <input 
                      type="password" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      placeholder="••••••••" 
                      className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" 
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      if (!newPassword) return;
                      try {
                        await api.updateUser(currentUser.id, { password: newPassword });
                        alert(t('settings.passwordUpdated'));
                        setNewPassword('');
                      } catch (e) {
                        alert(t('settings.passwordUpdateFailed'));
                      }
                    }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    {t('settings.updatePassword')}
                  </button>
                </div>
              </section>
            )}

            {activeTab === 'users' && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.userManagement')}</h3>
                  <button onClick={() => { setEditingUser(null); setIsCreateUserOpen(true); }} className="flex items-center px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    <Plus size={16} className="mr-2" /> {t('settings.addUser')}
                  </button>
                </div>
                <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-secondary/50 text-muted-foreground text-sm">
                      <tr>
                        <th className="px-6 py-3 font-medium">{t('settings.username')}</th>
                        <th className="px-6 py-3 font-medium">{t('settings.role')}</th>
                        <th className="px-6 py-3 font-medium text-right">{t('settings.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {users.map(user => (
                        <tr key={user.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-6 py-4 text-foreground">{user.username}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button onClick={() => { setEditingUser(user); setIsCreateUserOpen(true); }} className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={async () => {
                                if (user.id === currentUser.id) return alert(t('settings.cannotDeleteSelf'));
                                if (confirm(t('settings.confirmDeleteUser'))) {
                                  await api.deleteUser(user.id);
                                  setUsers(users.filter(u => u.id !== user.id));
                                }
                              }}
                              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'logs' && (
              <section className="space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{t('settings.systemLogs')}</h3>
                  <button 
                    onClick={fetchLogs}
                    disabled={isLoadingLogs}
                    className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={isLoadingLogs ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className="flex-1 bg-black rounded-lg p-4 font-mono text-xs text-green-500 overflow-auto border border-border/50 min-h-[400px] scrollbar-thin">
                  {logs ? (
                    <pre className="whitespace-pre-wrap">{logs}</pre>
                  ) : (
                    <div className="text-muted-foreground italic">{isLoadingLogs ? 'Loading logs...' : 'No logs available'}</div>
                  )}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>

      <CreateUserModal 
        isOpen={isCreateUserOpen} 
        onClose={() => { setIsCreateUserOpen(false); setEditingUser(null); }} 
        onCreate={handleCreateUser}
        initialData={editingUser}
      />

      <AddDBModal
        isOpen={isAddDBOpen}
        onClose={() => setIsAddDBOpen(false)}
        onConnect={handleAddExternalDB}
      />
    </div>
  );
}
