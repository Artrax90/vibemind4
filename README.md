# VibeMind

Self-hosted AI-powered note-taking ecosystem with RAG, Telegram bot, desktop & mobile apps.

---

## English

### What is VibeMind?

VibeMind is a self-hosted note-taking platform with built-in AI assistant. It combines the power of local-first architecture with cloud sync, giving you full control over your data.

**Key features:**
- **AI-powered RAG** — ask questions about your notes, get instant answers with citations
- **Telegram bot** — create and manage notes via voice messages, set reminders
- **Desktop app (Windows)** — offline-first with local SQLite database
- **Mobile app (Android)** — works offline, syncs when connected
- **Canvas & Boards** — visual note-taking with shapes, arrows, and sticky notes
- **Calendar** — view notes and reminders by date
- **Bento Grid** — beautiful card-based note overview
- **Multi-user sharing** — share notes and folders with password protection
- **Publishing** — share notes via public links with expiration
- **Bilingual** — full English and Russian interface

### Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind CSS 4, TypeScript
- **Backend:** FastAPI (Python 3.11), PostgreSQL + pgvector, Redis
- **Desktop:** Electron 41 (Windows EXE)
- **Mobile:** Capacitor 8 (Android APK)
- **AI:** OpenAI, Google Gemini, OpenRouter, Ollama, Xiaomi MiMo
- **Bot:** Telegram Bot API (aiogram), Vosk STT

### Installation

#### Docker (Recommended)

```bash
git clone https://github.com/Artrax90/vibemind4.git
cd vibemind4
docker-compose up -d
```

Open http://localhost:3344 in your browser.

Default login: `admin` / `admin`

#### Desktop (Windows)

Download `VibeMind Desktop App Setup.exe` from [Releases](https://github.com/Artrax90/vibemind4/releases) and install.

#### Android

Download `VibeMind-Android.apk` from [Releases](https://github.com/Artrax90/vibemind4/releases) and install on your device.

### Configuration

1. Open Settings → **AI** tab
2. Select your AI provider (OpenAI, Gemini, MiMo, etc.)
3. Enter API key and select model
4. Click "Test Connection"
5. Done! Your AI assistant is ready.

For Telegram bot:
1. Open Settings → **My Bots** tab
2. Enter your Telegram Bot Token (from @BotFather)
3. Enter your Telegram User ID
4. Click "Test Bot"

---

## Русский

### Что такое VibeMind?

VibeMind — это самостойная платформа для заметок со встроенным ИИ-ассистентом. Она сочетает локальную архитектуру с облачной синхронизацией, давая вам полный контроль над данными.

**Основные возможности:**
- **ИИ с RAG** — задавайте вопросы по заметкам, получайте мгновенные ответы с источниками
- **Telegram-бот** — создавайте и управляйте заметками голосовыми сообщениями, ставьте напоминания
- **Десктоп-приложение (Windows)** — автономная работа с локальной БД SQLite
- **Мобильное приложение (Android)** — работает офлайн, синхронизируется при подключении
- **Canvas и Доски** — визуальные заметки с фигурами, стрелками и стикерами
- **Календарь** — просмотр заметок и напоминаний по датам
- **Bento-сетка** — красивый карточный обзор заметок
- **Мультипользователь** — делитесь заметками и папками с парольной защитой
- **Публикация** — делитесь заметками через публичные ссылки с ограничением по времени
- **Двуязычность** — полный интерфейс на русском и английском языках

### Технологии

- **Фронтенд:** React 19, Vite 6, Tailwind CSS 4, TypeScript
- **Бэкенд:** FastAPI (Python 3.11), PostgreSQL + pgvector, Redis
- **Десктоп:** Electron 41 (Windows EXE)
- **Мобайл:** Capacitor 8 (Android APK)
- **ИИ:** OpenAI, Google Gemini, OpenRouter, Ollama, Xiaomi MiMo
- **Бот:** Telegram Bot API (aiogram), Vosk STT

### Установка

#### Docker (Рекомендуется)

```bash
git clone https://github.com/Artrax90/vibemind4.git
cd vibemind4
docker-compose up -d
```

Откройте http://localhost:3344 в браузере.

Логин по умолчанию: `admin` / `admin`

#### Десктоп (Windows)

Скачайте `VibeMind Desktop App Setup.exe` из [Releases](https://github.com/Artrax90/vibemind4/releases) и установите.

#### Android

Скачайте `VibeMind-Android.apk` из [Releases](https://github.com/Artrax90/vibemind4/releases) и установите на устройство.

### Настройка

1. Откройте Настройки → вкладка **ИИ**
2. Выберите ИИ-провайдера (OpenAI, Gemini, MiMo и т.д.)
3. Введите API-ключ и выберите модель
4. Нажмите "Проверить подключение"
5. Готово! ИИ-ассистент готов к работе.

Для Telegram-бота:
1. Откройте Настройки → вкладка **Мои боты**
2. Введите токен Telegram-бота (от @BotFather)
3. Введите ваш Telegram User ID
4. Нажмите "Проверить бота"

---

## License

MIT
