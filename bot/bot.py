"""Хаоши · 好时 — Telegram-бот кофейни 24 сезонов (MVP).

Бот открывает мини-приложение (папка webapp), принимает из него заказы
и отвечает на команды: /season, /phrase, /name, /fortune.
"""

import asyncio
import html
import json
import logging
import os
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
BARISTA_CHAT_ID = os.getenv("BARISTA_CHAT_ID")  # необязательно: чат бариста для новых заказов

# Общие данные с мини-приложением: webapp/data.js = "window.HAOSHI_DATA = {...};"
DATA_FILE = Path(__file__).resolve().parent.parent / "webapp" / "data.js"
_raw = DATA_FILE.read_text(encoding="utf-8")
DATA = json.loads(_raw.split("=", 1)[1].strip().rstrip(";"))


# ---------- Сезоны ----------
def season_at(day: date):
    starts = []
    for year in (day.year - 1, day.year, day.year + 1):
        for s in DATA["seasons"]:
            m, d = map(int, s["start"].split("-"))
            starts.append((date(year, m, d), s))
    starts.sort(key=lambda x: x[0])
    i = max(i for i, (start, _) in enumerate(starts) if start <= day)
    return starts[i][1], starts[i + 1][1], starts[i + 1][0]


def season_text() -> str:
    cur, nxt, next_date = season_at(date.today())
    days = (next_date - date.today()).days
    return (
        f"🍂 <b>Сейчас сезон «{cur['ru']}»</b> {cur['zh']} <i>{cur['py']}</i>\n\n"
        f"☕ <b>{cur['drink']}</b> {cur['drinkZh']} — {cur['price']} ₽\n"
        f"{cur['fact']}\n\n"
        f"⏳ Напиток исчезнет через {days} дн. Дальше — «{nxt['ru']}» {nxt['zh']}."
    )


# ---------- Китайское имя ----------
def chinese_name(raw: str) -> dict:
    key = raw.strip().lower()
    name = key.replace("ё", "е")
    sound = DATA["names"].get(key) or DATA["names"].get(name)
    sur = DATA["surnames"].get(name[:1], ["安", "Ān"])
    h = 0
    for ch in name:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    pool = [g for g in DATA["given"] if g[0] != sur[0]]
    g1 = pool[h % len(pool)]
    g2 = pool[(h >> 5) % len(pool)]
    if g2[0] == g1[0] or g2[1] == g1[1]:
        g2 = pool[(pool.index(g1) + 7) % len(pool)]
    return {
        "sound": sound,
        "hanzi": sur[0] + g1[0] + g2[0],
        "pinyin": f"{sur[1]} {g1[1].capitalize()}{g2[1]}",
        "meaning": f"«{g1[2]} и {g2[2]}»",
    }


def phrase_of_day() -> dict:
    return DATA["phrases"][date.today().timetuple().tm_yday % len(DATA["phrases"])]


# ---------- Бот ----------
dp = Dispatcher()


def main_keyboard() -> ReplyKeyboardMarkup:
    # Кнопка клавиатуры (а не inline) — только так мини-приложение может вернуть заказ через sendData
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🍵 Открыть меню Хаоши", web_app=WebAppInfo(url=WEBAPP_URL))],
            [KeyboardButton(text="🍂 Сезон"), KeyboardButton(text="🀄 Фраза дня"), KeyboardButton(text="🎋 Предсказание")],
        ],
        resize_keyboard=True,
    )


@dp.message(CommandStart())
async def start(message: Message):
    first = message.from_user.first_name if message.from_user else "друг"
    await message.answer(
        f"你好, {first}! Я Хао-Хао 🐼 — панда-бариста кофейни <b>Хаоши</b> 好时.\n\n"
        "Каждые 15 дней у нас новый напиток по китайскому календарю 24 сезонов.\n"
        "Закажите заранее и заберите без очереди 👇",
        reply_markup=main_keyboard(),
    )
    await message.answer(season_text())


@dp.message(Command("season"))
@dp.message(F.text == "🍂 Сезон")
async def season(message: Message):
    await message.answer(season_text())


@dp.message(Command("phrase"))
@dp.message(F.text == "🀄 Фраза дня")
async def phrase(message: Message):
    p = phrase_of_day()
    await message.answer(
        f"🀄 <b>Фраза дня</b>\n\n<b>{p['zh']}</b>\n<i>{p['py']}</i> — {p['ru']}\n\n"
        "Скажите её на кассе и получите скидку 10%!"
    )


@dp.message(Command("fortune"))
@dp.message(F.text == "🎋 Предсказание")
async def fortune(message: Message):
    f = random.choice(DATA["fortunes"])
    await message.answer(f"🎋 Вы вытянули палочку…\n\n<b>{f['level']}</b> — {f['ru']}\n{f['text']}")


@dp.message(Command("name"))
async def name(message: Message, command: CommandObject):
    if not command.args:
        await message.answer("Напишите имя после команды, например: <code>/name Алина</code>")
        return
    n = chinese_name(command.args.split()[0])
    sound = f"Звучит как: <b>{n['sound']}</b>\n" if n["sound"] else ""
    await message.answer(
        f"🐼 {sound}Ваше китайское имя: <b>{n['hanzi']}</b> <i>{n['pinyin']}</i>\n"
        f"Значение: {n['meaning']}\n\nОно будет на вашем стакане ✨"
    )


@dp.message(F.web_app_data)
async def order_from_webapp(message: Message, bot: Bot):
    try:
        order = json.loads(message.web_app_data.data)
    except (ValueError, TypeError):
        await message.answer("Не получилось прочитать заказ, попробуйте ещё раз 🙏")
        return

    def esc(value) -> str:
        return html.escape(str(value))

    lines = "\n".join(
        f"• {esc(i['name'])} {esc(i['zh'])} × {int(i['qty'])} — {int(i['price']) * int(i['qty'])} ₽"
        for i in order.get("items", [])
    )
    pickup_at = (datetime.now() + timedelta(minutes=int(order.get("pickup", 15)))).strftime("%H:%M")
    discount = f"\nСкидка за фразу на китайском: −{int(order['discount'])} ₽" if order.get("discount") else ""
    cup = f"\nНа стакане будет: {esc(order['name'])}" if order.get("name") else ""
    say = f"\n\n🀄 Не забудьте сказать на кассе: <b>{phrase_of_day()['zh']}</b>" if order.get("sayChinese") else ""

    await message.answer(
        f"谢谢! Заказ <b>{esc(order.get('no', ''))}</b> принят 🐼\n\n{lines}{discount}\n"
        f"<b>Итого: {int(order.get('total', 0))} ₽</b>\n\n⏰ Заберите в {pickup_at}{cup}{say}\n\n"
        "<i>Это прототип: оплата не списывается.</i>"
    )

    if BARISTA_CHAT_ID:
        guest = esc(message.from_user.full_name) if message.from_user else "гость"
        await bot.send_message(BARISTA_CHAT_ID, f"🔔 Новый заказ {esc(order.get('no'))} от {guest}, к {pickup_at}\n{lines}{cup}")


async def main():
    if not BOT_TOKEN or not WEBAPP_URL:
        raise SystemExit("Заполните BOT_TOKEN и WEBAPP_URL в файле .env (см. .env.example)")
    logging.basicConfig(level=logging.INFO)
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
