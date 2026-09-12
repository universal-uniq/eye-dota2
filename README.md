# 👁 Eye Dota 2

Мини-портал по Dota 2: статус серверов, мета патча, сборки, лиги, про-сцена,
профиль игрока с графиками GPM/XPM, детали матча, сравнение двух игроков.

🔗 **Live:** https://universal-uniq.github.io/eye-dota2/

## Возможности

| Вкладка | Что показывает |
|---|---|
| **Серверы** | Live-статус дата-центров Valve в EU / US / Asia (через Cloudflare Worker) |
| **Мета** | Топ героев по популярности / винрейту / contested, фильтр по рангам |
| **Сборки** | Item popularity по герою: старт, ранняя, мид, лейт игра |
| **Лиги** | Список лиг из OpenDota с поиском |
| **Про-сцена** | Последние про-матчи + топ команд |
| **Профиль** | Игрок: аватар, ранг-медаль, статы, матчи, герои, 📈 графики Chart.js |
| **Сравнить** | Side-by-side двух игроков |

## Источники картинок (все проверены)

| Что | URL |
|---|---|
| **Герои** | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<slug>.png` |
| **Предметы** | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/<slug>.png` |
| **Ранги** | `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_<N>.png` (N = 1..8) |

## Архитектура

- **Фронтенд** — статика (HTML/CSS/JS), хостится на GitHub Pages.
- **Прокси** — Cloudflare Worker `eye-dota2-proxy.human001user.workers.dev` — обходит CORS для `api.steampowered.com`.
- **Данные** — OpenDota API.
- **Графики** — Chart.js через CDN.

## Локальный запуск

```bash
python -m http.server 8000
```

Открывайте **http://localhost:8000/**.

## Деплой на GitHub Pages

1. Залейте `index.html`, `style.css`, `app.js`, `README.md`.
2. `Settings → Pages → Source: Deploy from a branch → main / (root)`.
3. Открывайте https://universal-uniq.github.io/eye-dota2/

## Cloudflare Worker

**URL:** `https://eye-dota2-proxy.human001user.workers.dev`

**Код воркера:**

```js
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }
    const url = new URL(request.url);
    const target = 'https://api.steampowered.com' + url.pathname + url.search;
    try {
      const r = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EyeDota2/1.0)',
          'Accept': 'application/json',
        },
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    }
  },
};
```

## API

- OpenDota (`api.opendota.com`) — отдаёт `Access-Control-Allow-Origin: *`, работает напрямую.
- Steam Web API (`api.steampowered.com`) — CORS не поддерживает, идём через воркер.

Dota 2 © Valve Corporation. Проект не связан с Valve.
