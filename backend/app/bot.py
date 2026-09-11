import asyncio
import logging
import traceback
import ast
import os
import uuid
import re
import json
import difflib
import html
import io
import base64
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from jose import jwt
from aiogram import Bot, Dispatcher, Router, types, F
from aiogram.filters import Command
from aiogram.types import FSInputFile
from aiogram.client.session.aiohttp import AiohttpSession
import aiohttp
import subprocess
from wyoming.asr import Transcribe, Transcript
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.event import async_read_event, async_write_event
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from .models import Config, User
from .utils.numbers import words_to_digits

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# JWT Settings (must match main.py)
SECRET_KEY = os.getenv("ENCRYPTION_KEY", "fallback-secret-key")
ALGORITHM = "HS256"

# Storage paths
BASE_DIR = os.getcwd()
STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(BASE_DIR, "storage"))
UPLOAD_DIR = os.path.join(STORAGE_DIR, "uploads")
TEMP_DIR = os.path.join(STORAGE_DIR, "temp")
API_BASE_URL = os.getenv("API_BASE_URL", f"http://127.0.0.1:{os.getenv('PORT', '3344')}").rstrip('/')

SYSTEM_PROMPT = """Ты — интеллектуальный парсер голосовых команд для заметок.
Возвращаешь только JSON.

---
# 📌 ТИПЫ
* CREATE
* UPDATE
* SEARCH

---
# 🧠 ВХОД
* text (команда пользователя)
* notes (массив заметок)

---
# ❗ КРИТИЧЕСКИЕ ПРАВИЛА
## 1. 🚫 ЗАПРЕЩЕНО ДУБЛИРОВАТЬ TITLE В CONTENT
При CREATE:
❌ НЕЛЬЗЯ:
"content": "фильмы"
✅ ВСЕГДА:
"content": ""

## 2. 🔥 SEARCH — ТОЛЬКО ЛУЧШИЕ РЕЗУЛЬТАТЫ
Ты НЕ возвращаешь всё подряд.
Правила:
* максимум 3 результата
* только реально релевантные
* если найден 1 идеальный → вернуть только 1
* если слабое совпадение → НЕ возвращать

---
# 🧠 ШАГ 1. НОРМАЛИЗАЦИЯ
## УДАЛИ МУСОР:
* заметку, заметка
* в неё, неё, нее, не неё, не нее
* добавь в, добавь туда
* что-то, что то, про, пожалуйста

## ОЧИСТИ append:
"неё форсаж" → "форсаж"
"в шашлык маринад мясо" → "маринад мясо"

## ИСПРАВЬ ПАДЕЖИ:
* покупке → покупки
* машиной → машины

## УДАЛИ ДУБЛИ:
"покупки молоко" → "молоко"

---
# 🧠 ШАГ 2. ТИП
* создай → CREATE
* добавь → UPDATE
* найди → SEARCH

---
# 🧠 ШАГ 3. CREATE
Название = очищенная сущность
{
  "type": "CREATE",
  "title": "<title>",
  "content": ""
}

---
# 🧠 ШАГ 4. UPDATE
1. Найди заметку по:
* точному совпадению
* затем по смыслу

## ЕСЛИ НАШЁЛ:
{
  "type": "UPDATE",
  "note_id": "<id>",
  "append": "<чистый текст>"
}

## ЕСЛИ НЕ НАШЁЛ:
👉 ОБЯЗАТЕЛЬНО СОЗДАЙ
[
  {
    "type": "CREATE",
    "title": "<title>",
    "content": ""
  },
  {
    "type": "UPDATE",
    "append": "<текст>"
  }
]

❗ ВАЖНО: НИКОГДА НЕ СОЗДАВАЙ ЗАМЕТКУ, ЕСЛИ ОНА УЖЕ СУЩЕСТВУЕТ В МАССИВЕ NOTES! 
Если пользователь говорит "добавь заметку фильмы рубли" (или "создай заметку фильмы рубли"), и в `notes` УЖЕ есть заметка с названием "фильмы" — ты ОБЯЗАН вернуть ТОЛЬКО один `UPDATE` с `note_id` этой заметки. Никаких `CREATE` для существующих названий!

---
# 🧠 ШАГ 5. SEARCH
1. Очисти запрос:
"найди что-то про шашлык" → "шашлык"

2. Отфильтруй заметки:
* оставь только релевантные
* максимум 3
* сортируй по релевантности

## ФОРМАТ:
{
  "type": "SEARCH",
  "query": "<запрос>"
}

---
# 🧪 ПРИМЕРЫ
## CREATE
"создай заметку фильмы"
→
{
  "type": "CREATE",
  "title": "фильмы",
  "content": ""
}

## UPDATE
"добавь фильмы форсаж"
→
{
  "type": "UPDATE",
  "note_id": "1",
  "append": "форсаж"
}

## CREATE + UPDATE
"добавь музыка рок"
→
[
  {
    "type": "CREATE",
    "title": "музыка",
    "content": ""
  },
  {
    "type": "UPDATE",
    "append": "рок"
  }
]

## SEARCH (важно)
notes:
* кисель рецепт
* фильмы
* покупки
"найди что-то про кисель"
→
{
  "type": "SEARCH",
  "query": "кисель"
}
(вернётся только релевантное, не всё подряд)

Всегда возвращай только JSON."""

# Глобальные переменные для управления ботами
current_bots: Dict[int, Bot] = {}
bot_tasks: Dict[int, asyncio.Task] = {}
token_to_user: Dict[str, int] = {} # token -> user_id
user_usernames: Dict[int, str] = {}
user_chat_ids: Dict[int, str] = {} # user_id -> telegram chat_id
bot_locks: Dict[int, asyncio.Lock] = {} # Lock per user
awaiting_passwords: Dict[str, Dict[str, Any]] = {} # chat_id -> {user_id: int, note_id: str}
# Bot routers and dispatchers are created per-instance in start_bot via create_bot_router()

async def record_user_chat_id(user_id: int, chat_id: int):
    """Save user's Telegram chat_id in memory and auto-populate tg_admin_id in DB if not set."""
    if not user_id or not chat_id:
        return
    str_chat_id = str(chat_id)
    user_chat_ids[user_id] = str_chat_id
    try:
        db = SessionLocal()
        try:
            config = db.query(Config).filter(Config.user_id == user_id).first()
            if config and config.tg_admin_id != str_chat_id:
                config.tg_admin_id = str_chat_id
                db.commit()
                logger.info(f"Updated tg_admin_id={str_chat_id} for user {user_id}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error auto-recording tg_admin_id for user {user_id}: {e}")

def get_db_session():
    """Получение сессии БД"""
    try:
        from .main import SessionLocal as MainSessionLocal
        return MainSessionLocal()
    except Exception:
        pass
    try:
        from backend.database import SessionLocal as DbSessionLocal
        return DbSessionLocal()
    except Exception:
        pass
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    db_url = os.getenv("DATABASE_URL", "sqlite:////app/storage/vibemind.db")
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False} if "sqlite" in db_url else {},
        pool_pre_ping=True
    )
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()

def SessionLocal():
    return get_db_session()

def get_user_lock(user_id: int) -> asyncio.Lock:
    if user_id not in bot_locks:
        bot_locks[user_id] = asyncio.Lock()
    return bot_locks[user_id]

async def get_user_token(user_id: int) -> str:
    """Генерация JWT токена для пользователя"""
    username = user_usernames.get(user_id, "admin")
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode = {"sub": username, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def parse_commands_llm(user_id: int, text: str, notes: list[dict] = None) -> list[dict]:
    if notes is None:
        notes = []
        
    config = None
    db = None
    try:
        db = SessionLocal()
        config = db.query(Config).filter(Config.user_id == user_id).first()
    except Exception as e:
        logger.error(f"Error querying config for user {user_id}: {e}")
    finally:
        if db:
            try: db.close()
            except Exception: pass
            
    api_key = config.api_key if config else os.getenv("OPENAI_API_KEY")
    provider = config.llm_provider if config else "openai"
    model = config.model_name or ("gemini-1.5-flash" if provider == "gemini" else "gpt-4o-mini")
    
    # If provider is openai but no key, or if we want to force gemini in this environment
    if provider == "openai" and not api_key:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            provider = "gemini"
            api_key = gemini_key
            model = "gemini-1.5-flash"
    
    if not api_key and provider != "gemini": # Gemini might use env key
        logger.warning("API key not found, falling back to regex parser")
        return parse_commands(text, notes)
            
    try:
        user_content = f"notes:\n{json.dumps(notes, ensure_ascii=False)}\n\n\"{text}\""
        content = ""

        async def try_parse(p, k, m, base_url=None, proxy_url=None):
            if p == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={k}"
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "contents": [{"parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_content}"}]}],
                        "generationConfig": {"temperature": 0.0}
                    }
                    async with session.post(url, json=payload, timeout=30) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            candidates = data.get('candidates', [])
                            if candidates and 'content' in candidates[0] and 'parts' in candidates[0]['content'] and candidates[0]['content']['parts']:
                                return candidates[0]['content']['parts'][0].get('text', '')
                            raise Exception("Gemini returned empty candidate response")
                        else:
                            resp_text = await resp.text()
                            raise Exception(f"Gemini error: {resp_text}")
            else:
                kwargs = {"api_key": k}
                if base_url:
                    kwargs["base_url"] = base_url
                
                http_client = None
                if proxy_url:
                    import httpx
                    http_client = httpx.AsyncClient(proxy=proxy_url)
                    kwargs["http_client"] = http_client
                
                try:
                    async with AsyncOpenAI(**kwargs) as client:
                        response = await client.chat.completions.create(
                            model=m,
                            messages=[
                                {"role": "system", "content": SYSTEM_PROMPT},
                                {"role": "user", "content": user_content}
                            ],
                            temperature=0.0
                        )
                        return response.choices[0].message.content.strip()
                finally:
                    if http_client:
                        await http_client.aclose()

        try:
            final_proxy_url = None
            if config:
                if config.proxy_url and (config.proxy_url.startswith("http") or config.proxy_url.startswith("socks")):
                    final_proxy_url = config.proxy_url
                elif config.proxy_config and isinstance(config.proxy_config, dict) and config.proxy_config.get("host"):
                    p = config.proxy_config
                    final_proxy_url = f"{p.get('protocol', 'http').lower()}://{p.get('username')}:{p.get('password')}@{p['host']}:{p['port']}" if p.get('username') else f"{p.get('protocol', 'http').lower()}://{p['host']}:{p['port']}"

            content = await try_parse(provider, api_key, model, config.base_url if config else None, final_proxy_url)
        except Exception as e:
            if provider == "openai" and ("403" in str(e) or "unsupported_country" in str(e)):
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    logger.info("OpenAI failed with 403, trying Gemini fallback")
                    content = await try_parse("gemini", gemini_key, "gemini-1.5-flash")
                else:
                    raise e
            else:
                raise e
        
        # Robustly extract JSON block
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
        if json_match:
            raw_json = json_match.group(1).strip()
        else:
            bracket_match = re.search(r'(\[[\s\S]*\]|\{[\s\S]*\})', content)
            if bracket_match:
                raw_json = bracket_match.group(1).strip()
            else:
                raw_json = content.strip()
            
        parsed = json.loads(raw_json)
        if isinstance(parsed, dict):
            return [parsed]
        elif isinstance(parsed, list):
            return parsed
        return []
    except Exception as e:
        logger.error(f"LLM Parsing error: {e}")
        return parse_commands(text, notes)

def russian_stem(word: str) -> str:
    word = word.lower().strip(" \t\n\r.,!?:;\"'«»()")
    if len(word) <= 3:
        return word
    endings = [
        'ами', 'ями', 'ов', 'ев', 'ей', 'ам', 'ям', 'ах', 'ях', 
        'ом', 'ем', 'ой', 'ей', 'ие', 'ые', 'ого', 'его', 'ому', 
        'ему', 'ым', 'им', 'ую', 'юю', 'ая', 'яя', 'ое', 'ее', 
        'ых', 'их', 'ы', 'и', 'а', 'я', 'у', 'ю', 'о', 'е', 'ь'
    ]
    for end in endings:
        if word.endswith(end) and len(word) - len(end) >= 3:
            return word[:-len(end)]
    return word

def words_stem_match(w1: str, w2: str) -> bool:
    w1 = w1.lower().strip(" \t\n\r.,!?:;\"'«»()")
    w2 = w2.lower().strip(" \t\n\r.,!?:;\"'«»()")
    if not w1 or not w2:
        return False
    if w1 == w2:
        return True
    if russian_stem(w1) == russian_stem(w2):
        return True
    if len(w1) >= 4 and len(w2) >= 4:
        if difflib.SequenceMatcher(None, w1, w2).ratio() >= 0.8:
            return True
    return False

def find_matching_note(cleaned: str, notes: list[dict] = None) -> tuple[Optional[dict], Optional[str]]:
    """
    Find matching note from existing notes and extract remaining append text.
    Returns (matched_note, append_text) or (None, None).
    """
    if not notes or not cleaned:
        return None, None

    cleaned_words = [w.strip(" \t\n\r.,!?:;\"'«»()") for w in cleaned.split() if w.strip(" \t\n\r.,!?:;\"'«»()")]
    if not cleaned_words:
        return None, None

    # 1. Check if sentence has " ... в/на/к <note_title>" pattern (e.g. "игра престолов в сериалы")
    end_match = re.search(r'^(.*?)\s+(?:в|на|к)\s+(?:заметку\s+)?(.+)$', cleaned, re.IGNORECASE)
    if end_match:
        content_candidate = end_match.group(1).strip()
        title_candidate = end_match.group(2).strip()
        title_words = [w.strip(" \t\n\r.,!?:;\"'«»()") for w in title_candidate.split() if w.strip(" \t\n\r.,!?:;\"'«»()")]
        for note in notes:
            n_title = note.get("title", "").strip()
            if not n_title: continue
            n_words = [w.strip(" \t\n\r.,!?:;\"'«»()") for w in n_title.split() if w.strip(" \t\n\r.,!?:;\"'«»()")]
            if len(title_words) == len(n_words) and all(words_stem_match(tw, nw) for tw, nw in zip(title_words, n_words)):
                content_clean = re.sub(r'^[.,!?:;\s]+|[.,!?:;\s]+$', '', content_candidate)
                return note, content_clean

    # 2. Check if text starts with note title (e.g. "сериала игра престолов", "список покупок молоко")
    sorted_notes = sorted(notes, key=lambda n: len(n.get("title", "").split()), reverse=True)

    for note in sorted_notes:
        n_title = note.get("title", "").strip()
        if not n_title: continue
        n_words = [w.strip(" \t\n\r.,!?:;\"'«»()") for w in n_title.split() if w.strip(" \t\n\r.,!?:;\"'«»()")]
        n_len = len(n_words)

        if len(cleaned_words) >= n_len:
            prefix_words = cleaned_words[:n_len]
            if all(words_stem_match(pw, nw) for pw, nw in zip(prefix_words, n_words)):
                raw_words = cleaned.split()
                append_text = " ".join(raw_words[n_len:]).strip()
                append_text = re.sub(r'^[.,!?:;\s]+|[.,!?:;\s]+$', '', append_text)
                return note, append_text

    # 3. Fuzzy match single-word titles
    best_note = None
    best_append = None
    best_score = 0
    for note in notes:
        n_title = note.get("title", "").strip()
        if not n_title: continue
        n_words = [w.strip(" \t\n\r.,!?:;\"'«»()") for w in n_title.split() if w.strip(" \t\n\r.,!?:;\"'«»()")]
        if len(n_words) == 1 and len(cleaned_words) >= 1:
            ratio = difflib.SequenceMatcher(None, russian_stem(cleaned_words[0]), russian_stem(n_words[0])).ratio()
            if ratio > 0.75 and ratio > best_score:
                best_score = ratio
                best_note = note
                raw_words = cleaned.split()
                append_text = " ".join(raw_words[1:]).strip()
                best_append = re.sub(r'^[.,!?:;\s]+|[.,!?:;\s]+$', '', append_text)

    if best_note:
        return best_note, best_append

    return None, None

def normalize_intent(text: str) -> str:
    if not text:
        return text

    # Handle inverted phrasing: "в (заметку) X добавь/запиши Y" -> "добавь в X Y"
    v_match = re.match(r'^в\s+(?:заметку\s+)?([^\s]+)\s+(?:добавь|добавьте|запиши|записать|допиши|дописать)\s+(.*)$', text, re.IGNORECASE)
    if v_match:
        return f"добавь в {v_match.group(1)} {v_match.group(2)}"

    words = text.split()
    if not words:
        return text
        
    first_word = words[0].lower()
    intents = {
        "создай": "создай", "создать": "создай", "создайте": "создай",
        "добавь": "добавь", "добавить": "добавь", "добавьте": "добавь",
        "запиши": "добавь", "записать": "добавь", "запишите": "добавь",
        "допиши": "добавь", "дописать": "добавь", "допишите": "добавь",
        "впиши": "добавь", "вписать": "добавь", "впишите": "добавь",
        "удали": "удали", "удалить": "удали", "удалите": "удали",
        "найди": "найди", "найти": "найди", "найдите": "найди", 
        "поищи": "найди", "поиск": "найди", "покажи": "найди", "покажите": "найди"
    }
    
    if first_word in intents:
        words[0] = intents[first_word]
        return " ".join(words)

    best_match = None
    best_ratio = 0
    for intent in intents.keys():
        ratio = difflib.SequenceMatcher(None, first_word, intent).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = intents[intent]
            
    if best_ratio > 0.75:
        words[0] = best_match
        return " ".join(words)
    return text

def parse_commands(text: str, notes: list[dict] = None) -> list[dict]:
    text = text.lower()
    text = normalize_intent(text)
    
    commands = []
    action_verbs = ["добавь", "создай", "найди", "удали", "сделай", "напиши", "купи", "скажи", "покажи"]
    
    def is_valid_title(title: str) -> bool:
        if not title: return False
        if len(title) > 40: return False
        if title in action_verbs: return False
        return True

    def clean_garbage(t: str) -> str:
        garbage = [
            "пожалуйста", "мне", "сделай", "хочу", "можешь", 
            "заметку", "заметка", "заметки", "с названием", 
            "в неё", "в нее", "туда", "по названию", 
            "что-то", "что то", "что-нибудь", "что нибудь",
            "какую-то", "какую то", "какую-нибудь", "какую нибудь",
            "про", "о", "об", "расскажи", "покажи"
        ]
        # Sort by length descending to match longer phrases first
        garbage.sort(key=len, reverse=True)
        for word in garbage:
            pattern = rf'\b{re.escape(word)}\b'
            t = re.sub(pattern, '', t, flags=re.IGNORECASE)
        return re.sub(r'\s+', ' ', t).strip()

    create_update_match = re.search(r'^(создай.*?|создать.*?|новая.*?)\s+(?:и\s+)?(добавь\s+.*)$', text)
    if create_update_match:
        parts = [create_update_match.group(1), create_update_match.group(2)]
    else:
        parts = [text]
        
    for i, part in enumerate(parts):
        part = part.strip()
        if not part: continue
            
        if part.startswith("создай") or part.startswith("создать") or part.startswith("новая"):
            title = re.sub(r'^(создай|создать|новую|новая)\s*', '', part).strip()
            title = clean_garbage(title)
            if not is_valid_title(title):
                commands.append({"type": "SEARCH", "query": clean_garbage(part)})
            else:
                # Anti-duplicate: check if note already exists
                existing_note = None
                if notes:
                    for n in notes:
                        if words_stem_match(n.get("title", ""), title):
                            existing_note = n
                            break
                if existing_note:
                    commands.append({"type": "UPDATE", "note_id": existing_note["id"], "append": ""})
                else:
                    commands.append({"type": "CREATE", "title": title, "content": ""})
        elif part.startswith("добавь"):
            if i > 0 and commands and commands[-1]["type"] == "CREATE":
                append_text = re.sub(r'^добавь\s+(в\s+)?', '', part).strip()
                append_text = clean_garbage(append_text)
                commands.append({"type": "UPDATE", "append": append_text})
            else:
                cleaned = re.sub(r'^добавь\s+(в\s+)?', '', part).strip()
                cleaned = clean_garbage(cleaned)
                
                # Try matching against existing user notes
                matched_note, append_text = find_matching_note(cleaned, notes)
                if matched_note and append_text is not None:
                    commands.append({
                        "type": "UPDATE",
                        "note_id": matched_note.get("id"),
                        "append": append_text
                    })
                else:
                    subparts = cleaned.split(maxsplit=1)
                    if len(subparts) == 2:
                        search_query = subparts[0]
                        append_text = subparts[1]
                        if not is_valid_title(search_query):
                            commands.append({"type": "SEARCH", "query": clean_garbage(part)})
                        else:
                            commands.append({"type": "UPDATE", "search_query": search_query, "append": append_text})
                    else:
                        commands.append({"type": "UPDATE", "search_query": cleaned, "append": cleaned})
        elif part.startswith("найди") or part.startswith("покажи") or part.startswith("что есть про"):
            query = re.sub(r'^(найди|покажи|что есть про)\s*', '', part).strip()
            query = clean_garbage(query)
            # Basic transliteration for common tech terms
            mapping = {"докер": "docker", "кубер": "kubernetes", "гит": "git", "питон": "python", "джава": "java", "нода": "node"}
            if query.lower() in mapping:
                query = mapping[query.lower()]
            commands.append({"type": "SEARCH", "query": query})
        else:
            query = clean_garbage(part)
            # Basic transliteration for common tech terms
            mapping = {"докер": "docker", "кубер": "kubernetes", "гит": "git", "питон": "python", "джава": "java", "нода": "node"}
            if query.lower() in mapping:
                query = mapping[query.lower()]
            commands.append({"type": "SEARCH", "query": query})
    return commands

STT_HOST = os.getenv("STT_HOST", "whisper")
STT_PORT = int(os.getenv("STT_PORT", 10300))

async def speech_to_text(audio_path: str) -> str:
    """Транскрибация аудио через Wyoming (Whisper/Vosk)"""
    raw_path = audio_path.replace(".ogg", ".raw")
    logger.info(f"STT: Начинаю обработку. OGG: {audio_path}, RAW: {raw_path}")
    try:
        cmd = ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "-f", "s16le", raw_path]
        subprocess.run(cmd, check=True, capture_output=True)
        
        reader, writer = await asyncio.wait_for(asyncio.open_connection(STT_HOST, STT_PORT), timeout=10.0)
        await async_write_event(Transcribe(language="ru").event(), writer)
        await async_write_event(AudioStart(rate=16000, width=2, channels=1).event(), writer)
        
        with open(raw_path, "rb") as f:
            while chunk := f.read(4096):
                await async_write_event(AudioChunk(audio=chunk, rate=16000, width=2, channels=1).event(), writer)
        
        await async_write_event(AudioStop().event(), writer)
        await writer.drain()
        
        transcript_text = ""
        while True:
            event = await asyncio.wait_for(async_read_event(reader), timeout=45.0)
            if event is None: break
            if Transcript.is_type(event.type):
                transcript_text = Transcript.from_event(event).text
                logger.info(f"STT: Результат транскрибации: «{transcript_text}»")
                break
        writer.close()
        await writer.wait_closed()
        return transcript_text
    except Exception as e:
        logger.error(f"STT Error: {e}")
        return ""
    finally:
        for p in [audio_path, raw_path]:
            if os.path.exists(p): os.remove(p)

# --- API Functions ---

async def save_note_to_api(user_id: int, title: str, content: str, note_id: str = None) -> Dict[str, Any]:
    url = f"{API_BASE_URL}/api/notes"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"id": note_id or str(uuid.uuid4()), "title": title, "content": content}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status in [200, 201]:
                    data = await response.json()
                    return {"status": "success", "note_id": data.get("id"), "data": data}
                return {"status": "error", "message": f"Ошибка: {response.status}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def get_note_api(user_id: int, note_id: str) -> Dict[str, Any]:
    url = f"{API_BASE_URL}/api/notes/{note_id}"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"status": "success", "data": data}
                return {"status": "error", "message": f"Ошибка: {response.status}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def patch_note_api(user_id: int, note_id: str, content: str) -> Dict[str, Any]:
    # Fetch current note first to append
    current = await get_note_api(user_id, note_id)
    if current.get("status") == "success":
        old_content = current["data"].get("content", "")
        new_content = f"{old_content}\n\n{content}" if old_content else content
        
        url = f"{API_BASE_URL}/api/notes/{note_id}"
        token = await get_user_token(user_id)
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"content": new_content}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(url, json=payload, headers=headers) as response:
                    if response.status == 200:
                        return {"status": "success", "note_id": note_id, "data": current["data"]}
                    return {"status": "error", "message": f"Ошибка: {response.status}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    return current

async def get_all_notes_api(user_id: int) -> list[dict]:
    url = f"{API_BASE_URL}/api/notes"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200: return await response.json()
                return []
    except Exception as e:
        return []

async def search_api(user_id: int, query: str) -> Dict[str, Any]:
    import urllib.parse
    encoded_query = urllib.parse.quote(query)
    url = f"{API_BASE_URL}/api/notes/search?query={encoded_query}"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"status": "success", "data": data if isinstance(data, list) else [data] if data else []}
                return {"status": "error", "message": f"Ошибка: {response.status}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def semantic_search_api(user_id: int, query: str) -> Dict[str, Any]:
    import urllib.parse
    encoded_query = urllib.parse.quote(query)
    url = f"{API_BASE_URL}/api/notes/semantic-search?query={encoded_query}"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"status": "success", "data": data}
                return {"status": "error", "message": f"Ошибка: {response.status}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def clean_content_for_llm(content: str) -> str:
    """Strip board data and base64 images from content for LLM context."""
    if not content:
        return ""
    # Remove board data entirely
    cleaned = re.sub(r'<!-- board:.*?-->', '[Доска — см. в приложении]', content, flags=re.DOTALL)
    # Remove base64 images
    cleaned = re.sub(r'!\[.*?\]\(data:image/[^)]+\)', '[Изображение]', cleaned)
    # Truncate if still too long
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000] + "..."
    return cleaned

async def send_long_message(message: types.Message, text: str, parse_mode: str = "HTML", **kwargs):
    """Sends a long message in multiple parts if it exceeds Telegram's limit."""
    if len(text) <= 4096:
        return await message.answer(text, parse_mode=parse_mode, **kwargs)
    
    # Simple chunking
    limit = 4000
    chunks = [text[i:i+limit] for i in range(0, len(text), limit)]
    
    for i, chunk in enumerate(chunks):
        # Only add reply_markup to the last chunk
        current_kwargs = kwargs.copy()
        if i < len(chunks) - 1:
            current_kwargs.pop("reply_markup", None)
            
        try:
            await message.answer(chunk, parse_mode=parse_mode, **current_kwargs)
        except Exception as e:
            logger.error(f"Error sending chunk: {e}")
            # Fallback: send without parse_mode if HTML is broken by split
            await message.answer(chunk, **current_kwargs)

# --- Bot Handlers ---

async def handle_open_note(callback: types.CallbackQuery, user_id: int):
    if callback.message:
        await record_user_chat_id(user_id, callback.message.chat.id)
    note_id = callback.data.replace("open_note_", "")
    await callback.answer()
    result = await get_note_api(user_id, note_id)
    if result.get("status") == "success":
        note = result.get("data", {})
        
        # Check for folder protection
        if note.get("folderIsProtected"):
            chat_id = str(callback.message.chat.id)
            awaiting_passwords[chat_id] = {"user_id": user_id, "note_id": note_id}
            await callback.message.answer("🔒 Эта заметка находится в защищенной папке. Пожалуйста, введите пароль доступа:")
            return

        title_esc = html.escape(note.get("title", "Без названия"))
        content = note.get("content", "Пусто")

        # Check if this is a board note (fast regex, no JSON parse)
        if '<!-- board:' in content:
            board_match = re.search(r'<!-- board:.*?"items"\s*:\s*\[(.*?)\]\s*\}.*?-->', content, re.DOTALL)
            if board_match:
                items_str = board_match.group(1)
                # Count items by counting "type": patterns
                item_count = len(re.findall(r'"type"\s*:', items_str))
                # Extract text from "text": "..." patterns (skip base64 images)
                text_items = re.findall(r'"text"\s*:\s*"((?:[^"\\]|\\.)*?)"', items_str)
                text_items = [t.strip() for t in text_items if t.strip() and len(t) < 500]

                if text_items:
                    board_content = "\n".join(f"• {html.escape(t)}" for t in text_items[:20])
                    full_text = f"📋 <b>{title_esc}</b> (доска, {item_count} элементов)\n\n{board_content}"
                else:
                    full_text = f"📋 <b>{title_esc}</b> (доска, {item_count} элементов)\n\n_<i>Текстовых элементов нет</i>_"

                if len(full_text) <= 4096:
                    await callback.message.answer(full_text, parse_mode="HTML")
                else:
                    header = f"📋 <b>{title_esc}</b> (доска)\n\n"
                    await callback.message.answer(header, parse_mode="HTML")
                    limit = 4000
                    board_escaped = html.escape(board_content)
                    for i in range(0, len(board_escaped), limit):
                        await callback.message.answer(board_escaped[i:i+limit], parse_mode="HTML")
                return

        content_esc = html.escape(content)
        
        full_text = f"📝 <b>{html.escape(note.get('title', ''))}</b>\n\n{content_esc}"
        
        if len(full_text) <= 4096:
            await callback.message.answer(full_text, parse_mode="HTML")
        else:
            # Send header first
            header = f"📝 <b>{title_esc}</b>\n\n"
            await callback.message.answer(header, parse_mode="HTML")
            
            # Send content in chunks
            limit = 4000
            for i in range(0, len(content_esc), limit):
                await callback.message.answer(content_esc[i:i+limit], parse_mode="HTML")
                
        image_matches = re.findall(r'!\[.*?\]\((/api/uploads/.*?)\)', note.get("content", ""))
        for img_path in image_matches:
            local_path = os.path.join(UPLOAD_DIR, os.path.basename(img_path))
            if os.path.exists(local_path):
                try: await callback.message.answer_photo(FSInputFile(local_path))
                except Exception as e: logger.error(f"Error sending photo: {e}")
    else:
        await callback.message.answer("❌ Не удалось загрузить содержимое заметки.")

async def handle_start(message: types.Message, user_id: int = None, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    await message.answer("Привет! Я твой личный помощник VibeMind. Бот подключен к вашей учетной записи — сюда будут приходить напоминания и уведомления.\n\nПрисылай мне любые мысли, ссылки, голосовые или картинки, и я сохраню их в твои заметки.")

async def handle_voice(message: types.Message, user_id: int, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    if admin_id and str(message.from_user.id) != str(admin_id): return
    await message.answer("🎙 Голосовое сообщение получено. Запускаю транскрибацию...")
    try:
        file = await message.bot.get_file(message.voice.file_id)
        ogg_path = os.path.join(TEMP_DIR, f"{uuid.uuid4()}.ogg")
        os.makedirs(TEMP_DIR, exist_ok=True)
        await message.bot.download_file(file.file_path, ogg_path)
        text = await speech_to_text(ogg_path)
        if not text:
            await message.answer("❌ Не удалось распознать речь.")
            return
            
        # Convert words to digits for better processing
        text = words_to_digits(text)
        
        await send_long_message(message, f"📝 Распознанный текст: «{text}»\nЗапускаю обработку...")
        fake_msg = message.model_copy(update={"text": text})
        await handle_text(fake_msg, user_id, admin_id)
    except Exception as e:
        await message.answer(f"❌ Ошибка при обработке голоса: {str(e)}")

async def handle_photo(message: types.Message, user_id: int, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    if admin_id and str(message.from_user.id) != str(admin_id): return
    try:
        caption = message.caption or ""
        filename = f"{uuid.uuid4()}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        file = await message.bot.get_file(message.photo[-1].file_id)
        await message.bot.download_file(file.file_path, filepath)
        
        image_markdown = f"![image](/api/uploads/{filename})"
        
        if caption:
            logger.info(f"Обработка фото с подписью: «{caption}»")
            notes = await get_all_notes_api(user_id)
            notes_context = [{"id": n.get("id"), "title": n.get("title"), "content": clean_content_for_llm(n.get("content", ""))} for n in notes]
            commands = await parse_commands_llm(user_id, caption, notes_context)
            logger.info(f"Распознанные команды для фото: {commands}")
            
            if commands:
                cmd = commands[0]
                intent = cmd.get("type")
                
                if intent == "UPDATE":
                    target_id = cmd.get("note_id")
                    if not target_id and cmd.get("search_query"):
                        res = await search_api(user_id, cmd.get("search_query"))
                        if res.get("status") == "success" and res.get("data"):
                            target_id = res["data"][0].get('id')
                    
                    if target_id:
                        append_text = f"{cmd['append']}\n\n{image_markdown}" if cmd.get("append") else image_markdown
                        res = await patch_note_api(user_id, target_id, append_text)
                        if res.get("status") == "success":
                            await message.answer(f"📸 Изображение добавлено в заметку «{res['data'].get('title')}»!")
                            return
                
                elif intent == "CREATE":
                    title = cmd.get("title", "Без названия")
                    note_content = f"{cmd['content']}\n\n{image_markdown}" if cmd.get("content") else (f"{caption}\n\n{image_markdown}" if caption else image_markdown)
                    result = await save_note_to_api(user_id, title, note_content)
                    if result.get("status") == "success":
                        await message.answer(f"📸 Создал новую заметку «{title}» с изображением!")
                        return

        # Fallback if no caption or parsing failed to find a target
        note_content = f"{caption}\n\n{image_markdown}" if caption else image_markdown
        title = caption[:50].strip() if caption else f"Photo from Telegram {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        result = await save_note_to_api(user_id, title, note_content)
        if result.get("status") == "success": 
            await message.answer("📸 Изображение сохранено в новую заметку!")
        else: 
            await message.answer(f"❌ Ошибка: {result.get('message')}")
            
    except Exception as e: 
        logger.error(f"Error in handle_photo: {e}")
        await message.answer(f"❌ Ошибка: {str(e)}")

async def handle_document(message: types.Message, user_id: int, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    if admin_id and str(message.from_user.id) != str(admin_id): return
    doc = message.document
    if not doc: return
    try:
        mime = doc.mime_type or ""
        caption = message.caption or ""
        ext = os.path.splitext(doc.file_name or "")[1] or (".jpg" if "image" in mime else ".bin")
        safe_ext = "".join(c for c in ext if c.isalnum() or c == '.')[:10]
        filename = f"{uuid.uuid4()}{safe_ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        
        file = await message.bot.get_file(doc.file_id)
        await message.bot.download_file(file.file_path, filepath)
        
        if mime.startswith("image/"):
            file_markdown = f"![image](/api/uploads/{filename})"
        else:
            file_markdown = f"[{doc.file_name or 'Файл'}](/api/uploads/{filename})"
            
        if caption:
            notes = await get_all_notes_api(user_id)
            notes_context = [{"id": n.get("id"), "title": n.get("title"), "content": clean_content_for_llm(n.get("content", ""))} for n in notes]
            commands = await parse_commands_llm(user_id, caption, notes_context)
            if commands:
                cmd = commands[0]
                intent = cmd.get("type")
                if intent == "UPDATE":
                    target_id = cmd.get("note_id")
                    if not target_id and cmd.get("search_query"):
                        res = await search_api(user_id, cmd.get("search_query"))
                        if res.get("status") == "success" and res.get("data"):
                            target_id = res["data"][0].get('id')
                    
                    if target_id:
                        append_text = f"{cmd['append']}\n\n{file_markdown}" if cmd.get("append") else file_markdown
                        res = await patch_note_api(user_id, target_id, append_text)
                        if res.get("status") == "success":
                            await message.answer(f"📎 Файл добавлен в заметку «{res['data'].get('title')}»!")
                            return
                
                elif intent == "CREATE":
                    title = cmd.get("title", doc.file_name or "Без названия")
                    note_content = f"{cmd['content']}\n\n{file_markdown}" if cmd.get("content") else (f"{caption}\n\n{file_markdown}" if caption else file_markdown)
                    result = await save_note_to_api(user_id, title, note_content)
                    if result.get("status") == "success":
                        await message.answer(f"📎 Создал новую заметку «{title}» с файлом!")
                        return

        note_content = f"{caption}\n\n{file_markdown}" if caption else file_markdown
        title = caption[:50].strip() if caption else f"Файл: {doc.file_name or datetime.now().strftime('%Y-%m-%d %H:%M')}"
        res = await save_note_to_api(user_id, title, note_content)
        if res.get("status") == "success":
            await message.answer(f"📎 Файл «{doc.file_name or 'документ'}» сохранен в заметки!")
        else:
            await message.answer(f"❌ Ошибка сохранения: {res.get('message')}")
    except Exception as e:
        logger.error(f"Error in handle_document: {e}")
        await message.answer(f"❌ Ошибка: {str(e)}")

# ==================== REMINDER PARSER ====================

def parse_reminder(text: str) -> Optional[Dict[str, str]]:
    """Parse natural language reminder text into {date, time, message}."""
    now = datetime.now()
    t = text.lower().strip()
    
    # Remove trigger words / prefixes
    prefix_pattern = r'^(?:(?:поставь|поставьте|создай|создайте|сделай|сделайте|добавь|добавьте|нужно|надо|не забудь|не забудьте)\s+)?(?:мне\s+)?(?:напомн\w*|напомин\w*|remind(?:\s+me)?)[,\s]*(?:мне\s+)?(?:о\s+том\s*,?\s*что\s+|что\s+|про\s+|о\s+|об\s+)?[,\s]*'
    t = re.sub(prefix_pattern, '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'^[,\s]+', '', t).strip()

    date = None
    time_str = "09:00"

    # --- Parse date ---
    # "сегодня"
    if re.search(r'\b(?:на\s+)?сегодня\b', t):
        date = now.strftime("%Y-%m-%d")
        t = re.sub(r'\b(?:на\s+)?сегодня\b', '', t).strip()
    # "завтра"
    elif re.search(r'\b(?:на\s+)?завтра\b', t):
        date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        t = re.sub(r'\b(?:на\s+)?завтра\b', '', t).strip()
    # "послезавтра"
    elif re.search(r'\b(?:на\s+)?послезавтра\b', t):
        date = (now + timedelta(days=2)).strftime("%Y-%m-%d")
        t = re.sub(r'\b(?:на\s+)?послезавтра\b', '', t).strip()
    # "через полчаса"
    elif re.search(r'\bчерез\s+полчаса\b', t):
        target = now + timedelta(minutes=30)
        date = target.strftime("%Y-%m-%d")
        time_str = target.strftime("%H:%M")
        t = re.sub(r'\bчерез\s+полчаса\b', '', t).strip()
    # "через полтора часа"
    elif re.search(r'\bчерез\s+полтора\s+часа\b', t):
        target = now + timedelta(minutes=90)
        date = target.strftime("%Y-%m-%d")
        time_str = target.strftime("%H:%M")
        t = re.sub(r'\bчерез\s+полтора\s+часа\b', '', t).strip()
    # "через [N|word] [минут|часов|секунд]"
    elif re.search(r'\bчерез\s+(одну|один|одно|две|два|три|четыре|пять|шесть|семь|восемь|девять|десять|пятнадцать|двадцать|тридцать|\d+)?\s*(минуту|минуты|минут|час|часа|часов|секунду|секунды|секунд)\b', t):
        m = re.search(r'\bчерез\s+(одну|один|одно|две|два|три|четыре|пять|шесть|семь|восемь|девять|десять|пятнадцать|двадцать|тридцать|\d+)?\s*(минуту|минуты|минут|час|часа|часов|секунду|секунды|секунд)\b', t)
        word_num_map = {
            'одну': 1, 'один': 1, 'одно': 1, 'две': 2, 'два': 2, 'три': 3, 'четыре': 4,
            'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
            'пятнадцать': 15, 'двадцать': 20, 'тридцать': 30
        }
        val_str = m.group(1)
        if not val_str:
            n = 1
        elif val_str.isdigit():
            n = int(val_str)
        else:
            n = word_num_map.get(val_str, 1)
        unit = m.group(2)
        if 'час' in unit:
            delta = timedelta(hours=n)
        elif 'секунд' in unit:
            delta = timedelta(seconds=max(n, 30))
        else:
            delta = timedelta(minutes=n)
        target = now + delta
        date = target.strftime("%Y-%m-%d")
        time_str = target.strftime("%H:%M")
        t = t[:m.start()] + " " + t[m.end():]
        t = t.strip()
    # "DD.MM.YYYY" or "DD.MM" (not preceded by "в ")
    elif re.search(r'(?<!в\s)\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b', t):
        m = re.search(r'(?<!в\s)\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b', t)
        day = int(m.group(1))
        month = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else now.year
        if 1 <= month <= 12 and 1 <= day <= 31:
            try:
                date = datetime(year, month, day).strftime("%Y-%m-%d")
                t = t[:m.start()] + " " + t[m.end():]
                t = t.strip()
            except ValueError:
                pass
    # "N числа"
    elif re.search(r'\b(\d{1,2})\s+числа\b', t):
        m = re.search(r'\b(\d{1,2})\s+числа\b', t)
        day = int(m.group(1))
        if 1 <= day <= 31:
            month = now.month
            if day < now.day:
                month += 1
            if month > 12:
                month = 1
            year = now.year if month >= now.month else now.year + 1
            try:
                date = datetime(year, month, day).strftime("%Y-%m-%d")
                t = t[:m.start()] + " " + t[m.end():]
                t = t.strip()
            except ValueError:
                pass
    # Days of week with inflections: "в пятницу", "в среду", "в понедельник"
    if not date:
        weekday_stems = [
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(понедельник\w*)\b', 0),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(вторник\w*)\b', 1),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(сред\w*)\b', 2),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(четверг\w*)\b', 3),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(пятниц\w*)\b', 4),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(суббот\w*)\b', 5),
            (r'\b(?:в\s+)?(?:следующ\w*\s+|эт\w*\s+)?(воскресень\w*)\b', 6),
        ]
        for pat, target_wd in weekday_stems:
            m = re.search(pat, t)
            if m:
                days_ahead = (target_wd - now.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7
                date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                t = t[:m.start()] + " " + t[m.end():]
                t = t.strip()
                break

    # --- Parse time ---
    time_parsed = (time_str != "09:00" and date is not None)

    if not time_parsed:
        # a) "в HH:MM", "в HH,MM", "в HH.MM" or "HH:MM" or "HH,MM" / "HH.MM" (2 digits for min)
        time_pat = r'(?:^|[,\s])(?:(?:в\s+(\d{1,2})[:,.](\d{1,2}))|(?:(\d{1,2}):(\d{1,2}))|(?:(\d{1,2})[.,](\d{2})))(?![\s]*(?:кг|г|кило|килограмм|литр|л|руб|коп|шт|%|метр))\b'
        time_match = re.search(time_pat, t)
        if time_match:
            g = time_match.groups()
            if g[0] is not None:
                h, m_val = int(g[0]), int(g[1])
            elif g[2] is not None:
                h, m_val = int(g[2]), int(g[3])
            else:
                h, m_val = int(g[4]), int(g[5])
            if h <= 23 and m_val <= 59:
                time_str = f"{h:02d}:{m_val:02d}"
                t = t[:time_match.start()] + " " + t[time_match.end():]
                t = t.strip()
                time_parsed = True

    if not time_parsed:
        # b) "в HH MM" — hour and minutes separated by space (e.g. "в 0 55", "в 16 28")
        time_match = re.search(r'\bв\s+(\d{1,2})\s+(\d{2})\b', t)
        if time_match:
            h = int(time_match.group(1))
            m_val = int(time_match.group(2))
            if h <= 23 and m_val <= 59:
                time_str = f"{h:02d}:{m_val:02d}"
                t = t[:time_match.start()] + " " + t[time_match.end():]
                t = t.strip()
                time_parsed = True

    if not time_parsed:
        # c) "в HH (вечера|дня|утра|ночи)"
        time_match = re.search(r'\bв\s+(\d{1,2})\s+(вечера|дня|утра|ночи)\b', t)
        if time_match:
            h = int(time_match.group(1))
            period = time_match.group(2)
            if period in ('вечера', 'дня') and h < 12:
                h += 12
            elif period == 'ночи' and h == 12:
                h = 0
            if 0 <= h <= 23:
                time_str = f"{h:02d}:00"
                t = t[:time_match.start()] + " " + t[time_match.end():]
                t = t.strip()
                time_parsed = True

    if not time_parsed:
        # d) "в 3-4 digits" (e.g. "в 328" = 3:28, "в 1628" = 16:28)
        time_match = re.search(r'\bв\s+(\d{3,4})\b', t)
        if time_match:
            num = int(time_match.group(1))
            h = num // 100
            m_val = num % 100
            if h <= 23 and m_val <= 59:
                time_str = f"{h:02d}:{m_val:02d}"
                t = t[:time_match.start()] + " " + t[time_match.end():]
                t = t.strip()
                time_parsed = True

    if not time_parsed:
        # e) "в HH" — just hour (e.g. "в 4", "в 16", "в 4 часа")
        time_match = re.search(r'\bв\s+(\d{1,2})(?![:,.]\d)(?:\s+часов|\s+часа|\s+час)?\b', t)
        if time_match:
            h = int(time_match.group(1))
            if h <= 23:
                time_str = f"{h:02d}:00"
                t = t[:time_match.start()] + " " + t[time_match.end():]
                t = t.strip()
                time_parsed = True

    if not time_parsed:
        # f) Words for times of day
        if re.search(r'\bвечером\b', t):
            time_str = "18:00"
            t = re.sub(r'\bвечером\b', '', t).strip()
        elif re.search(r'\bутром\b', t):
            time_str = "09:00"
            t = re.sub(r'\bутром\b', '', t).strip()
        elif re.search(r'\bднём\b', t):
            time_str = "13:00"
            t = re.sub(r'\bднём\b', '', t).strip()
        elif re.search(r'\bполдень\b', t):
            time_str = "12:00"
            t = re.sub(r'\b(?:в\s+)?полдень\b', '', t).strip()
        elif re.search(r'\bполночь\b', t):
            time_str = "00:00"
            t = re.sub(r'\b(?:в\s+)?полночь\b', '', t).strip()

    if not date:
        # If specified time is later today or in the current minute, set to today; otherwise tomorrow
        now_hm = now.strftime("%H:%M")
        if time_str >= now_hm:
            date = now.strftime("%Y-%m-%d")
        else:
            date = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    # Clean message text
    t = re.sub(r'^(?:поставь|поставьте|создай|создайте|сделай|сделайте|добавь|добавьте)\b', '', t).strip()
    t = re.sub(r'\bнапомн\w*\b', '', t).strip()
    t = re.sub(r'\bнапомин\w*\b', '', t).strip()
    t = re.sub(r'\bмне\b', '', t).strip()
    t = re.sub(r'^(?:на\s+|в\s+|что\s+|про\s+|о\s+|об\s+)', '', t).strip()
    t = re.sub(r'\bпро\b', '', t).strip()
    t = re.sub(r'^[,\.\s]+|[,\.\s]+$', '', t).strip()
    t = re.sub(r'^[а-яё]\s+', '', t).strip()

    if not t:
        t = "Напоминание"

    return {"date": date, "time": time_str, "message": t}

async def create_reminder_api(user_id: int, data: Dict[str, str]) -> Dict[str, Any]:
    """Create a reminder via HTTP API (without creating a note)."""
    url = f"{API_BASE_URL}/api/reminders"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "remind_at": f"{data['date']}T{data['time']}:00",
        "repeat_type": "none",
        "message": data["message"]
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    return {"status": "success"}
                body = await response.text()
                return {"status": "error", "message": f"HTTP {response.status}: {body}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def get_reminders_api(user_id: int) -> list:
    """Get all reminders via HTTP API."""
    url = f"{API_BASE_URL}/api/reminders"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                return []
    except Exception as e:
        return []

async def delete_reminder_api(user_id: int, reminder_id: str) -> bool:
    url = f"{API_BASE_URL}/api/reminders/{reminder_id}"
    token = await get_user_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(url, headers=headers) as response:
                return response.status == 200
    except:
        return False

async def handle_calendar(message: types.Message, user_id: int, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    if admin_id and str(message.from_user.id) != str(admin_id): return
    args = message.text.split(maxsplit=1)
    sub = args[1].lower() if len(args) > 1 else "сегодня"
    await _show_calendar(message, user_id, sub)

async def _show_calendar(message: types.Message, user_id: int, sub: str = "сегодня"):
    now = datetime.now()
    if sub in ["сегодня", "today"]:
        start = now.replace(hour=0, minute=0, second=0)
        end = start + timedelta(days=1)
        label = f"Сегодня, {now.strftime('%d.%m')} ({['пн','вт','ср','чт','пт','сб','вс'][now.weekday()]})"
    elif sub in ["завтра", "tomorrow"]:
        start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0)
        end = start + timedelta(days=1)
        d = start
        label = f"Завтра, {d.strftime('%d.%m')} ({['пн','вт','ср','чт','пт','сб','вс'][d.weekday()]})"
    elif sub in ["неделя", "week"]:
        start = now.replace(hour=0, minute=0, second=0)
        end = start + timedelta(days=7)
        label = "На неделю"
    elif sub in ["месяц", "month"]:
        start = now.replace(hour=0, minute=0, second=0)
        next_month = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_month
        label = "На месяц"
    else:
        start = now.replace(hour=0, minute=0, second=0)
        end = start + timedelta(days=1)
        label = f"Сегодня, {now.strftime('%d.%m')} ({['пн','вт','ср','чт','пт','сб','вс'][now.weekday()]})"

    reminders = await get_reminders_api(user_id)
    filtered = []
    for r in reminders:
        try:
            remind_str = r.get("remind_at", "")
            if remind_str.endswith('Z'):
                remind_str = remind_str[:-1] + '+00:00'
            rt = datetime.fromisoformat(remind_str)
            if rt.tzinfo is not None:
                rt = rt.astimezone().replace(tzinfo=None)
            if start <= rt < end and not r.get("is_sent"):
                filtered.append((rt, r))
        except Exception:
            pass

    filtered.sort(key=lambda x: x[0])

    if not filtered:
        await send_long_message(message, f"📅 <b>{label}</b>\n\nПусто — нет напоминаний.")
        return

    resp = f"📅 <b>{label}</b>\n\n"
    for rt, r in filtered:
        time_display = rt.strftime("%H:%M")
        msg = r.get("message") or "Напоминание"
        resp += f"🕐 <b>{time_display}</b> — {html.escape(msg)}\n"

    await send_long_message(message, resp)


async def handle_text(message: types.Message, user_id: int, admin_id: str = None):
    await record_user_chat_id(user_id, message.chat.id)
    if admin_id and str(message.from_user.id) != str(admin_id): return
    if message.text.startswith('/'): return

    # --- Check for reminder intent FIRST ---
    text_lower = message.text.lower().strip()
    reminder_pattern = r'^(?:(?:поставь|поставьте|создай|создайте|сделай|сделайте|добавь|добавьте|нужно|надо|не забудь|не забудьте)\s+)?(?:мне\s+)?(?:напомн\w*|напомин\w*|remind(?:\s+me)?)\b'
    if re.search(reminder_pattern, text_lower):
        parsed = parse_reminder(message.text)
        if parsed:
            result = await create_reminder_api(user_id, parsed)
            if result.get("status") == "success":
                d = datetime.strptime(parsed["date"], "%Y-%m-%d")
                weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
                wd = weekdays[d.weekday()]
                date_str = d.strftime("%d.%m.%Y")
                resp = f"✅ Напоминание создано!\n\n📅 <b>{date_str} ({wd})</b>\n🕐 {parsed['time']}\n📝 {html.escape(parsed['message'])}"
                await send_long_message(message, resp)
            else:
                await message.answer(f"❌ Не удалось создать напоминание: {result.get('message', 'Ошибка')}")
            return

    # --- Check for calendar intent ---
    clean_query = re.sub(r'^[?,.!\s]+|[?,.!\s]+$', '', text_lower)
    calendar_exact = {
        'сегодня': ['сегодня', 'на сегодня', 'что сегодня', 'планы на сегодня', 'какие планы на сегодня', 'что запланировано на сегодня', 'календарь на сегодня', 'календарь сегодня', 'дела на сегодня'],
        'завтра': ['завтра', 'на завтра', 'что завтра', 'планы на завтра', 'какие планы на завтра', 'что запланировано на завтра', 'календарь на завтра', 'календарь завтра', 'дела на завтра'],
        'неделя': ['неделя', 'на неделю', 'на этой неделе', 'что на неделю', 'что на неделе', 'планы на неделю', 'планы на эту неделю', 'какие планы на неделю', 'календарь на неделю', 'дела на неделю'],
        'месяц': ['месяц', 'на месяц', 'на этот месяц', 'что на месяц', 'планы на месяц', 'какие планы на месяц', 'календарь на месяц', 'дела на месяц'],
    }
    matched_calendar_sub = None
    for sub_key, triggers in calendar_exact.items():
        if clean_query in triggers:
            matched_calendar_sub = sub_key
            break

    if not matched_calendar_sub:
        calendar_patterns = [
            (r'^(?:календарь|расписание)\s+(сегодня|завтра|недел\w*|месяц\w*)', {
                'сегодня': 'сегодня', 'завтра': 'завтра', 'недел': 'неделя', 'месяц': 'месяц'
            }),
            (r'^(?:что|какие)\s+(?:у\s+нас\s+)?(?:планы|дела|запланировано)\s+(?:на\s+)?(сегодня|завтра|недел\w*|месяц\w*)', {
                'сегодня': 'сегодня', 'завтра': 'завтра', 'недел': 'неделя', 'месяц': 'месяц'
            }),
            (r'^(?:планы|дела)\s+(?:на\s+)?(сегодня|завтра|недел\w*|месяц\w*)', {
                'сегодня': 'сегодня', 'завтра': 'завтра', 'недел': 'неделя', 'месяц': 'месяц'
            }),
        ]
        for pat, period_map in calendar_patterns:
            m = re.search(pat, clean_query)
            if m:
                word = m.group(1)
                for k, p in period_map.items():
                    if word.startswith(k):
                        matched_calendar_sub = p
                        break
                if matched_calendar_sub:
                    break

    if matched_calendar_sub:
        await _show_calendar(message, user_id, matched_calendar_sub)
        return

    chat_id = str(message.chat.id)
    if chat_id in awaiting_passwords:
        state = awaiting_passwords.pop(chat_id)
        # Verify password
        note_id = state["note_id"]
        # We need an endpoint to verify folder password
        # For now, we can try to fetch the note with a password param if we implemented it, 
        # but we decided on a verify endpoint.
        
        url = f"{API_BASE_URL}/api/folders/verify-by-note/{note_id}"
        token = await get_user_token(user_id)
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json={"password": message.text}, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("success"):
                            # Success! Load note
                            res = await get_note_api(user_id, note_id)
                            if res.get("status") == "success":
                                note = res["data"]
                                title_esc = html.escape(note.get("title", ""))
                                content = note.get("content", "")

                                # Check if board (fast regex)
                                if '<!-- board:' in content:
                                    board_match = re.search(r'<!-- board:.*?"items"\s*:\s*\[(.*?)\]\s*\}.*?-->', content, re.DOTALL)
                                    if board_match:
                                        items_str = board_match.group(1)
                                        item_count = len(re.findall(r'"type"\s*:', items_str))
                                        text_items = re.findall(r'"text"\s*:\s*"((?:[^"\\]|\\.)*?)"', items_str)
                                        text_items = [t.strip() for t in text_items if t.strip() and len(t) < 500]
                                        if text_items:
                                            board_text = "\n".join(f"• {html.escape(t)}" for t in text_items[:20])
                                            await send_long_message(message, f"🔓 Доступ разрешен!\n\n📋 <b>{title_esc}</b> (доска)\n\n{board_text}")
                                        else:
                                            await send_long_message(message, f"🔓 Доступ разрешен!\n\n📋 <b>{title_esc}</b> (доска, нет текста)")
                                    else:
                                        await send_long_message(message, f"🔓 Доступ разрешен!\n\n📋 <b>{title_esc}</b> (доска)")
                                else:
                                    content_esc = html.escape(content)
                                    await send_long_message(message, f"🔓 Доступ разрешен!\n\n📝 <b>{title_esc}</b>\n\n{content_esc}")
                                return
                        else:
                            await message.answer("❌ Неверный пароль. Попробуйте снова открыть заметку.")
                            return
        except Exception as e:
            logger.error(f"Error verifying password: {e}")
            await message.answer("❌ Ошибка при проверке пароля.")
            return

    logger.info(f"Обработка текста от пользователя {user_id}: «{message.text}»")
    
    # Convert words to digits
    processed_text = words_to_digits(message.text)
    if processed_text != message.text:
        logger.info(f"Текст после преобразования чисел: «{processed_text}»")
        
    normalized_text = normalize_intent(processed_text)
    notes = await get_all_notes_api(user_id)
    notes_context = [{"id": n.get("id"), "title": n.get("title"), "content": clean_content_for_llm(n.get("content", ""))} for n in notes]
    commands = await parse_commands_llm(user_id, normalized_text, notes_context)
    logger.info(f"Распознанные команды: {commands}")
    
    chain_note_id = None
    for cmd in commands:
        intent = cmd.get("type")
        logger.info(f"Исполнение команды: {intent}, параметры: {cmd}")
        if intent == "CREATE":
            title = cmd.get("title", "Без названия")
            
            # Anti-duplicate fallback:
            existing_note_id = None
            for n in notes:
                if words_stem_match(n.get("title", ""), title):
                    existing_note_id = n.get("id")
                    break
            
            if existing_note_id:
                logger.info(f"Заметка '{title}' уже существует (ID: {existing_note_id}). Конвертируем CREATE в апдейт ID или просто переиспользуем.")
                chain_note_id = existing_note_id
                
                content_to_append = cmd.get("content", "")
                if content_to_append:
                    res = await patch_note_api(user_id, existing_note_id, content_to_append)
                    if res.get("status") == "success":
                        await message.answer(f"✅ Добавил текст в существующую заметку «{title}»!")
                    else:
                        await message.answer(f"❌ Ошибка при добавлении в '{title}': {res.get('message')}")
            else:
                result = await save_note_to_api(user_id, title, cmd.get("content", ""))
                if result.get("status") == "success":
                    chain_note_id = result.get("note_id")
                    logger.info(f"Успешно создана заметка: {title} (ID: {chain_note_id})")
                    await message.answer(f"Создал новую заметку «{title}»! 📝")
                else: await message.answer(f"❌ Ошибка: {result.get('message')}")
        elif intent == "UPDATE":
            target_id = cmd.get("note_id") or chain_note_id
            if not target_id and cmd.get("search_query"):
                sq = cmd.get("search_query")
                res = await search_api(user_id, sq)
                if res.get("status") == "success" and res.get("data"):
                    target_id = res["data"][0].get('id')

                # Second fallback: match against in-memory notes using words_stem_match
                if not target_id and notes:
                    for n in notes:
                        if words_stem_match(n.get("title", ""), sq):
                            target_id = n.get("id")
                            break

            if target_id:
                append = cmd.get("append", "")
                if isinstance(append, list): append = "\n- " + "\n- ".join(append)
                res = await patch_note_api(user_id, target_id, append)
                if res.get("status") == "success":
                    logger.info(f"Успешно обновлена заметка ID: {target_id}")
                    await message.answer(f"✅ Добавил текст в заметку «{res['data'].get('title')}»!")
                    chain_note_id = target_id
                else: await message.answer(f"❌ Ошибка: {res.get('message')}")
            else:
                # If note does not exist yet, create it and append text!
                new_title = cmd.get("search_query") or "Новая заметка"
                append = cmd.get("append", "")
                if isinstance(append, list): append = "\n- " + "\n- ".join(append)
                res = await save_note_to_api(user_id, new_title, append)
                if res.get("status") == "success":
                    chain_note_id = res.get("note_id")
                    logger.info(f"Создана новая заметка: {new_title} (ID: {chain_note_id})")
                    await message.answer(f"📝 Создал новую заметку «{new_title}» и добавил текст!")
                else:
                    await message.answer("Не нашёл подходящую заметку.")
        elif intent == "SEARCH":
            query = cmd.get("query", "")
            if not query: continue
            logger.info(f"Поиск заметок по запросу: «{query}»")
            await message.answer(f"🔍 Ищу заметки по запросу: «{query}»...")
            
            res_kw = await search_api(user_id, query)
            results = res_kw.get("data", []) if res_kw.get("status") == "success" else []

            if not results:
                await message.answer("Ничего не найдено. 😔")
                continue
            from aiogram.utils.keyboard import InlineKeyboardBuilder
            builder = InlineKeyboardBuilder()
            resp = f"Вот что я нашел по запросу «{html.escape(query)}»:\n\n"
            for i, note in enumerate(results[:15], 1):
                t_esc = html.escape(note.get('title', 'Без названия'))
                if note.get('folderIsProtected'):
                    p_esc = "<i>[Содержимое защищено паролем]</i>"
                else:
                    raw_content = note.get('content', '')
                    # Check if board (fast regex)
                    if '<!-- board:' in raw_content:
                        bm = re.search(r'<!-- board:.*?"items"\s*:\s*\[', raw_content, re.DOTALL)
                        if bm:
                            # Count items quickly
                            items_section = raw_content[bm.start():]
                            item_count = len(re.findall(r'"type"\s*:', items_section[:5000]))
                            p_esc = f"<i>📋 Доска ({item_count} элементов)</i>"
                        else:
                            p_esc = "<i>📋 Доска</i>"
                    else:
                        p_esc = html.escape(raw_content[:100].replace('\n', ' '))
                        p_esc = f"<i>{p_esc}</i>"
                resp += f"{i}. <b>{t_esc}</b>\n{p_esc}\n\n"
                builder.button(text=f"Открыть {i}", callback_data=f"open_note_{note['id']}")
            builder.adjust(1)
            await send_long_message(message, resp, parse_mode="HTML", reply_markup=builder.as_markup())

# --- Bot Management ---

def create_bot_router() -> Router:
    r = Router()
    r.callback_query.register(handle_open_note, F.data.startswith("open_note_"))
    r.message.register(handle_start, Command("start"))
    r.message.register(handle_voice, F.voice)
    r.message.register(handle_photo, F.photo)
    r.message.register(handle_document, F.document)
    r.message.register(handle_calendar, Command("calendar"))
    r.message.register(handle_text, F.text)
    return r

router = create_bot_router()

async def start_bot(user_id: int, username: str, token: str, proxy_url: str = None, proxy_config: dict = None, admin_id: str = None):
    global current_bots, user_usernames, token_to_user, bot_tasks, user_chat_ids
    
    cur_task = asyncio.current_task()
    async with get_user_lock(user_id):
        # Проверяем, не запущен ли уже этот токен другим пользователем
        if token in token_to_user and token_to_user[token] != user_id:
            old_user_id = token_to_user[token]
            logger.warning(f"Token already in use by user {old_user_id}. Stopping old instance...")
            # Мы не можем вызвать stop_bot здесь напрямую из-за вложенного лока, 
            # но мы можем вызвать его логику или просто очистить.
            # На самом деле, лучше просто предупредить и продолжить, 
            # так как Telegram сам разорвет старое соединение при новом.
            # Но для чистоты - удалим из реестра.
            token_to_user.pop(token, None)
        
        # Если для этого пользователя УЖЕ есть запущенная задача (и это не текущая) - отменяем её
        if user_id in bot_tasks and bot_tasks[user_id] != cur_task:
            logger.warning(f"Bot task already exists for user {user_id}. Cancelling before start...")
            task = bot_tasks[user_id]
            task.cancel()
            try: await asyncio.wait_for(task, timeout=2.0)
            except: pass
            bot_tasks.pop(user_id, None)

        bot_tasks[user_id] = cur_task
        token_to_user[token] = user_id
        user_usernames[user_id] = username
        if admin_id:
            user_chat_ids[user_id] = str(admin_id)
    if isinstance(proxy_url, str) and proxy_url.strip().startswith("{"):
        try: proxy_url = ast.literal_eval(proxy_url)
        except: pass
    try:
        final_proxy_url = None
        if isinstance(proxy_url, str) and (proxy_url.startswith("http") or proxy_url.startswith("socks")):
            final_proxy_url = proxy_url
        elif isinstance(proxy_url, dict) and proxy_url.get("host"):
            p = proxy_url
            final_proxy_url = f"{p.get('protocol', 'http')}://{p.get('username')}:{p.get('password')}@{p['host']}:{p['port']}" if p.get('username') else f"{p.get('protocol', 'http')}://{p['host']}:{p['port']}"
        elif isinstance(proxy_config, dict) and proxy_config.get("host"):
            p = proxy_config
            final_proxy_url = f"{p.get('protocol', 'http')}://{p.get('username')}:{p.get('password')}@{p['host']}:{p['port']}" if p.get('username') else f"{p.get('protocol', 'http')}://{p['host']}:{p['port']}"
        
        # Use float for timeout to avoid math errors in aiogram (+ buffer)
        session = AiohttpSession(proxy=final_proxy_url, timeout=60.0) if final_proxy_url else AiohttpSession(timeout=60.0)
        bot = Bot(token=token, session=session)
        current_bots[user_id] = bot
        try:
            logger.info(f"Запуск бота для {username}. Прокси: {final_proxy_url or 'Direct'}")
            # Удаляем вебхук перед запуском поллинга, чтобы избежать ConflictError
            await bot.delete_webhook(drop_pending_updates=True)
            bot_dp = Dispatcher()
            bot_dp.include_router(create_bot_router())
            await bot_dp.start_polling(bot, user_id=user_id, admin_id=admin_id, handle_signals=False)
        finally:
            current_bots.pop(user_id, None)
            if bot_tasks.get(user_id) == cur_task:
                bot_tasks.pop(user_id, None)
            try:
                await session.close()
                await asyncio.sleep(0.25)
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Ошибка бота {user_id}: {e}")

async def stop_bot(user_id: int):
    async with get_user_lock(user_id):
        global current_bots, bot_tasks, token_to_user
        logger.info(f"Stopping bot for user {user_id}...")
        
        # Находим токен, связанный с этим пользователем, чтобы очистить и его
        token_to_remove = None
        for token, uid in list(token_to_user.items()):
            if uid == user_id:
                token_to_remove = token
                break
        
        if token_to_remove:
            token_to_user.pop(token_to_remove, None)

        if bot := current_bots.get(user_id):
            try: 
                # Пытаемся закрыть сессию бота
                await bot.session.close()
                await asyncio.sleep(0.25)
                logger.info(f"Session closed for user {user_id}")
            except Exception as e: 
                logger.error(f"Error closing session for user {user_id}: {e}")
            finally:
                current_bots.pop(user_id, None)
            
        if task := bot_tasks.get(user_id):
            task.cancel()
            try: 
                # Ждем завершения задачи с таймаутом
                await asyncio.wait_for(task, timeout=5.0)
                logger.info(f"Task finished for user {user_id}")
            except asyncio.CancelledError: 
                logger.info(f"Task cancelled for user {user_id}")
            except asyncio.TimeoutError:
                logger.warning(f"Task cancellation timed out for user {user_id}")
            except Exception as e:
                logger.error(f"Error cancelling task for user {user_id}: {e}")
            finally:
                bot_tasks.pop(user_id, None)
        
        # Даем Telegram время "забыть" старое соединение
        await asyncio.sleep(1.0)
        logger.info(f"Bot for user {user_id} stopped.")
    
    # Даем небольшую паузу, чтобы Telegram успел закрыть соединение
    await asyncio.sleep(0.5)

async def restart_bot(user_id: int, username: str, token: str, proxy_url: str = None, proxy_config: dict = None, admin_id: str = None):
    await stop_bot(user_id)
    if token:
        bot_tasks[user_id] = asyncio.create_task(start_bot(user_id, username, token, proxy_url, proxy_config, admin_id))

async def test_bot_connection(token: str, admin_id: str = None, proxy_url: str = None, proxy_config: dict = None):
    if isinstance(proxy_url, str) and proxy_url.strip().startswith("{"):
        try: proxy_url = ast.literal_eval(proxy_url)
        except: pass
    try:
        final_proxy_url = None
        if isinstance(proxy_url, str) and (proxy_url.startswith("http") or proxy_url.startswith("socks")):
            final_proxy_url = proxy_url
        elif isinstance(proxy_url, dict) and proxy_url.get("host"):
            p = proxy_url
            final_proxy_url = f"{p.get('protocol', 'http')}://{p.get('username')}:{p.get('password')}@{p['host']}:{p['port']}" if p.get('username') else f"{p.get('protocol', 'http')}://{p['host']}:{p['port']}"
        elif isinstance(proxy_config, dict) and proxy_config.get("host"):
            p = proxy_config
            final_proxy_url = f"{p.get('protocol', 'http')}://{p.get('username')}:{p.get('password')}@{p['host']}:{p['port']}" if p.get('username') else f"{p.get('protocol', 'http')}://{p['host']}:{p['port']}"
        
        session = AiohttpSession(proxy=final_proxy_url, timeout=60.0) if final_proxy_url else AiohttpSession(timeout=60.0)
        try:
            async with Bot(token=token, session=session) as test_bot:
                me = await asyncio.wait_for(test_bot.get_me(), timeout=30.0)
                if admin_id: await test_bot.send_message(chat_id=admin_id, text="✅ VibeMind: Connection Successful!")
                return True, f"✅ Успешно: @{me.username}"
        finally:
            await session.close()
    except Exception as e:
        return False, f"❌ Ошибка: {str(e)}"