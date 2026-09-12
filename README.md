# 👁 Eye Dota 2

Мини-портал по Dota 2: статус серверов, мета, сборки, лиги, про-сцена,
профиль игрока с графиками GPM/XPM, детали матча, сравнение игроков
и подборка полезных сайтов.

🔗 **Live:** https://universal-uniq.github.io/eye-dota2/

## Вкладки

| Вкладка | Что показывает |
|---|---|
| **Серверы** | Live-статус CM-серверов Valve (если настроен Worker) или ссылка на steamstat.us |
| **Мета** | Топ героев по популярности / винрейту / contested |
| **Сборки** | Предметы по герою на разных этапах игры |
| **Лиги** | Список лиг из OpenDota |
| **Про-сцена** | Свежие про-матчи + топ команд |
| **Профиль** | Игрок: аватар, ранг, матчи, герои, графики |
| **Сравнить** | Side-by-side двух игроков |
| **🔗 Другие сайты** | Полезные ресурсы по Dota 2 |

## Live-режим серверов (опционально)

Valve не отдаёт CORS-заголовки, поэтому прямые запросы к `api.steampowered.com`
браузер блокирует. Чтобы включить live-статус:

1. Поднимите Cloudflare Worker с кодом:

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

2. Скопируйте URL воркера и вставьте в `app.js`:
   ```js
   const WORKER_BASE = 'https://твой-воркер.workers.dev';
   ```

Без Worker сайт работает без live-статуса — покажет ссылку на steamstat.us.

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

Dota 2 © Valve Corporation. Проект не связан с Valve.
