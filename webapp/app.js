(() => {
  "use strict";

  const D = window.HAOSHI_DATA;
  const DAY = 24 * 60 * 60 * 1000;
  const BOX_EVERY = 10; // каждый 10-й заказ — слепая коробка

  // ---------- Telegram ----------
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTelegram = !!(tg && tg.initData);
  if (inTelegram) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#B8232F"); tg.setBackgroundColor("#F7EFE0"); } catch (e) { /* старые клиенты */ }
  }

  // ---------- Хранилище ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("haoshi:" + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("haoshi:" + key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
    }
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rub = (n) => n.toLocaleString("ru-RU") + " ₽";

  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Сезоны ----------
  function seasonAt(date) {
    const y = date.getFullYear();
    const list = [];
    for (const year of [y - 1, y, y + 1]) {
      for (const s of D.seasons) {
        const [m, d] = s.start.split("-").map(Number);
        list.push({ s, date: new Date(year, m - 1, d) });
      }
    }
    list.sort((a, b) => a.date - b.date);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    let i = list.findIndex((x) => x.date > today) - 1;
    return { current: list[i].s, start: list[i].date, next: list[i + 1].s, nextDate: list[i + 1].date };
  }

  const now = new Date();
  const S = seasonAt(now);
  document.documentElement.style.setProperty("--season", S.current.color);

  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / DAY);
  const todayKey = now.toISOString().slice(0, 10);

  // ---------- Стакан ----------
  function cupSVG(color, text, sub) {
    const size = text.length <= 2 ? 34 : text.length <= 4 ? 26 : text.length <= 6 ? 18 : 14;
    return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Стакан ${esc(text)}">
      <ellipse cx="60" cy="146" rx="36" ry="4" fill="#000" opacity=".12"/>
      <path d="M22 18 Q60 2 98 18 Z" fill="#FFF" stroke="#231F20" stroke-width="3" stroke-linejoin="round"/>
      <rect x="10" y="17" width="100" height="14" rx="6" fill="#FFF" stroke="#231F20" stroke-width="3"/>
      <path d="M16 31 L104 31 L94 140 Q60 147 26 140 Z" fill="#FFFDF7" stroke="#231F20" stroke-width="3" stroke-linejoin="round"/>
      <path d="M19.5 60 L100.5 60 L97 104 L23 104 Z" fill="${color}"/>
      <path d="M19.5 60 L100.5 60 M23 104 L97 104" stroke="#D4A24C" stroke-width="3"/>
      <text x="60" y="${82 + size / 3}" text-anchor="middle" font-family="Ma Shan Zheng, Noto Serif SC, serif" font-size="${size}" fill="#FFF8EA">${esc(text)}</text>
      <text x="60" y="126" text-anchor="middle" font-family="PT Serif, serif" font-size="10" fill="#5B4E45">${esc(sub || "好时 · Хаоши")}</text>
    </svg>`;
  }

  function figureHTML(seasonId) {
    const s = D.seasons.find((x) => x.id === seasonId) || S.current;
    return `<div class="fig-art" style="background:${s.color}22">
      <svg viewBox="0 0 200 230"><use href="#panda"/></svg>
      <span class="fig-zh">${s.zh}</span>
    </div>`;
  }

  // ---------- Китайское имя ----------
  function chineseName(raw) {
    const name = raw.trim().toLowerCase().replace(/ё/g, "е");
    const key = raw.trim().toLowerCase();
    const sound = D.names[key] || D.names[name] || null;
    const sur = D.surnames[name[0]] || ["安", "Ān"];
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = D.given.filter((g) => g[0] !== sur[0]);
    const g1 = pool[h % pool.length];
    let g2 = pool[(h >>> 5) % pool.length];
    if (g2[0] === g1[0] || g2[1] === g1[1]) g2 = pool[(pool.indexOf(g1) + 7) % pool.length];
    return {
      input: raw.trim(),
      sound,
      hanzi: sur[0] + g1[0] + g2[0],
      pinyin: `${sur[1]} ${g1[1][0].toUpperCase() + g1[1].slice(1)}${g2[1]}`,
      meaning: `«${g1[2]} и ${g2[2]}»`,
      cupText: sound || (sur[0] + g1[0] + g2[0])
    };
  }

  let profile = store.get("profile", null);

  function renderProfileChip() {
    $("#profileHanzi").textContent = profile ? profile.hanzi[0] : "名";
  }

  // ---------- Главная ----------
  function renderHome() {
    const c = S.current;
    $("#seasonRu").textContent = c.ru;
    $("#seasonPy").textContent = c.py;
    $("#seasonZh").textContent = c.zh;
    const daysLeft = Math.ceil((S.nextDate - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
    $("#countdown").textContent = `⏳ Напиток исчезнет через ${daysLeft} ${plural(daysLeft, "день", "дня", "дней")}`;
    $("#seasonCup").innerHTML = cupSVG(c.color, c.zh, c.ru);
    $("#drinkZh").textContent = c.drinkZh;
    $("#drinkName").textContent = c.drink;
    $("#drinkFact").textContent = c.fact;
    $("#seasonPrice").textContent = rub(c.price);

    const hello = profile ? `你好, ${profile.hanzi}! ` : "你好! Я Хао-Хао. ";
    $("#greeting").textContent = hello + `Сейчас сезон «${c.ru}».`;

    const p = D.phrases[dayOfYear % D.phrases.length];
    $("#phraseZh").textContent = p.zh;
    $("#phrasePy").textContent = p.py;
    $("#phraseRu").textContent = p.ru;

    const n = S.next;
    $("#nextSeason").innerHTML = `<span class="next-zh">${n.zh}</span>
      <div><b>${esc(n.ru)}</b> с ${S.nextDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}<br>
      <span class="muted">${esc(n.drink)}</span></div>`;

    const f = store.get("fortune", null);
    if (f && f.day === todayKey) showFortune(f.i, false);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) { toast("Озвучка не поддерживается в этом браузере"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.8;
    const zhVoice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function showFortune(i, animate) {
    const f = D.fortunes[i];
    const box = $("#fortuneText");
    const tube = $("#fortuneTube");
    const write = () => { box.innerHTML = `<b>${f.level}</b>${esc(f.ru)}. ${esc(f.text)}`; };
    if (animate) {
      tube.classList.remove("shake"); void tube.offsetWidth; tube.classList.add("shake");
      setTimeout(write, 600);
    } else { tube.classList.add("shake"); write(); }
  }

  function drawFortune() {
    const saved = store.get("fortune", null);
    if (saved && saved.day === todayKey) { toast("Новое предсказание будет завтра 🌙"); return; }
    const i = Math.floor(Math.random() * D.fortunes.length);
    store.set("fortune", { day: todayKey, i });
    showFortune(i, true);
  }

  // ---------- Меню и корзина ----------
  const seasonItem = { id: "season-" + S.current.id, cat: "season", name: S.current.drink, zh: S.current.drinkZh, price: S.current.price, badge: "Только до " + S.nextDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), seasonal: true };
  const items = [seasonItem, ...D.menu];
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  const cart = {};
  let currentCat = "season";

  function renderMenu() {
    const list = items.filter((x) => x.cat === currentCat);
    $("#menuList").innerHTML = list.map((x) => `
      <div class="menu-item">
        <div class="mi-zh">${esc(x.zh)}</div>
        <div class="mi-body">
          <div class="mi-name">${esc(x.name)}${x.badge ? `<span class="badge">${esc(x.badge)}</span>` : ""}</div>
          <div class="mi-sub">${rub(x.price)}</div>
        </div>
        <div class="qty">
          ${cart[x.id] ? `<button data-minus="${x.id}" aria-label="Убрать">−</button><span>${cart[x.id]}</span>` : ""}
          <button class="plus" data-plus="${x.id}" aria-label="Добавить">+</button>
        </div>
      </div>`).join("");
  }

  function add(id, delta) {
    cart[id] = (cart[id] || 0) + delta;
    if (cart[id] <= 0) delete cart[id];
    renderMenu();
    renderCartBar();
  }

  function totals() {
    const sum = Object.entries(cart).reduce((s, [id, q]) => s + byId[id].price * q, 0);
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const discount = $("#sayChinese").checked ? Math.round(sum * 0.1) : 0;
    return { sum, count, discount, total: sum - discount };
  }

  function renderCartBar() {
    const t = totals();
    $("#cartBar").classList.toggle("hidden", t.count === 0);
    $("#cartCount").textContent = `${t.count} ${plural(t.count, "позиция", "позиции", "позиций")}`;
    $("#cartTotal").textContent = rub(t.total);
  }

  function openSheet() {
    const t = totals();
    $("#cartItems").innerHTML = Object.entries(cart).map(([id, q]) => {
      const x = byId[id];
      return `<div class="cart-row"><div><span class="cr-zh">${esc(x.zh)}</span> ${esc(x.name)} × ${q}</div><b>${rub(x.price * q)}</b></div>`;
    }).join("");
    $("#sheetTotal").textContent = t.discount ? `${rub(t.total)} (−${rub(t.discount)})` : rub(t.total);
    $("#sheet").classList.remove("hidden");
  }

  function pay() {
    const t = totals();
    const orderNo = "HS-" + String(Math.floor(100 + Math.random() * 900));
    const order = {
      type: "order",
      no: orderNo,
      items: Object.entries(cart).map(([id, q]) => ({ id, name: byId[id].name, zh: byId[id].zh, qty: q, price: byId[id].price })),
      sum: t.sum,
      discount: t.discount,
      total: t.total,
      pickup: Number($("#pickup").value),
      season: S.current.id,
      name: profile ? profile.hanzi : null,
      sayChinese: $("#sayChinese").checked
    };

    // прогресс гостя
    const orders = store.get("orders", 0) + 1;
    store.set("orders", orders);
    const stamps = store.get("stamps", []);
    const gotStamp = order.items.some((x) => byId[x.id].seasonal) && !stamps.includes(S.current.id);
    if (gotStamp) { stamps.push(S.current.id); store.set("stamps", stamps); }
    const figures = store.get("figures", []);
    const gotFigure = orders === 1 || orders % BOX_EVERY === 0;
    if (gotFigure) { figures.push(S.current.id); store.set("figures", figures); }

    // В Telegram (открыто кнопкой клавиатуры) — отправляем заказ боту
    if (inTelegram && !(tg.initDataUnsafe && tg.initDataUnsafe.query_id)) {
      tg.sendData(JSON.stringify(order));
      return;
    }

    $("#sheet").classList.add("hidden");
    $("#orderNo").textContent = orderNo;
    const pickupAt = new Date(Date.now() + order.pickup * 60000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    let text = `Заберите в ${pickupAt}. Итого ${rub(order.total)}.`;
    if (profile) text += ` На стакане будет: ${profile.cupText}.`;
    if (order.sayChinese) text += ` Не забудьте сказать: «${$("#phraseZh").textContent}»!`;
    if (gotStamp) text += " 🔴 Новая печать в паспорте!";
    $("#successText").textContent = text;
    const reveal = $("#reveal");
    if (gotFigure) {
      reveal.innerHTML = `<div class="eyebrow">${orders === 1 ? "Приветственная фигурка" : "Слепая коробка"}</div>${figureHTML(S.current.id)}<div>Панда сезона «${esc(S.current.ru)}»</div>`;
      reveal.classList.remove("hidden");
    } else reveal.classList.add("hidden");
    $("#success").classList.remove("hidden");

    for (const k of Object.keys(cart)) delete cart[k];
    $("#sayChinese").checked = false;
    renderMenu(); renderCartBar(); renderPassport();
  }

  // ---------- Паспорт ----------
  function renderPassport() {
    const stamps = store.get("stamps", []);
    const orders = store.get("orders", 0);
    $("#stamps").innerHTML = D.seasons.map((s) => {
      const cls = stamps.includes(s.id) ? "got" : s.id === S.current.id ? "now" : "";
      return `<div class="stamp ${cls}" title="${esc(s.ru)}">${s.zh}<small>${esc(s.ru)}</small></div>`;
    }).join("");
    const left = BOX_EVERY - (orders % BOX_EVERY);
    $("#boxText").textContent = `Ещё ${left} ${plural(left, "заказ", "заказа", "заказов")} до фигурки`;
    $("#boxBar").style.width = ((orders % BOX_EVERY) / BOX_EVERY * 100) + "%";
    const figures = store.get("figures", []);
    $("#figures").innerHTML = figures.length
      ? figures.map((id) => { const s = D.seasons.find((x) => x.id === id); return `<div class="figure">${figureHTML(id)}${esc(s ? s.ru : "")}</div>`; }).join("")
      : `<div class="muted">Пока пусто — первый заказ принесёт фигурку 🐼</div>`;
  }

  // ---------- Имя ----------
  function renderName(p) {
    $("#nameResult").classList.remove("hidden");
    $("#cupBig").innerHTML = cupSVG(S.current.color, p.cupText, p.input);
    $("#nameSound").textContent = p.sound ? `${p.input} → ${p.sound}` : `${p.input} → уточним у бариста`;
    $("#nameHanzi").textContent = p.hanzi;
    $("#namePy").textContent = p.pinyin;
    $("#nameMeaning").textContent = `Значение: ${p.meaning}`;
  }

  // ---------- Навигация ----------
  function go(view) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    $$(".nav").forEach((n) => n.classList.toggle("active", n.dataset.go === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (inTelegram && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  }

  // ---------- События ----------
  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) return go(goBtn.dataset.go);
    const plus = e.target.closest("[data-plus]");
    if (plus) { add(plus.dataset.plus, 1); if (inTelegram && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); return; }
    const minus = e.target.closest("[data-minus]");
    if (minus) return add(minus.dataset.minus, -1);
    const tab = e.target.closest(".tab");
    if (tab) {
      currentCat = tab.dataset.cat;
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      renderMenu();
    }
  });

  $("#addSeason").addEventListener("click", () => { add(seasonItem.id, 1); toast(`${S.current.drink} — в заказе`); });
  $("#speak").addEventListener("click", () => speak($("#phraseZh").textContent));
  $("#fortuneTube").addEventListener("click", drawFortune);
  $("#fortuneTube").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drawFortune(); } });
  $("#openCart").addEventListener("click", openSheet);
  $("#closeSheet").addEventListener("click", () => $("#sheet").classList.add("hidden"));
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") $("#sheet").classList.add("hidden"); });
  $("#sayChinese").addEventListener("change", () => { openSheet(); renderCartBar(); });
  $("#pay").addEventListener("click", pay);
  $("#closeSuccess").addEventListener("click", () => { $("#success").classList.add("hidden"); go("passport"); });
  $("#speakName").addEventListener("click", () => profile && speak(profile.sound || profile.hanzi));

  $("#nameForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = $("#nameInput").value;
    if (!/[а-яё]/i.test(val)) { toast("Напишите имя кириллицей, например «Алина»"); return; }
    profile = chineseName(val);
    store.set("profile", profile);
    renderName(profile);
    renderProfileChip();
    renderHome();
    toast("Имя сохранено — оно будет на ваших стаканах");
  });

  // ---------- Старт ----------
  if (!profile && inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    $("#nameInput").value = tg.initDataUnsafe.user.first_name || "";
  }
  if (profile) { $("#nameInput").value = profile.input; renderName(profile); }
  renderProfileChip();
  renderHome();
  renderMenu();
  renderCartBar();
  renderPassport();
})();
