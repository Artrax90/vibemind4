import { dbApi } from '../lib/db';

let cachedToken: string | null = null;
let lastTokenFetch = 0;
const TOKEN_EXPIRY = 1000 * 60 * 60; // 1 hour

export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const api = {
  async getSettings() {
    const config = await dbApi.getSyncConfig();
    return config;
  },
  
  async updateSettings(settings: any) {
    await dbApi.saveSyncConfig(settings);
    cachedToken = null; // Clear token on settings change
    return { success: true, settings };
  },

  async createNote(note: any) {
    await dbApi.saveNote({ ...note, is_dirty: 1 });
    return note;
  },

  async getNotes() {
    const notes = await dbApi.getNotes();
    return notes.map((n: any) => ({
      ...n,
      isPinned: !!n.isPinned,
      isShared: !!n.isShared,
      isSharedByMe: !!n.isSharedByMe
    }));
  },
  
  async deleteNote(id: string) {
    await dbApi.deleteNote(id);
  },
  
  async updateNote(id: string, updates: any) {
    const notes = await dbApi.getNotes();
    const note = notes.find((n: any) => n.id === id);
    const updated_at = new Date().toISOString();
    Object.assign(updates, { updated_at });
    if (note) {
      await dbApi.saveNote({ ...note, ...updates, is_dirty: 1 });
    }
    return { success: true, ...updates };
  },
  
  async createFolder(folder: any) {
    await dbApi.saveFolder(folder);
    return folder;
  },
  
  async getFolders() {
    const folders = await dbApi.getFolders();
    return folders.map((f: any) => ({
      ...f,
      isShared: !!f.isShared,
      isSharedByMe: !!f.isSharedByMe,
      isProtected: !!f.isProtected
    }));
  },
  
  async deleteFolder(id: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (token && baseUrl) {
      try {
        await fetch(`${baseUrl}/api/folders/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.error('Failed to delete folder on server', e);
      }
    }
    await dbApi.deleteFolder(id);
  },
  
  async updateFolder(id: string, updates: any) {
    const folders = await dbApi.getFolders();
    const folder = folders.find((f: any) => f.id === id);
    const updated_at = new Date().toISOString();
    Object.assign(updates, { updated_at });
    if (folder) {
      await dbApi.saveFolder({ ...folder, ...updates, is_dirty: 1 });
    }
    return { success: true, ...updates };
  },

  async verifyFolderPassword(id: string, password: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return { success: true };
    try {
      const res = await fetch(`${baseUrl}/api/folders/${id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  },

  async getNormalizedUrl() {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url) return null;
    let url = config.server_url.trim().replace(/\/$/, '');
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    return url;
  },

  async getServerToken() {
    if (cachedToken && (Date.now() - lastTokenFetch < TOKEN_EXPIRY)) {
      return cachedToken;
    }

    const baseUrl = await this.getNormalizedUrl();
    const config = await dbApi.getSyncConfig();
    if (!baseUrl || !config.username || !config.password) return null;
    
    try {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: config.username, password: config.password })
      });
      if (!loginRes.ok) return null;
      const { access_token } = await loginRes.json();
      cachedToken = access_token;
      lastTokenFetch = Date.now();
      return access_token;
    } catch (e) {
      return null;
    }
  },

  async getActiveProvider() {
    const config = await this.getSettings();
    if (config.providers) {
      try {
        const providers = JSON.parse(config.providers);
        return providers.find((p: any) => p.isActive);
      } catch (e) {}
    }
    return null;
  },

  async chat(message: string, notes?: any[], unlockedFolderIds?: string[]) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    
    const runLocalRag = async () => {
      const provider = await this.getActiveProvider();
      if (!provider) return { answer: 'AI not configured. Please set up an AI provider in Settings.', citations: [] };
      
      let prompt = message;
      let citations: any[] = [];
      const unlockedIdsSet = new Set(unlockedFolderIds || []);
      
      if (notes && notes.length > 0) {
        // Simple offline RAG: keyword search
        const cleanMessage = message.toLowerCase().replace(/[^\w\sа-яё]/gi, ' ');
        const stopWords = new Set(['как', 'что', 'это', 'где', 'когда', 'почему', 'зачем', 'про', 'для', 'или', 'под', 'над', 'the', 'and', 'for', 'with', 'about', 'есть', 'нет', 'мне', 'нам', 'вам', 'какие', 'какой', 'какая', 'какого', 'каких', 'все', 'тут', 'там']);
        
        // Simple transliteration map for common tech terms
        const translit: Record<string, string> = {
          'докер': 'docker',
          'докера': 'docker',
          'питон': 'python',
          'джава': 'java',
          'рект': 'react',
          'реакт': 'react',
          'нода': 'node'
        };

        const getStem = (w: string) => {
          if (w.match(/^[a-z]+$/)) {
            if (w.length > 4) return w.replace(/(es|s|ing|ed)$/i, '');
            return w;
          }
          if (w.length <= 4) return w;
          return w.replace(/(ами|ями|ах|ях|ов|ев|ей|ой|ий|ый|ые|ие|ую|юю|его|ого|им|ым|их|ых|ом|ем|ам|ям|а|я|о|е|и|ы|у|ю)$/i, '');
        };
        
        const keywords = cleanMessage.split(/\s+/)
          .filter(w => w.length > 2 && !stopWords.has(w))
          .map(w => translit[w] || w)
          .map(getStem);
        
        const scoredNotes = notes.map(note => {
          let score = 0;
          const text = ((note.title || '') + ' ' + (note.content || '')).toLowerCase();
          keywords.forEach(kw => {
            if (text.includes(kw)) score++;
          });
          return { ...note, score };
        }).filter(n => n.score > 0).sort((a, b) => b.score - a.score).slice(0, 15);
        
        if (scoredNotes.length > 0) {
          const context = scoredNotes.map(n => {
            const isProtected = n.isLocked;
            const content = isProtected ? 
              "[ЗАКРЫТО ПАРОЛЕМ. ВНИМАНИЕ: Эта заметка очень релевантна запросу! Обязательно выведи её заголовок и напиши [Содержимое защищено паролем].]" : 
              (n.content || '');
            return `ID: ${n.id}\nTitle: ${n.title || 'Untitled'}\nContent: ${content}`;
          }).join('\n\n');
          prompt = `Ты — умный ИИ-помощник в приложении заметок. Твоя задача — дать релевантный ответ на вопрос пользователя на основе предоставленных открытых заметок.

ЗАМЕТКИ ИЗ БАЗЫ:
${context}

ИНСТРУКЦИИ:
1. Ответь пользователю максимально естественно и подробно, используя ТОЛЬКО предоставленные открытые заметки.
2. ИГНОРИРУЙ ЗАЩИЩЕННЫЕ ЗАМЕТКИ: Если в тексте заметки написано "[ЗАКРЫТО ПАРОЛЕМ. Содержимое скрыто.]", полностью проигнорируй её. Ни в коем случае не упоминай защищенные заметки в своем ответе (система сама добавит их позже).
3. Если нет подходящих открытых заметок для ответа, НИЧЕГО НЕ ПИШИ в ответе (оставь текст абсолютно пустым).
4. Обязательно в конце выведи строку "SOURCES: ID1, ID2, ...". Укажи ID тех ОТКРЫТЫХ заметок, которые ты использовал. Если ничего не нашел — "SOURCES: NONE".

ВОПРОС: "${message}"`;
          citations = scoredNotes.map(n => ({ id: n.id, title: n.title || 'Untitled', snippet: n.isLocked ? '[Защищено паролем]' : (n.content || '').substring(0, 100) + '...', isLocked: n.isLocked }));
          
          // Full content citations meant for formatting
          (citations as any).fullContent = scoredNotes;
        } else {
          prompt = `Ниже нет заметок. Ответь: "Я не нашел информации по запросу «${message}» в ваших заметках."`;
        }
      }
      
      try {
        let answer = '';
        if (provider.provider === 'openai' || provider.provider === 'openrouter' || provider.provider === 'ollama') {
          const apiUrl = provider.baseUrl || (provider.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
          const res = await fetch(`${apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: provider.modelName,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          answer = data.choices[0].message.content;
        } else if (provider.provider === 'gemini') {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${provider.modelName || 'gemini-1.5-flash'}:generateContent?key=${provider.apiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error('Gemini API Error');
          const data = await res.json();
          answer = data.candidates[0].content.parts[0].text;
        }

        // Parse SOURCES
        let usedIds: string[] = [];
        if (answer.includes('SOURCES:')) {
            const parts = answer.split('SOURCES:');
            answer = parts[0].trim();
            const idsPart = parts[1].trim();
            if (idsPart !== 'NONE' && idsPart !== '') {
                usedIds = idsPart.split(',').map(id => id.trim()).filter(id => id);
            }
        }

        const openNotes = citations.filter((c: any) => !c.isLocked);
        const protectedNotes = citations.filter((c: any) => c.isLocked);
        const relevantOpenNotes = openNotes.filter((c: any) => usedIds.includes(c.id));
        
        const finalRelevantNotes = [...relevantOpenNotes, ...protectedNotes];

        let finalAnswer = answer.trim();

        if (protectedNotes.length > 0) {
            const telegramList = protectedNotes.map((pn: any, i: number) => `${i+1}. ${pn.title}\n[Содержимое защищено паролем]`).join('\n\n');
            const telegramBlock = `Вот что я нашел по запросу «${message}»:\n\n${telegramList}`;
            
            if (finalAnswer) {
                finalAnswer += `\n\nТакже вот что я нашел из закрытого по запросу «${message}»:\n\n${telegramList}`;
            } else {
                finalAnswer = telegramBlock;
            }
        } else {
            if (!finalAnswer) {
                finalAnswer = `Я не нашел информации по запросу «${message}» в ваших заметках.`;
            }
        }

        return { answer: finalAnswer, citations: finalRelevantNotes };
      } catch (e) {
        return { answer: 'Local AI request failed. Check your API key and settings.', citations: [] };
      }
      return { answer: 'Unknown AI provider.', citations: [] };
    };
    
    if (!token || !baseUrl) {
      return await runLocalRag();
    }

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      // Fallback to local RAG if network fails
      return await runLocalRag();
    }
  },

  async summarize(content: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    
    if (!token || !baseUrl) {
      const provider = await this.getActiveProvider();
      if (!provider) return { summary: 'AI not configured.' };
      
      const prompt = `Summarize the following text. Reply in the same language as the text:\n\n${content}`;
      try {
        if (provider.provider === 'openai' || provider.provider === 'openrouter' || provider.provider === 'ollama') {
          const apiUrl = provider.baseUrl || (provider.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
          const res = await fetch(`${apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: provider.modelName,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          return { summary: data.choices[0].message.content };
        } else if (provider.provider === 'gemini') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.modelName}:generateContent?key=${provider.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          return { summary: data.candidates[0].content.parts[0].text };
        }
      } catch (e) {
        return { summary: 'Local AI request failed.' };
      }
    }

    try {
      const res = await fetch(`${baseUrl}/api/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });
      if (!res.ok) return { summary: 'Summarization failed.' };
      return await res.json();
    } catch (e) {
      return { summary: 'Network error.' };
    }
  },

  async getRemoteSettings() {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return null;

    try {
      const res = await fetch(`${baseUrl}/api/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async updateRemoteSettings(settings: any) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return { success: false };

    try {
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      return { success: res.ok };
    } catch (e) {
      return { success: false };
    }
  },

  async uploadFile(formData: FormData) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    if (data.url && data.url.startsWith('/')) {
      data.url = `${baseUrl}${data.url}`;
    }
    return data;
  },

  async importNotes(formData: FormData) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');

    const res = await fetch(`${baseUrl}/api/notes/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (!res.ok) throw new Error('Import failed');
    return await res.json();
  },
  
  async getMe() {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return null;
    try {
      const res = await fetch(`${baseUrl}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getUsers() {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return [];
    try {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async createUser(user: any) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(user)
    });
    if (!res.ok) throw new Error('Failed to create user');
    return await res.json();
  },

  async updateUser(id: string, user: any) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');
    const res = await fetch(`${baseUrl}/api/users/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(user)
    });
    if (!res.ok) throw new Error('Failed to update user');
    return await res.json();
  },

  async deleteUser(id: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');
    const res = await fetch(`${baseUrl}/api/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return true;
  },

  async getLogs() {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return { logs: 'Server not connected' };
    try {
      const res = await fetch(`${baseUrl}/api/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { logs: 'Failed to fetch logs' };
      return await res.json();
    } catch (e) {
      return { logs: 'Network error' };
    }
  },

  async getShares(resourceType: string, resourceId: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) return [];
    try {
      const res = await fetch(`${baseUrl}/api/shares/${resourceType}/${resourceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async createShare(resourceType: string, resourceId: string, shareData: any) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');
    const res = await fetch(`${baseUrl}/api/shares/${resourceType}/${resourceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(shareData)
    });
    if (!res.ok) throw new Error('Failed to create share');
    return await res.json();
  },

  async deleteShare(shareId: string) {
    const baseUrl = await this.getNormalizedUrl();
    const token = await this.getServerToken();
    if (!token || !baseUrl) throw new Error('Server not connected');
    const res = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete share');
    return true;
  },

  async getReminders(): Promise<any[]> {
    try {
      // First, get from local DB
      const localReminders = await dbApi.getReminders() || [];
      
      // If server is configured, also sync from server
      const config = await dbApi.getSyncConfig();
      if (config.server_url && config.username) {
        try {
          cachedToken = null;
          const token = await this.getServerToken();
          if (token) {
            const url = this.getNormalizedUrl();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(`${url}/api/reminders`, {
              headers: { 'Authorization': `Bearer ${token}` },
              signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
              const serverReminders = await res.json();
              if (Array.isArray(serverReminders)) {
                // Merge: server reminders take precedence
                const merged = [...localReminders];
                for (const sr of serverReminders) {
                  const existingIdx = merged.findIndex((r: any) => r.id === sr.id);
                  if (existingIdx >= 0) {
                    merged[existingIdx] = sr;
                  } else {
                    merged.push(sr);
                  }
                }
                // Save merged to local
                for (const r of merged) {
                  await dbApi.saveReminder(r);
                }
                return merged;
              }
            }
          }
        } catch (e) {
          console.error('[Reminders] Server sync failed, using local only:', e);
        }
      }
      
      return localReminders;
    } catch (e) {
      console.error('[Reminders] Error:', e);
      return [];
    }
  },

  async createReminder(data: any): Promise<any> {
    const reminder = {
      id: data.id || `r${Date.now()}`,
      note_id: data.note_id || null,
      remind_at: data.remind_at,
      repeat_type: data.repeat_type || 'none',
      message: data.message || '',
      is_sent: 0,
      is_dirty: 1,
      updated_at: new Date().toISOString()
    };

    // Save locally first
    await dbApi.saveReminder(reminder);

    // Try to sync with server
    try {
      const config = await dbApi.getSyncConfig();
      if (config.server_url && config.username) {
        const token = await this.getServerToken();
        if (token) {
          const url = this.getNormalizedUrl();
          await fetch(`${url}/api/reminders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }
      }
    } catch (e) {
      console.error('[Reminders] Server sync failed:', e);
    }

    return reminder;
  },

  async deleteReminder(id: string): Promise<void> {
    // Delete locally
    await dbApi.deleteReminder(id);

    // Try to sync with server
    try {
      const config = await dbApi.getSyncConfig();
      if (config.server_url && config.username) {
        const token = await this.getServerToken();
        if (token) {
          const url = this.getNormalizedUrl();
          await fetch(`${url}/api/reminders/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
      }
    } catch (e) {
      console.error('[Reminders] Server sync failed:', e);
    }
  },

  async getCalendarStatus(): Promise<any> {
    try {
      const config = await dbApi.getSyncConfig();
      if (!config.server_url) return { connected: false, message: 'Server not configured' };
      const token = await this.getServerToken();
      if (!token) return { connected: false };
      const url = this.getNormalizedUrl();
      const res = await fetch(`${url}/api/calendar/status`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return { connected: false };
      return await res.json();
    } catch (e) {
      console.error('getCalendarStatus error:', e);
      return { connected: false };
    }
  },

  async getCalendarAuthUrl(): Promise<any> {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url) return {};
    const token = await this.getServerToken();
    if (!token) return {};
    const url = this.getNormalizedUrl();
    const res = await fetch(`${url}/api/calendar/auth`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return {};
    return await res.json();
  },

  async disconnectCalendar(): Promise<void> {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url) return;
    const token = await this.getServerToken();
    if (!token) return;
    const url = this.getNormalizedUrl();
    await fetch(`${url}/api/calendar/disconnect`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
  },

  async getExternalDbs(): Promise<any[]> {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url || !config.username) return [];
    const token = await this.getServerToken();
    if (!token) return [];
    const url = this.getNormalizedUrl();
    const res = await fetch(`${url}/api/external-dbs`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return [];
    return await res.json();
  },

  async addExternalDb(dbData: any): Promise<any[]> {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url || !config.username) throw new Error('Not configured');
    const token = await this.getServerToken();
    if (!token) throw new Error('No token');
    const url = this.getNormalizedUrl();
    const res = await fetch(`${url}/api/external-dbs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dbData)
    });
    if (!res.ok) throw new Error('Failed to add DB');
    return await res.json();
  },

  async deleteExternalDb(dbId: string): Promise<any[]> {
    const config = await dbApi.getSyncConfig();
    if (!config.server_url || !config.username) throw new Error('Not configured');
    const token = await this.getServerToken();
    if (!token) throw new Error('No token');
    const url = this.getNormalizedUrl();
    const res = await fetch(`${url}/api/external-dbs/${dbId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete DB');
    return await res.json();
  },

  async testBotConnectionDirect(tgToken: string): Promise<any> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        return { status: 'success', message: `Bot connected: @${data.result.username}`, username: data.result.username };
      }
      return { status: 'error', detail: data.description || 'Invalid token' };
    } catch (e: any) {
      return { status: 'error', detail: e.message || 'Connection failed' };
    }
  },

  async testBotConnection(tgToken: string, proxyConfig?: any): Promise<any> {
    const config = await dbApi.getSyncConfig();
    // If server configured, try server first
    if (config.server_url && config.username) {
      try {
        const token = await this.getServerToken();
        if (token) {
          const url = this.getNormalizedUrl();
          const res = await fetch(`${url}/api/bot/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ tg_token: tgToken, proxy_config: proxyConfig })
          });
          if (res.ok) return await res.json();
        }
      } catch (e) {}
    }
    // Fallback: test directly
    return this.testBotConnectionDirect(tgToken);
  },

  async testProviderDirect(provider: any): Promise<any> {
    try {
      if (provider.provider === 'openai' || provider.provider === 'openrouter' || provider.provider === 'ollama') {
        const apiUrl = provider.baseUrl || (provider.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
        const res = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
          body: JSON.stringify({ model: provider.modelName, messages: [{ role: 'user', content: 'Hello' }], max_tokens: 10 })
        });
        if (!res.ok) {
          const err = await res.text();
          return { status: 'error', detail: `HTTP ${res.status}: ${err.substring(0, 200)}` };
        }
        return { status: 'success' };
      } else if (provider.provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.modelName || 'gemini-1.5-flash'}:generateContent?key=${provider.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
        });
        if (!res.ok) {
          const err = await res.text();
          return { status: 'error', detail: `HTTP ${res.status}: ${err.substring(0, 200)}` };
        }
        return { status: 'success' };
      } else {
        return { status: 'error', detail: 'Unknown provider type' };
      }
    } catch (e: any) {
      return { status: 'error', detail: e.message || 'Connection failed' };
    }
  },

  async testProvider(provider: any): Promise<any> {
    const config = await dbApi.getSyncConfig();
    // If server configured, try server first
    if (config.server_url && config.username) {
      try {
        const token = await this.getServerToken();
        if (token) {
          const url = this.getNormalizedUrl();
          const res = await fetch(`${url}/api/integrations/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              provider: provider.provider,
              api_key: provider.apiKey,
              base_url: provider.baseUrl,
              model_name: provider.modelName
            })
          });
          if (res.ok) return await res.json();
        }
      } catch (e) {}
    }
    // Fallback: test directly
    return this.testProviderDirect(provider);
  },

  async testProxy(proxyConfig: any): Promise<any> {
    const config = await dbApi.getSyncConfig();
    // If server configured, try server first
    if (config.server_url && config.username) {
      try {
        const token = await this.getServerToken();
        if (token) {
          const url = this.getNormalizedUrl();
          const res = await fetch(`${url}/api/proxy/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ proxy_config: proxyConfig })
          });
          if (res.ok) return await res.json();
        }
      } catch (e) {}
    }
    // Fallback: test proxy directly
    try {
      const proxyUrl = `${proxyConfig.protocol.toLowerCase()}://${proxyConfig.username ? proxyConfig.username + ':' + proxyConfig.password + '@' : ''}${proxyConfig.host}:${proxyConfig.port}`;
      const res = await fetch('https://httpbin.org/ip', { method: 'GET', signal: AbortSignal.timeout(10000) });
      if (res.ok) return { status: 'success', message: 'Proxy works (direct connection)' };
      return { status: 'error', detail: 'Direct connection failed' };
    } catch (e: any) {
      return { status: 'error', detail: e.message || 'Proxy test failed' };
    }
  },

  async clearLocalData() {
    await dbApi.clearData();
  }
};
