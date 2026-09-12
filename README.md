# 👁 Eye Dota 2

Мини-портал по Dota 2: статус серверов (live), мета патча, сборки, лиги, про-сцена,
профиль игрока с графиками GPM/XPM, детали матча, сравнение двух игроков.

🔗 **Live:** https://universal-uniq.github.io/eye-dota2/

## Возможности

| Вкладка | Что показывает |
|---|---|
| **Серверы** | Live-статус Connection Manager (CM) серверов Valve по регионам через `GetCMListForConnect` |
| **Мета** | Топ героев по популярности / винрейту / contested, фильтр по рангам |
| **Сборки** | Item popularity по герою: старт, ранняя, мид, лейт игра |
| **Лиги** | Список лиг из OpenDota с поиском |
| **Про-сцена** | Последние про-матчи + топ команд |
| **Профиль** | Игрок: аватар, ранг-медаль, статы, матчи, герои, 📈 графики Chart.js |
| **Сравнить** | Side-by-side двух игроков |

## Источники картинок

| Что | URL |
|---|---|
| **Герои** | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<slug>.png` |
| **Предметы** | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/<slug>.png` |
| **Ранги** | `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_<N>.png` (N = 1..8) |

## Как работает live-статус серверов

Вкладка «Серверы» использует официальный метод Steam:
```
https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=<N>&format=json
```

`cellid` — идентификатор региона:
- **1** = US East (Атланта, Стерлинг)
- **2** = US West (Сиэтл, Лос-Анджелес)
- **3** = EU (Франкфурт, Амстердам, Лондон)
- **5** = Азия (Сеул, Токио, Сингапур)

Это **тот же источник**, что использует клиент Steam и steamstat.us. Метод возвращает реальные адреса CM-серверов и их текущую нагрузку.

## Архитектура

- **Фронтенд** — статика, GitHub Pages.
- **Прокси** — Cloudflare Worker `eye-dota2-proxy.human001user.workers.dev`.
- **Данные** — OpenDota API + Steam Web API.
- **Графики** — Chart.js.

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

Код воркера обходит CORS для `api.steampowered.com`. Если нужен полный код — см. предыдущие версии или напишите.

Dota 2 © Valve Corporation. Проект не связан с Valve.
