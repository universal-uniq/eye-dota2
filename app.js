// ================================================================
// Eye Dota 2 — SPA со всеми вкладками
// ================================================================

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const HERO_CDN = `${CDN}/apps/dota2/images/dota_react/heroes`;
const ITEM_CDN = `${CDN}/apps/dota2/images/dota_react/items`;
const RANK_CDN = 'https://www.opendota.com/assets/images/dota2/rank_icons';

const RANKS = {1:'Herald',2:'Guardian',3:'Crusader',4:'Archon',5:'Legend',6:'Ancient',7:'Divine',8:'Immortal'};
const GAME_MODES = {
  0:'Unknown',1:'All Pick',2:'Captains Mode',3:'Random Draft',4:'Single Draft',
  5:'All Random',16:'Captains Draft',18:'Ability Draft',22:'All Pick (Ranked)',23:'Turbo'
};

// 🔧 URL твоего Cloudflare Worker (обход CORS для Steam API)
const WORKER_BASE = 'https://eye-dota2-proxy.human001user.workers.dev';

const cache = {
  heroMap: {}, heroSlug: {}, heroImg: {}, heroStats: null, items: null,
  leagues: null, _charts: {},
};

// ================================================================
// УТИЛИТЫ
// ================================================================
const $  = (sel, root=document) => (root || document).querySelector(sel);
const $$ = (sel, root=document) => [...((root || document).querySelectorAll(sel) || [])];

function fmtDate(ts){
  if(!ts) return '—';
  return new Date(ts*1000).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDuration(sec){
  if(!sec) return '0:00';
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function rankName(tier){
  if(!tier) return 'Без ранга';
  const star = tier%10, name = RANKS[Math.floor(tier/10)];
  return name ? `${name} ${star}` : 'Без ранга';
}

// 🏅 Иконки рангов — OpenDota CDN (проверенный рабочий источник)
function rankImg(tier){
  if(!tier) return '';
  const medal = Math.floor(tier/10);  // 1..8
  if(medal < 1 || medal > 8) return '';
  return `${RANK_CDN}/rank_icon_${medal}.png`;
}

function heroName(id){ return cache.heroMap[id] || 'Hero #'+id; }
function heroImgUrl(id){
  if(cache.heroImg[id]) return cache.heroImg[id];
  const slug = cache.heroSlug[id];
  return slug ? `${HERO_CDN}/${slug}.png` : '';
}

// 🎒 Иконки предметов — CDN Valve, dota_react/items/<key>.png
// key — это внутренний slug из OpenDota: blink, power_treads, ward_observer, ...
function itemImgUrl(key){
  if(!key) return '';
  const slug = String(key).toLowerCase().replace(/[^a-z0-9_]/g, '');
  if(!slug) return '';
  return `${ITEM_CDN}/${slug}.png`;
}

function esc(s){
  return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function on(el, evt, fn){
  if(el && typeof el.addEventListener === 'function') el.addEventListener(evt, fn);
}

// ================================================================
// STEAM ID КОНВЕРТАЦИЯ
// ================================================================
function steam64To32(steam64){
  try{
    const big = BigInt(steam64);
    const base = 76561197960265728n;
    if(big < base) return null;
    return Number(big - base);
  } catch { return null; }
}
function steam32To64(steam32){
  try{ return (BigInt(steam32) + 76561197960265728n).toString(); }
  catch { return ''; }
}
function extractAccountId(input){
  if(!input) return null;
  const s = String(input).trim();

  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if(m) return steam64To32(m[1]);

  if(/steamcommunity\.com\/id\//.test(s)) return { vanity: s.match(/\/id\/([^\/\?]+)/)[1] };

  m = s.match(/(?:dotabuff|opendota)\.com\/players\/(\d+)/);
  if(m) return Number(m[1]);

  m = s.match(/^(\d+)$/);
  if(m){
    const n = m[1];
    if(n.length >= 17) return steam64To32(n);
    return Number(n);
  }

  return null;
}

// ================================================================
// СПРАВОЧНИКИ
// ================================================================
async function loadHeroMap(){
  if(Object.keys(cache.heroMap).length) return;
  try{
    const arr = await fetch(`${API}/heroes`).then(r=>r.json());
    for(const h of arr){
      cache.heroMap[h.id] = h.localized_name;
      cache.heroSlug[h.id] = (h.name||'').replace('npc_dota_hero_','');
    }
  }catch(e){ console.warn('loadHeroMap', e); }
}
async function loadItems(){
  if(cache.items) return cache.items;
  try{
    cache.items = await fetch(`${API}/constants/items`).then(r=>r.json());
    return cache.items;
  }catch{ return {}; }
}

// ================================================================
// ТЕМА
// ================================================================
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#themeToggle');
  if(btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  if(window.Chart){
    Chart.defaults.color = theme==='dark' ? '#8b949e' : '#6a7383';
    Chart.defaults.borderColor = theme==='dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    Chart.defaults.font.family = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  }
  Object.values(cache._charts).forEach(c => { try{ c.update(); }catch{} });
}
function initTheme(){
  const saved = localStorage.getItem('eye-theme') || 'dark';
  applyTheme(saved);
  const btn = $('#themeToggle');
  on(btn, 'click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('eye-theme', next);
    applyTheme(next);
  });
}

// ================================================================
// РОУТЕР
// ================================================================
const routes = {
  servers: renderServers,
  meta:    renderMeta,
  builds:  renderBuilds,
  leagues: renderLeagues,
  pro:     renderPro,
  player:  renderPlayer,
  compare: renderCompare,
  match:   renderMatch,
};
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '') || 'servers';
  const [route, ...rest] = h.split('/');
  return { route, params: rest };
}
let navigating = false;
async function navigate(){
  if(navigating) return;
  navigating = true;
  try{
    const { route, params } = parseHash();
    const app = $('#app');
    if(!app){ navigating=false; return; }
    app.innerHTML = `<section class="empty-state"><span class="dot loading"></span> Загрузка…</section>`;
    $$('#mainNav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    Object.values(cache._charts).forEach(c => { try{ c.destroy(); }catch{} });
    cache._charts = {};
    const fn = routes[route] || routes.servers;
    try{
      await fn(app, params);
    }catch(e){
      console.error('Route error', route, e);
      app.innerHTML = `<section class="empty-state error">⚠ Ошибка загрузки: ${esc(e.message||e)}</section>`;
    }
  } finally {
    navigating = false;
  }
}

// ================================================================
// СЕРВЕРЫ
// ================================================================
const SERVERS = {
  Europe: [
    { city:'Амстердам', code:'ams', ip:'146.66.155.1' },
    { city:'Франкфурт', code:'fra', ip:'146.66.152.1' },
    { city:'Лондон',    code:'lhr', ip:'146.66.158.1' },
    { city:'Стокгольм', code:'sto', ip:'146.66.157.1' },
    { city:'Варшава',   code:'waw', ip:'155.133.248.1' },
    { city:'Мадрид',    code:'mad', ip:'155.133.254.1' },
  ],
  Americas: [
    { city:'Атланта',      code:'atl', ip:'162.254.192.1' },
    { city:'Чикаго',       code:'ord', ip:'162.254.194.1' },
    { city:'Даллас',       code:'dfw', ip:'162.254.196.1' },
    { city:'Лос-Анджелес', code:'lax', ip:'162.254.199.1' },
    { city:'Сиэтл',        code:'sea', ip:'162.254.197.1' },
    { city:'Сан-Паулу',    code:'gru', ip:'205.196.6.1' },
  ],
  Asia: [
    { city:'Гонконг',  code:'hkg', ip:'155.133.244.1' },
    { city:'Сингапур', code:'sgp', ip:'103.10.124.1' },
    { city:'Сеул',     code:'seo', ip:'175.41.192.1' },
    { city:'Токио',    code:'tyo', ip:'203.104.208.1' },
    { city:'Мумбаи',   code:'bom', ip:'155.133.250.1' },
    { city:'Дубай',    code:'dxb', ip:'185.25.180.1' },
  ],
};

async function checkServer(ip){
  const path = `/ISteamApps/GetServersAtAddress/v1/?addr=${ip}&format=json`;
  const t0 = performance.now();
  try{
    const r = await fetch(`${WORKER_BASE}${path}`);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const ping = Math.round(performance.now() - t0);
    const ok = d?.response?.success && Array.isArray(d.response.servers) && d.response.servers.length > 0;
    return { ok, ping };
  }catch(e){
    return { ok:false, ping:null, error:true, message: e.message };
  }
}

function statusMeta(res){
  if(res.error) return { cls:'bad', label:'нет ответа' };
  if(!res.ok)   return { cls:'warn', label:'ограничен' };
  if(res.ping < 800) return { cls:'ok', label:'работает' };
  if(res.ping < 2500) return { cls:'warn', label:'медленно' };
  return { cls:'warn', label:'нагрузка' };
}

async function renderServers(app){
  app.innerHTML = `
    <h2 class="page-title">Состояние серверов Dota 2</h2>
    <p class="page-sub">Европа · Америка · Азия — обновление каждые 60 секунд</p>
    <div class="status-summary" id="summary">
      <span class="dot loading"></span> Проверяем серверы…
    </div>
    <div class="grid-3" style="margin-top:24px">
      <article class="region"><h3>🇪🇺 Европа</h3><ul class="server-list" id="list-europe"></ul></article>
      <article class="region"><h3>🌎 Америка</h3><ul class="server-list" id="list-americas"></ul></article>
      <article class="region"><h3>🌏 Азия</h3><ul class="server-list" id="list-asia"></ul></article>
    </div>
    <p class="page-sub" style="margin-top:24px;font-size:12px">
      ℹ Запросы идут через Cloudflare Worker (обход CORS Valve).
      Полный live-статус: <a href="https://steamstat.us" target="_blank" rel="noopener">steamstat.us ↗</a>
    </p>
  `;

  for(const rk of Object.keys(SERVERS)){
    const el = $('#list-' + rk.toLowerCase());
    if(!el) continue;
    el.innerHTML = SERVERS[rk].map(s => `
      <li>
        <span class="name">${s.city} <span style="color:var(--muted);font-size:11px">${s.code}</span></span>
        <span class="status">
          <span class="dot loading" data-dot="${s.code}"></span>
          <span data-lbl="${s.code}">…</span>
        </span>
        <span class="ping" data-ping="${s.code}">—</span>
      </li>
    `).join('');
  }

  const refresh = async () => {
    const tasks = [];
    for(const rk of Object.keys(SERVERS)){
      for(const s of SERVERS[rk]){
        tasks.push(checkServer(s.ip).then(res => {
          const dot = $(`[data-dot="${s.code}"]`);
          const lbl = $(`[data-lbl="${s.code}"]`);
          const ping = $(`[data-ping="${s.code}"]`);
          if(!dot) return;
          const m = statusMeta(res);
          dot.className = 'dot ' + m.cls;
          if(lbl) lbl.textContent = m.label;
          if(ping) ping.textContent = res.ping != null ? res.ping + ' мс' : '—';
        }));
      }
    }
    await Promise.allSettled(tasks);

    const dots = $$('.server-list .dot');
    if(!dots.length) return;
    const oks = dots.filter(d => d.classList.contains('ok')).length;
    const warns = dots.filter(d => d.classList.contains('warn')).length;
    const bads = dots.filter(d => d.classList.contains('bad')).length;
    const sm = $('#summary');
    if(!sm) return;
    let cls = 'ok', text = `Все ${dots.length} серверов отвечают`;
    if(oks === 0){ cls='bad'; text='Не удалось получить ответ ни от одного сервера.'; }
    else if(bads > dots.length/3){ cls='bad'; text=`Много проблем: ${bads} недоступны`; }
    else if(bads + warns > 0){ cls='warn'; text=`Стабильно ${oks} · нагрузка/медленно ${warns} · недоступно ${bads}`; }
    sm.innerHTML = `<span class="dot ${cls}"></span> ${text}`;
  };

  await refresh();
  const iv = setInterval(() => {
    if(!document.body.contains($('#summary'))) return clearInterval(iv);
    refresh();
  }, 60_000);
}

// ================================================================
// МЕТА
// ================================================================
async function renderMeta(app){
  app.innerHTML = `
    <h2 class="page-title">Мета патча</h2>
    <p class="page-sub">Топ героев по винрейту и популярности · данные OpenDota</p>
    <div class="filters">
      <label>Ранг:</label>
      <select id="metaBracket">
        <option value="all">Все ранги</option>
        <option value="1">Herald</option>
        <option value="2">Guardian</option>
        <option value="3">Crusader</option>
        <option value="4">Archon</option>
        <option value="5">Legend</option>
        <option value="6">Ancient</option>
        <option value="7">Divine</option>
        <option value="8">Immortal</option>
      </select>
      <label>Сортировка:</label>
      <select id="metaSort">
        <option value="picks">По популярности</option>
        <option value="wr">По винрейту</option>
        <option value="contested">По contested (pro)</option>
      </select>
    </div>
    <div id="metaBody"></div>
  `;

  const heroes = cache.heroStats || await fetch(`${API}/heroStats`).then(r=>r.json());
  cache.heroStats = heroes;

  const renderList = () => {
    const bracket = $('#metaBracket')?.value || 'all';
    const sort = $('#metaSort')?.value || 'picks';
    const picksOf = h => bracket==='all'
      ? ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_pick`]||0),0)
      : (h[`${bracket}_pick`]||0);
    const winsOf = h => bracket==='all'
      ? ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_win`]||0),0)
      : (h[`${bracket}_win`]||0);

    let list = heroes.map(h => ({
      ...h,
      picks: picksOf(h),
      wins: winsOf(h),
      wr: picksOf(h) ? (winsOf(h)/picksOf(h))*100 : 0,
      contested: (h.pro_pick||0) + (h.pro_ban||0),
    }));

    if(sort==='wr')          list = list.filter(h=>h.picks>=100).sort((a,b)=>b.wr-a.wr);
    else if(sort==='contested') list = list.sort((a,b)=>b.contested-a.contested);
    else                     list = list.sort((a,b)=>b.picks-a.picks);

    const top = list.slice(0, 40);
    const body = $('#metaBody');
    if(!body) return;
    body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>Герой</th><th>Атрибут</th><th>Игр</th>
            <th>Побед</th><th>Winrate</th><th>Pro picks</th><th>Pro bans</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((h,i) => {
            const wrCls = h.wr >= 50 ? 'good' : 'bad';
            return `
              <tr>
                <td>${i+1}</td>
                <td><img src="${heroImgUrl(h.id)}" alt="" loading="lazy"/><span>${esc(h.localized_name)}</span></td>
                <td>${esc(h.primary_attr)}</td>
                <td>${h.picks.toLocaleString('ru-RU')}</td>
                <td>${h.wins.toLocaleString('ru-RU')}</td>
                <td class="wr-cell ${wrCls}">${h.wr.toFixed(1)}%</td>
                <td>${h.pro_pick||0}</td>
                <td>${h.pro_ban||0}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  on($('#metaBracket'), 'change', renderList);
  on($('#metaSort'), 'change', renderList);
  renderList();
}

// ================================================================
// СБОРКИ
// ================================================================
async function renderBuilds(app){
  app.innerHTML = `
    <h2 class="page-title">Сборки и популярные предметы</h2>
    <p class="page-sub">Выберите героя — увидим, что чаще всего покупают на разных этапах игры</p>
    <div class="filters">
      <label>Герой:</label>
      <select id="buildHero" style="min-width:220px"><option>Загрузка…</option></select>
    </div>
    <div id="buildBody"><div class="empty-state">Выберите героя</div></div>
  `;

  const heroes = cache.heroStats || await fetch(`${API}/heroStats`).then(r=>r.json());
  cache.heroStats = heroes;
  const sorted = [...heroes].sort((a,b)=>(a.localized_name||'').localeCompare(b.localized_name||'','ru'));

  const sel = $('#buildHero');
  if(sel){
    sel.innerHTML = sorted.map(h => `<option value="${h.id}">${esc(h.localized_name)}</option>`).join('');
  }

  const load = async () => {
    const selNow = $('#buildHero');
    if(!selNow) return;
    const id = selNow.value;
    const body = $('#buildBody');
    if(!body) return;
    body.innerHTML = '<div class="empty-state"><span class="dot loading"></span> Загружаем…</div>';

    try{
      const [pop, items] = await Promise.all([
        fetch(`${API}/heroes/${id}/itemPopularity`).then(r=>r.json()),
        loadItems(),
      ]);

      const renderSection = (title, obj) => {
        if(!obj || !Object.keys(obj).length){
          return `<h3 style="margin-top:24px">${title}</h3><div class="empty-state" style="padding:20px">Нет данных</div>`;
        }
        const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0, 12);
        return `
          <h3 style="margin-top:24px">${title}</h3>
          <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            ${entries.map(([key, count]) => {
              const item = items[key] || { dname: key };
              const url = itemImgUrl(key);
              const display = item.dname || key;
              return `
                <div class="hero-card" style="cursor:default">
                  <div style="aspect-ratio:1;background:var(--bg3);display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden">
                    ${url
                      ? `<img src="${url}" alt="${esc(display)}" loading="lazy"
                             style="width:100%;height:100%;object-fit:contain"
                             onerror="this.style.opacity='0'"/>`
                      : `<span style="font-size:32px;color:var(--muted)">❔</span>`}
                  </div>
                  <div class="name" style="padding:8px 6px 2px;font-size:12px;font-weight:500;line-height:1.2;min-height:32px">${esc(display)}</div>
                  <span class="wr" style="display:block;font-size:11px;color:var(--ok);padding-bottom:8px">× ${count.toLocaleString('ru-RU')}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      };

      body.innerHTML = `
        ${renderSection('🛒 Стартовая закупка', pop.start_game_items)}
        ${renderSection('⚔️ Ранняя игра (0–10 мин, ≥700 золота)', pop.early_game_items)}
        ${renderSection('🛡️ Мид-гейм (10–25 мин, ≥2000 золота)', pop.mid_game_items)}
        ${renderSection('👑 Лейт-гейм (25+ мин, ≥4000 золота)', pop.late_game_items)}
      `;
    }catch(e){
      body.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  };

  on(sel, 'change', load);
  await load();
}

// ================================================================
// ЛИГИ
// ================================================================
async function renderLeagues(app){
  app.innerHTML = `
    <h2 class="page-title">Лиги и турниры</h2>
    <p class="page-sub">Список лиг, по которым есть данные в OpenDota</p>
    <div class="filters">
      <label>Поиск:</label>
      <input id="leagueSearch" type="text" placeholder="Название лиги…" style="flex:1;max-width:320px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg3);color:var(--text);outline:none"/>
    </div>
    <div id="leaguesBody"><div class="empty-state"><span class="dot loading"></span> Загружаем лиги…</div></div>
  `;

  try{
    const leagues = cache.leagues || await fetch(`${API}/leagues`).then(r=>r.json());
    cache.leagues = leagues;
    const sorted = [...leagues].sort((a,b)=>(b.leagueid||0)-(a.leagueid||0));

    const render = (q='') => {
      const body = $('#leaguesBody');
      if(!body) return;
      const ql = q.toLowerCase();
      const filtered = sorted.filter(l => !ql || (l.name||'').toLowerCase().includes(ql));
      const show = filtered.slice(0, 100);
      body.innerHTML = show.length ? `
        <p class="page-sub">Найдено: ${filtered.length.toLocaleString('ru-RU')} · показано ${show.length}</p>
        ${show.map(l => `
          <div class="league-row">
            <div>
              <div class="lname">${esc(l.name||'Без названия')}</div>
              <div class="lmeta">ID ${l.leagueid}${l.tier ? ' · tier: '+esc(l.tier) : ''}</div>
            </div>
            <a href="https://www.opendota.com/leagues/${l.leagueid}" target="_blank" rel="noopener" style="font-size:13px">Матчи ↗</a>
          </div>
        `).join('')}
      ` : '<div class="empty-state">Ничего не найдено</div>';
    };

    on($('#leagueSearch'), 'input', e => render(e.target.value));
    render();
  }catch(e){
    const body = $('#leaguesBody');
    if(body) body.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ПРО-СЦЕНА
// ================================================================
async function renderPro(app){
  app.innerHTML = `
    <h2 class="page-title">Про-сцена</h2>
    <p class="page-sub">Последние матчи про-игроков и профессиональные команды</p>
    <div id="proBody"><div class="empty-state"><span class="dot loading"></span> Загружаем…</div></div>
  `;

  try{
    const [matches, proPlayers] = await Promise.all([
      fetch(`${API}/proMatches`).then(r=>r.json()),
      fetch(`${API}/proPlayers`).then(r=>r.json()),
    ]);

    const teamSet = new Map();
    for(const p of proPlayers){
      if(p.team_id && p.team_name) teamSet.set(p.team_id, p.team_name);
    }
    const topTeams = [...teamSet.entries()].slice(0, 20);

    const body = $('#proBody');
    if(!body) return;
    body.innerHTML = `
      <h3>🔥 Последние про-матчи</h3>
      <div class="matches-list">
        ${matches.slice(0, 20).map(m => {
          const dur = m.duration ? fmtDuration(m.duration) : '—';
          return `
            <a class="match-row ${m.radiant_win?'win':'lose'}" href="#/match/${m.match_id}">
              <div style="font-size:11px;color:var(--muted);text-align:center">
                ${m.radiant_win?'<span style="color:var(--ok);font-weight:700">R</span>':'<span style="color:var(--bad);font-weight:700">D</span>'}
              </div>
              <div class="match-info">
                <span class="hero-name">${esc(m.radiant_name||'Radiant')} vs ${esc(m.dire_name||'Dire')}</span>
                <span class="match-meta">
                  ${esc(m.league_name||'—')} · ${dur} · ${m.radiant_score||0}:${m.dire_score||0}
                </span>
              </div>
              <div class="kda">
                <div class="kda-val">${m.match_id}</div>
                <div class="result">Детали →</div>
              </div>
            </a>
          `;
        }).join('')}
      </div>

      <h3 style="margin-top:36px">🏆 Команды в топе</h3>
      <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
        ${topTeams.map(([id,name]) => `
          <a class="hero-card" href="https://www.opendota.com/teams/${id}" target="_blank" rel="noopener"
             style="padding:14px;text-align:left">
            <div class="name" style="padding:0;font-size:13px">${esc(name)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">team_id ${id}</div>
          </a>
        `).join('')}
      </div>
    `;
  }catch(e){
    const body = $('#proBody');
    if(body) body.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ПРОФИЛЬ ИГРОКА
// ================================================================
async function renderPlayer(app, params){
  const presetId = params?.[0] || '';

  app.innerHTML = `
    <h2 class="page-title">Профиль игрока</h2>
    <p class="page-sub">
      Вставьте account_id, ссылку на Steam, Steam64, Dotabuff или OpenDota — мы сами определим ID.
    </p>
    <form class="search-form" id="playerForm">
      <input id="playerInput" placeholder="например: 88141661 или ссылка на Steam" autocomplete="off" value="${esc(presetId)}"/>
      <button type="submit">Найти</button>
    </form>
    <div class="search-hint">Steam64 автоматически конвертируется в Steam32 (account_id).</div>
    <div class="quick-links">
      <span>Быстрый переход:</span>
      <button data-id="88141661">Dendi</button>
      <button data-id="86745912">Miracle-</button>
      <button data-id="111620041">SumaiL</button>
      <button data-id="132851371">Puppey</button>
      <button data-id="19672354">Arteezy</button>
    </div>
    <div id="playerResult" style="margin-top:24px"></div>
  `;

  const form = $('#playerForm');
  const input = $('#playerInput');
  const result = $('#playerResult');

  async function doSearch(raw){
    const id = extractAccountId(raw);
    if(!id || typeof id === 'object'){
      if(result) result.innerHTML = `<div class="empty-state error">⚠ Не удалось определить account_id. Попробуйте числовой ID.</div>`;
      return;
    }
    await showPlayer(id);
  }

  async function showPlayer(accountId){
    if(result) result.innerHTML = '<div class="empty-state"><span class="dot loading"></span> Загружаем профиль…</div>';
    try{
      const [profile, wl, heroes, matches, totals] = await Promise.all([
        fetch(`${API}/players/${accountId}`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/wl`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/heroes?limit=20`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/matches?limit=20`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/totals`).then(r=>r.json()).catch(()=>[]),
      ]);

      if(!profile?.profile) throw new Error('Игрок не найден или профиль приватный.');

      renderPlayerContent(result, profile, wl, heroes, matches, totals);
      history.replaceState(null, '', `#/player/${accountId}`);
    }catch(e){
      if(result) result.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  }

  on(form, 'submit', e => { e.preventDefault(); doSearch(input?.value || ''); });
  $$('.quick-links button').forEach(b => on(b, 'click', () => {
    if(input) input.value = b.dataset.id;
    doSearch(b.dataset.id);
  }));

  if(presetId) doSearch(presetId);
}

function renderPlayerContent(cont, profile, wl, heroes, matches, totals){
  if(!cont) return;
  const p = profile.profile;
  const rankTier = profile.rank_tier;
  const winrate = (wl.win+wl.lose) ? ((wl.win/(wl.win+wl.lose))*100).toFixed(1) : '—';
  const getTotal = f => { const t = (totals||[]).find(x=>x.field===f); return t ? Math.round(t.sum) : 0; };
  const rImg = rankImg(rankTier);

  cont.innerHTML = `
    <div class="profile-header">
      <img class="avatar" src="${p.avatarfull || ''}" alt="" onerror="this.style.display='none'"/>
      <div class="info">
        <h3>${esc(p.personaname||'Аноним')}</h3>
        <div class="meta">
          <span>ID: ${p.account_id}</span>
          ${p.loccountrycode ? `<span>${esc(p.loccountrycode)}</span>` : ''}
          <a href="https://steamcommunity.com/profiles/${steam32To64(p.account_id)}" target="_blank" rel="noopener">Steam ↗</a>
          <a href="https://www.opendota.com/players/${p.account_id}" target="_blank" rel="noopener">OpenDota ↗</a>
          <a href="https://www.dotabuff.com/players/${p.account_id}" target="_blank" rel="noopener">Dotabuff ↗</a>
          <a href="#/compare/${p.account_id}">Сравнить ⚔</a>
        </div>
      </div>
      ${rImg ? `
        <div class="rank-badge">
          <img src="${rImg}" alt="${esc(rankName(rankTier))}" onerror="this.style.display='none'"/>
          <div class="rank-txt"><b>${esc(rankName(rankTier))}</b>rank tier ${rankTier}</div>
        </div>
      ` : ''}
    </div>

    <div class="stat-grid">
      <div class="stat-card"><span class="val">${(wl.win+wl.lose).toLocaleString('ru-RU')}</span><span class="lbl">матчей</span></div>
      <div class="stat-card"><span class="val green">${wl.win.toLocaleString('ru-RU')}</span><span class="lbl">побед</span></div>
      <div class="stat-card"><span class="val red">${wl.lose.toLocaleString('ru-RU')}</span><span class="lbl">поражений</span></div>
      <div class="stat-card"><span class="val ${parseFloat(winrate)>=50?'green':'red'}">${winrate}%</span><span class="lbl">winrate</span></div>
      <div class="stat-card"><span class="val">${getTotal('kills')}</span><span class="lbl">убийств</span></div>
      <div class="stat-card"><span class="val">${getTotal('deaths')}</span><span class="lbl">смертей</span></div>
      <div class="stat-card"><span class="val">${getTotal('assists')}</span><span class="lbl">ассистов</span></div>
    </div>

    <div class="tabs">
      <button data-tab="matches" class="active">Матчи</button>
      <button data-tab="heroes">Герои</button>
      <button data-tab="charts">📈 Графики</button>
    </div>

    <div class="tab-panel active" id="tab-matches">
      <div class="matches-list">
        ${matches?.length ? matches.map(m => {
          const isRadiant = m.player_slot < 128;
          const won = (m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant);
          return `
            <a class="match-row ${won?'win':'lose'}" href="#/match/${m.match_id}">
              <img class="hero-img" src="${heroImgUrl(m.hero_id)}" alt="" loading="lazy"/>
              <div class="match-info">
                <span class="hero-name">${esc(heroName(m.hero_id))}</span>
                <span class="match-meta">${won?'Победа':'Поражение'} · ${fmtDuration(m.duration)} · ${GAME_MODES[m.game_mode]||'Mode '+m.game_mode} · ${fmtDate(m.start_time)}</span>
              </div>
              <div class="kda">
                <div class="kda-val"><span class="k">${m.kills}</span> / <span class="d">${m.deaths}</span> / ${m.assists}</div>
                <div class="result ${won?'win':'lose'}">${won?'WIN':'LOSE'}</div>
              </div>
            </a>
          `;
        }).join('') : '<div class="empty-state">Нет матчей</div>'}
      </div>
    </div>

    <div class="tab-panel" id="tab-heroes">
      ${heroes?.length ? `
        <table class="data-table">
          <thead><tr><th>Герой</th><th>Игр</th><th>Побед</th><th>Winrate</th></tr></thead>
          <tbody>
            ${heroes.map(h => {
              const wr = h.games ? (h.win/h.games*100) : 0;
              const cls = wr>=50 ? 'good' : 'bad';
              return `
                <tr>
                  <td><img src="${heroImgUrl(h.hero_id)}" alt=""/><span>${esc(heroName(h.hero_id))}</span></td>
                  <td>${h.games}</td>
                  <td>${h.win}</td>
                  <td class="wr-cell ${cls}">${wr.toFixed(1)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state">Нет данных</div>'}
    </div>

    <div class="tab-panel" id="tab-charts">
      <div class="chart-wrap">
        <h3>GPM / XPM за последние матчи</h3>
        <div class="chart-canvas-wrap"><canvas id="chartGpmXpm"></canvas></div>
      </div>
      <div class="chart-wrap">
        <h3>K / D / A по матчам</h3>
        <div class="chart-canvas-wrap"><canvas id="chartKda"></canvas></div>
      </div>
    </div>
  `;

  $$('.tabs button', cont).forEach(btn => on(btn, 'click', () => {
    $$('.tabs button', cont).forEach(b=>b.classList.remove('active'));
    $$('.tab-panel', cont).forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const panel = $('#tab-'+btn.dataset.tab, cont);
    if(panel) panel.classList.add('active');
    if(btn.dataset.tab === 'charts') setTimeout(() => drawCharts(matches), 30);
  }));

  setTimeout(() => drawCharts(matches), 60);
}

function drawCharts(matches){
  if(!window.Chart || !matches?.length) return;
  const sorted = [...matches].filter(m=>m.start_time).sort((a,b)=>a.start_time-b.start_time);
  const labels = sorted.map((_,i) => `#${i+1}`);

  const gpmXpm = $('#chartGpmXpm');
  if(gpmXpm){
    if(cache._charts.gpm){ try{ cache._charts.gpm.destroy(); }catch{} }
    cache._charts.gpm = new Chart(gpmXpm, {
      type:'line',
      data:{
        labels,
        datasets:[
          { label:'GPM', data:sorted.map(m=>m.gold_per_min||0), borderColor:'#e05a3a', backgroundColor:'rgba(224,90,58,.15)', tension:.3, fill:true, pointRadius:2 },
          { label:'XPM', data:sorted.map(m=>m.xp_per_min||0), borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,.15)', tension:.3, fill:true, pointRadius:2 },
        ],
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } } },
    });
  }

  const kda = $('#chartKda');
  if(kda){
    if(cache._charts.kda){ try{ cache._charts.kda.destroy(); }catch{} }
    cache._charts.kda = new Chart(kda, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Kills',   data:sorted.map(m=>m.kills||0),   backgroundColor:'#3fb950' },
          { label:'Deaths',  data:sorted.map(m=>m.deaths||0),  backgroundColor:'#f85149' },
          { label:'Assists', data:sorted.map(m=>m.assists||0), backgroundColor:'#a371f7' },
        ],
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } } },
    });
  }
}

// ================================================================
// СРАВНЕНИЕ
// ================================================================
async function renderCompare(app, params){
  const presetA = params?.[0] || '';
  const presetB = params?.[1] || '';

  app.innerHTML = `
    <h2 class="page-title">Сравнение игроков</h2>
    <p class="page-sub">Введите двух игроков — сравним их статистику side-by-side</p>
    <div class="compare-grid">
      <div class="compare-card">
        <form class="search-form" id="formA" style="margin:0">
          <input id="inputA" placeholder="Игрок A" value="${esc(presetA)}"/>
        </form>
        <div id="cardA" style="margin-top:14px"></div>
      </div>
      <div class="compare-card">
        <form class="search-form" id="formB" style="margin:0">
          <input id="inputB" placeholder="Игрок B" value="${esc(presetB)}"/>
        </form>
        <div id="cardB" style="margin-top:14px"></div>
      </div>
    </div>
    <div id="compareBody"></div>
  `;

  let A = null, B = null;

  async function loadOne(which, raw){
    const id = extractAccountId(raw);
    const card = $(`#card${which}`);
    if(!id || typeof id==='object'){
      if(card) card.innerHTML = '<div class="empty-state error">⚠ Не удалось определить ID</div>';
      return null;
    }
    if(card) card.innerHTML = '<div class="empty-state"><span class="dot loading"></span> Загрузка…</div>';
    try{
      const [profile, wl] = await Promise.all([
        fetch(`${API}/players/${id}`).then(r=>r.json()),
        fetch(`${API}/players/${id}/wl`).then(r=>r.json()),
      ]);
      if(!profile?.profile) throw new Error('Игрок не найден');
      const p = profile.profile;
      const wr = (wl.win+wl.lose) ? (wl.win/(wl.win+wl.lose)*100) : 0;
      const data = { id, profile, wl, wr, rankTier: profile.rank_tier };
      const rImg = rankImg(profile.rank_tier);
      if(card) card.innerHTML = `
        <img src="${p.avatarfull||''}" alt="" onerror="this.style.display='none'"/>
        <h3>${esc(p.personaname||'Аноним')}</h3>
        <div class="meta">ID ${p.account_id} ${p.loccountrycode?'· '+esc(p.loccountrycode):''}</div>
        ${profile.rank_tier ? `
          <div class="meta" style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px">
            ${rImg ? `<img src="${rImg}" alt="" style="width:36px;height:36px;border:none;border-radius:0" onerror="this.style.display='none'"/>` : ''}
            <span>${esc(rankName(profile.rank_tier))}</span>
          </div>
        ` : ''}
      `;
      return data;
    }catch(e){
      if(card) card.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
      return null;
    }
  }

  function renderComparison(){
    const body = $('#compareBody');
    if(!body) return;
    if(!A || !B){
      body.innerHTML = '<div class="empty-state">Введите двух игроков, чтобы увидеть сравнение</div>';
      return;
    }
    const rows = [
      ['Матчей',   A.wl.win+A.wl.lose, B.wl.win+B.wl.lose, 'higher'],
      ['Побед',    A.wl.win,           B.wl.win,           'higher'],
      ['Поражений',A.wl.lose,          B.wl.lose,          'lower'],
      ['Winrate',  A.wr.toFixed(1)+'%',B.wr.toFixed(1)+'%', 'wr'],
      ['Ранг',     rankName(A.rankTier),rankName(B.rankTier), 'rank'],
    ];
    const better = (a, b, mode) => {
      if(mode==='higher') return a>b ? 'l' : (b>a?'r':'');
      if(mode==='lower')  return a<b ? 'l' : (b<a?'r':'');
      if(mode==='wr')     return parseFloat(a)>parseFloat(b) ? 'l' : (parseFloat(b)>parseFloat(a)?'r':'');
      if(mode==='rank')   return (A.rankTier||0)>(B.rankTier||0) ? 'l' : ((B.rankTier||0)>(A.rankTier||0)?'r':'');
      return '';
    };
    body.innerHTML = `
      <div class="compare-stats">
        ${rows.map(([lbl,a,b,mode]) => {
          const win = better(a,b,mode);
          return `
            <div class="compare-row">
              <div class="l ${win==='l'?'better':''}">${esc(String(a))}</div>
              <div class="lbl">${esc(lbl)}</div>
              <div class="r ${win==='r'?'better':''}">${esc(String(b))}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  on($('#formA'), 'submit', async e => {
    e.preventDefault();
    A = await loadOne('A', $('#inputA')?.value || '');
    renderComparison();
  });
  on($('#formB'), 'submit', async e => {
    e.preventDefault();
    B = await loadOne('B', $('#inputB')?.value || '');
    renderComparison();
  });

  if(presetA) A = await loadOne('A', presetA);
  if(presetB) B = await loadOne('B', presetB);
  renderComparison();
}

// ================================================================
// ДЕТАЛИ МАТЧА
// ================================================================
async function renderMatch(app, params){
  const matchId = params?.[0];
  if(!matchId){
    app.innerHTML = '<div class="empty-state error">⚠ Не указан match_id</div>';
    return;
  }

  app.innerHTML = '<div class="empty-state"><span class="dot loading"></span> Загружаем матч…</div>';

  try{
    const m = await fetch(`${API}/matches/${matchId}`).then(r=>r.json());
    if(!m || !m.match_id) throw new Error('Матч не найден или ещё не распарсен');

    const radiantWin = m.radiant_win;
    const players = m.players || [];
    const rad = players.filter(p => p.player_slot < 128);
    const dire = players.filter(p => p.player_slot >= 128);

    const renderTeam = (team, side) => `
      <div class="team-block ${side}">
        <h3>
          <span>${side==='radiant'?'🌿 Radiant':'🔥 Dire'}</span>
          <span class="score">${side==='radiant' ? (m.radiant_score||0) : (m.dire_score||0)}</span>
        </h3>
        ${team.map(p => `
          <div class="player-row">
            <img src="${heroImgUrl(p.hero_id)}" alt=""/>
            <div class="pname">
              ${esc(heroName(p.hero_id))}
              <small>${esc(p.personaname || p.name || 'Игрок')}</small>
            </div>
            <div class="pstat">
              <b>${p.kills||0}</b> / ${p.deaths||0} / ${p.assists||0}<br/>
              <span style="font-size:11px">GPM ${p.gold_per_min||0} · XPM ${p.xp_per_min||0} · LH ${p.last_hits||0}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    app.innerHTML = `
      <a href="#/pro" style="font-size:13px">← Назад</a>
      <h2 class="page-title" style="margin-top:12px">Матч #${m.match_id}</h2>
      <div class="match-header">
        <div style="font-size:20px;font-weight:700">
          <span style="color:var(--ok)">Radiant ${m.radiant_score||0}</span>
          &nbsp;:&nbsp;
          <span style="color:var(--bad)">${m.dire_score||0} Dire</span>
        </div>
        <div class="${radiantWin?'radiant-win':'dire-win'}">
          ${radiantWin?'Победа Radiant':'Победа Dire'}
        </div>
        <div class="match-meta">
          <span>⏱ ${fmtDuration(m.duration||0)}</span>
          <span>📅 ${fmtDate(m.start_time||0)}</span>
          <span>🎮 ${GAME_MODES[m.game_mode]||'Mode '+m.game_mode}</span>
          ${m.league_name ? `<span>🏆 ${esc(m.league_name)}</span>` : ''}
        </div>
      </div>
      <div class="match-teams">
        ${renderTeam(rad, 'radiant')}
        ${renderTeam(dire, 'dire')}
      </div>
      <p style="text-align:center;color:var(--muted);font-size:13px">
        <a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">Открыть на OpenDota ↗</a>
      </p>
    `;
  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================
function boot(){
  initTheme();
  loadHeroMap().catch(()=>{});

  window.addEventListener('hashchange', () => navigate());

  if(!location.hash){
    location.hash = '#/servers';
  } else {
    navigate();
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
