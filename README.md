# 👁 Eye Dota 2

Мини-портал по Dota 2: статус серверов, мета, сборки, лиги, про-сцена,
профиль игрока с графиками GPM/XPM, детали матча, сравнение игроков
и подборка полезных сайтов.

🔗 **Live:** https://universal-uniq.github.io/eye-dota2/

## Вкладки

| Вкладка | Что показывает |
|---|---|
| **Серверы** | Live-статус CM-серверов Valve (через Worker или публичные прокси) |
| **Мета** | Топ героев по популярности / винрейту / contested |
| **Сборки** | Предметы по герою на разных этапах игры |
| **Лиги** | Список лиг из OpenDota |
| **Про-сцена** | Свежие про-матчи + топ команд |
| **Профиль** | Игрок: аватар, ранг, матчи, герои, графики |
| **Сравнить** | Side-by-side двух игроков |
| **🔗 Другие сайты** | Полезные ресурсы по Dota 2 |

## Как работают «Серверы» для всех посетителей

Сайт использует **гибридную схему**:

1. **Основной источник** — Cloudflare Worker `eye-dota2-proxy.human001user.workers.dev`.
   Он обходит CORS и отдаёт данные от `api.steampowered.com`.
2. **Fallback 1** — `corsproxy.io` (публичный CORS-прокси).
3. **Fallback 2** — `allorigins.win` (публичный CORS-прокси).
4. Если все три недоступны — показывается ссылка на steamstat.us.

Посетителям **не нужно ничего настраивать** — всё работает из коробки.

## Источники картинок

| Что | URL |
|---|---|
| Герои | `cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<slug>.png` |
| Предметы | `cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/<slug>.png` |
| Ранги | `www.opendota.com/assets/images/dota2/rank_icons/rank_icon_<N>.png` |

## Локальный запуск

```bash
python -m http.server 8000
```

Открывайте **http://localhost:8000/**.

## Деплой

1. Залейте `index.html`, `style.css`, `app.js`, `README.md`.
2. `Settings → Pages → Source: Deploy from a branch → main / (root)`.
3. Открывайте https://universal-uniq.github.io/eye-dota2/

## Как обновить Worker (если понадобится)

Если ты создашь **новый** Cloudflare Worker — вставь его URL в `app.js`:

```js
const WORKER_BASE = 'https://твой-воркер.workers.dev';
```

Код воркера:

```js
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }});
    }
    const url = new URL(request.url);
    const target = 'https://api.steampowered.com' + url.pathname + url.search;
    try {
      const r = await fetch(target, { headers: { 'Accept': 'application/json' } });
      return new Response(await r.text(), {
        status: r.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Vary': 'Origin',
          'Cache-Control': 'no-store',
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      });
    }
  },
};
```

Dota 2 © Valve Corporation. Проект не связан с Valve.
