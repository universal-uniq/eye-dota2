// ================================================================
// Eye Dota 2 — SPA со всеми вкладками
// ================================================================

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const HERO_CDN = `${CDN}/apps/dota2/images/dota_react/heroes`;
const RANK_CDN = 'https://www.opendota.com/assets/images/dota2/rank_icons';

const RANKS = {1:'Herald',2:'Guardian',3:'Crusader',4:'Archon',5:'Legend',6:'Ancient',7:'Divine',8:'Immortal'};
const GAME_MODES = {
  0:'Unknown',1:'All Pick',2:'Captains Mode',3:'Random Draft',4:'Single Draft',
  5:'All Random',16:'Captains Draft',18:'Ability Draft',22:'All Pick (Ranked)',23:'Turbo'
};

const WORKER_BASE = 'https://eye-dota2-proxy.human001user.workers.dev';

const PUBLIC_PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const cache = {
  heroMap: {}, heroSlug: {}, heroImg: {}, heroStats: null, items: null,
  itemById: {},
  patches: null,
  leagues: null, _charts: {},
};

// ================================================================
// УТИЛИТЫ
// ================================================================
const $  = (sel, root=document) => (root || document).querySelector(sel);
const $$ = (sel, root=document) => [...((root || document).querySelectorAll(sel) || [])];

function fmtDate(ts){
  if(!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts*1000 : ts);
  return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateOnly(ts){
  if(!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts*1000 : ts);
  return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
}
function fmtDuration(sec){
  if(!sec) return '0:00';
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function rankName(tier){
  if(!tier) return '—';
  const star = tier%10, name = RANKS[Math.floor(tier/10)];
  return name ? `${name} ${star}` : '—';
}
function rankImg(tier){
  if(!tier) return '';
  const medal = Math.floor(tier/10);
  if(medal < 1 || medal > 8) return '';
  return `${RANK_CDN}/rank_icon_${medal}.png`;
}
function heroName(id){ return cache.heroMap[id] || 'Hero #'+id; }
function heroImgUrl(id){
  if(cache.heroImg[id]) return cache.heroImg[id];
  const slug = cache.heroSlug[id];
  return slug ? `${HERO_CDN}/${slug}.png` : '';
}

function itemImgCandidates(item, slug){
  const urls = [];
  const cleanSlug = (slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if(item && item.img){
    const path = item.img;
    const full = path.startsWith('http') ? path : `${CDN}${path}`;
    urls.push(full);
  }
  if(cleanSlug) urls.push(`${CDN}/apps/dota2/images/dota_react/items/${cleanSlug}.png`);
  if(cleanSlug) urls.push(`${CDN}/apps/dota2/images/items/${cleanSlug}_lg.png`);
  return [...new Set(urls)].filter(Boolean);
}

function esc(s){
  return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function on(el, evt, fn){
  if(el && typeof el.addEventListener === 'function') el.addEventListener(evt, fn);
}

// ================================================================
// ПЕРЕБОР ИСТОЧНИКОВ КАРТИНОК ПРЕДМЕТОВ
// ================================================================
window.__tryNextImg = function(img){
  const raw = img.getAttribute('data-srcs');
  if(!raw){ img.style.opacity = '0'; return; }
  let list;
  try { list = JSON.parse(raw); } catch { list = []; }

  const current = img.src;
  const idx = list.findIndex(u => u === current || current.endsWith(u.split('/').pop()));
  const nextIdx = idx >= 0 ? idx + 1 : 0;

  if(nextIdx < list.length){
    img.src = list[nextIdx];
  } else {
    img.style.display = 'none';
    const ph = img.parentElement?.querySelector('.ph');
    if(ph) ph.hidden = false;
  }
};

function initItemImages(){
  document.querySelectorAll('.item-card img[data-srcs]').forEach(img => {
    if(img.src) return;
    let list;
    try { list = JSON.parse(img.getAttribute('data-srcs')); } catch { list = []; }
    if(list.length){
      img.src = list[0];
    } else {
      img.style.display = 'none';
      const ph = img.parentElement?.querySelector('.ph');
      if(ph) ph.hidden = false;
    }
  });
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
    const items = await fetch(`${API}/constants/items`).then(r=>r.json());
    cache.items = items;
    cache.itemById = {};
    for(const [slug, data] of Object.entries(items)){
      if(data && typeof data === 'object' && data.id != null){
        cache.itemById[String(data.id)] = slug;
      }
    }
    console.log('[loadItems] items:', Object.keys(items).length, '· map:', Object.keys(cache.itemById).length);
    return items;
  }catch(e){
    console.error('loadItems', e);
    return {};
  }
}
async function loadPatches(){
  if(cache.patches) return cache.patches;
  try{
    cache.patches = await fetch(`${API}/constants/patch`).then(r=>r.json());
    return cache.patches;
  }catch{ return []; }
}

// ================================================================
// ЯЗЫК
// ================================================================
function initLang(){
  const saved = localStorage.getItem('eye-lang') || 'ru';
  window.setLang(saved);
  const btn = $('#langToggle');
  on(btn, 'click', () => {
    const next = (window.__lang === 'ru') ? 'en' : 'ru';
    window.setLang(next);
  });
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
    Chart.defaults.animation = false;
  }
  Object.values(cache._charts).forEach(c => { try{ c.update('none'); }catch{} });
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
  heroes:  renderHeroes,
  hero:    renderHeroPage,
  patch:   renderPatch,
  stats:   renderStats,
  leaderboard: renderLeaderboard,
  leagues: renderLeagues,
  pro:     renderPro,
  player:  renderPlayer,
  compare: renderCompare,
  match:   renderMatch,
  sites:   renderSites,
};
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '') || 'servers';
  const [route, ...rest] = h.split('/');
  return { route, params: rest };
}

window.__rerender = function(){ navigate(); };

let navigating = false;
async function navigate(){
  if(navigating) return;
  navigating = true;
  try{
    Object.values(cache._charts).forEach(c => { try{ c.destroy(); }catch{} });
    cache._charts = {};

    const { route, params } = parseHash();
    const app = $('#app');
    if(!app){ navigating=false; return; }
    app.innerHTML = `<section class="empty-state"><span class="dot loading"></span> ${t('loading')}</section>`;
    $$('#mainNav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));

    const fn = routes[route] || routes.servers;
    try{
      await fn(app, params);
    }catch(e){
      console.error('Route error', route, e);
      app.innerHTML = `<section class="empty-state error">⚠ ${t('error')}: ${esc(e.message||e)}</section>`;
    }
  } finally {
    navigating = false;
  }
}

// ================================================================
// СЕРВЕРЫ
// ================================================================
const REGIONS = [
  { name: '🇪🇺 Европа',  cellid: 3 },
  { name: '🌎 Америка', cellid: 1 },
  { name: '🌏 Азия',    cellid: 5 },
];

function extractEndpoint(entry){
  if(typeof entry === 'string') return entry;
  if(entry && typeof entry === 'object'){
    return entry.endpoint || entry.legacy_endpoint || entry.hostname || '';
  }
  return '';
}

async function fetchSteam(path){
  const steamUrl = `https://api.steampowered.com${path}`;
  const errors = [];

  if(WORKER_BASE){
    try{
      const r = await fetch(`${WORKER_BASE}${path}`);
      if(r.ok) return await r.json();
      errors.push(`Worker HTTP ${r.status}`);
    }catch(e){ errors.push(`Worker ${e.message}`); }
  }

  for(const build of PUBLIC_PROXIES){
    try{
      const r = await fetch(build(steamUrl), { headers: { 'Accept': 'application/json' } });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      return JSON.parse(text);
    }catch(e){ errors.push(`Proxy ${e.message}`); }
  }

  throw new Error(errors.join(' | '));
}

async function checkRegion(cellid){
  const path = `/ISteamDirectory/GetCMListForConnect/v1/?cellid=${cellid}&format=json`;
  const t0 = performance.now();
  try{
    const d = await fetchSteam(path);
    const ping = Math.round(performance.now() - t0);
    const raw = Array.isArray(d?.response?.serverlist) ? d.response.serverlist : [];
    const servers = raw.map(extractEndpoint).filter(s => typeof s === 'string' && s.length > 0);
    return { ok: servers.length > 0, total: raw.length, alive: servers.length, servers, ping };
  }catch(e){
    return { ok: false, error: true, message: e.message, servers: [] };
  }
}

async function renderServers(app){
  app.innerHTML = `
    <h2 class="page-title">Состояние серверов Dota 2</h2>
    <p class="page-sub">
      Live-статус Connection Manager (CM) серверов Valve по регионам.<br>
      <span style="font-size:12px">
        ℹ Источник: официальный метод <code>GetCMListForConnect</code>.
        Полный live-статус: <a href="https://steamstat.us" target="_blank" rel="noopener">steamstat.us ↗</a>
      </span>
    </p>
    <div class="status-summary" id="summary">
      <span class="dot loading"></span> ${t('loading')}
    </div>
    <div class="grid-3" style="margin-top:24px">
      ${REGIONS.map(r => `
        <article class="region" id="region-${r.cellid}">
          <h3>${r.name}</h3>
          <div class="region-status"><span class="dot loading"></span> ${t('loading')}</div>
          <ul class="server-list" id="list-${r.cellid}"></ul>
        </article>
      `).join('')}
    </div>
  `;

  const refresh = async () => {
    let totalAlive = 0, totalServers = 0, failedRegions = 0;

    for(const region of REGIONS){
      const res = await checkRegion(region.cellid);
      const listEl = $(`#list-${region.cellid}`);
      const regionEl = $(`#region-${region.cellid}`);
      const statusEl = regionEl?.querySelector('.region-status');

      if(res.error){
        failedRegions++;
        if(statusEl) statusEl.innerHTML = `<span class="dot bad"></span> ${t('error')}`;
        if(listEl) listEl.innerHTML = '';
        continue;
      }

      totalAlive += res.alive;
      totalServers += res.total;

      if(statusEl){
        statusEl.innerHTML = res.alive > 0
          ? `<span class="dot ok"></span> <b>${res.alive}</b> online · ${res.ping} мс`
          : `<span class="dot warn"></span> ${t('no_data')}`;
      }

      if(listEl){
        const list = res.servers.slice(0, 8);
        listEl.innerHTML = list.length
          ? list.map(addr => `<li><span class="name">${esc(addr)}</span></li>`).join('')
          : `<li><span class="name" style="opacity:.6">— ${t('no_data')} —</span></li>`;
        if(res.servers.length > list.length){
          listEl.innerHTML += `<li style="text-align:center;color:var(--muted);font-size:11px">…+${res.servers.length - list.length}</li>`;
        }
      }
    }

    const sm = $('#summary');
    if(!sm) return;

    if(totalServers === 0 && failedRegions === REGIONS.length){
      sm.innerHTML = `<span class="dot bad"></span> ${t('error')}. <a href="https://steamstat.us" target="_blank" rel="noopener">steamstat.us</a>`;
    } else if(totalServers === 0){
      sm.innerHTML = `<span class="dot warn"></span> ${t('no_data')}`;
    } else {
      sm.innerHTML = `<span class="dot ok"></span> ${totalServers} серверов · активных: <b>${totalAlive}</b>`;
    }
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
    <h2 class="page-title">${t('nav_meta')}</h2>
    <p class="page-sub">${t('heroes_sub')} · OpenDota</p>
    <div class="filters">
      <label for="metaBracket">Ранг:</label>
      <select id="metaBracket">
        <option value="all">Все</option>
        <option value="1">Herald</option>
        <option value="2">Guardian</option>
        <option value="3">Crusader</option>
        <option value="4">Archon</option>
        <option value="5">Legend</option>
        <option value="6">Ancient</option>
        <option value="7">Divine</option>
        <option value="8">Immortal</option>
      </select>
      <label for="metaSort">Сортировка:</label>
      <select id="metaSort">
        <option value="picks">По популярности</option>
        <option value="wr">По винрейту</option>
        <option value="contested">По contested</option>
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
            <th>#</th><th>${t('hero')}</th><th>${t('attribute')}</th><th>${t('games')}</th>
            <th>${t('wins')}</th><th>${t('winrate')}</th><th>Pro picks</th><th>Pro bans</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((h,i) => {
            const wrCls = h.wr >= 50 ? 'good' : 'bad';
            return `
              <tr>
                <td>${i+1}</td>
                <td><a href="#/hero/${h.id}"><img src="${heroImgUrl(h.id)}" alt="" loading="lazy"/><span>${esc(h.localized_name)}</span></a></td>
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
    <h2 class="page-title">${t('builds_title')}</h2>
    <p class="page-sub">${t('builds_sub')}</p>
    <div class="filters">
      <label for="buildHero">${t('hero')}:</label>
      <select id="buildHero" style="min-width:220px"><option>${t('loading')}</option></select>
    </div>
    <div id="buildBody"><div class="empty-state">${t('no_data')}</div></div>
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
    body.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

    try{
      const [pop, items] = await Promise.all([
        fetch(`${API}/heroes/${id}/itemPopularity`).then(r=>r.json()),
        loadItems(),
      ]);

      const renderSection = (title, obj) => {
        if(!obj || !Object.keys(obj).length){
          return `<h3 style="margin-top:24px">${title}</h3><div class="empty-state" style="padding:20px">${t('no_data')}</div>`;
        }
        const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0, 12);
        return `
          <h3 style="margin-top:24px">${title}</h3>
          <div class="item-grid">
            ${entries.map(([rawKey, count]) => {
              const slug = cache.itemById[String(rawKey)] || rawKey;
              const itemData = items[slug] || {};
              const urls = itemImgCandidates(itemData, slug);
              const display = itemData.dname || slug;
              return `
                <div class="item-card" title="${esc(display)}">
                  <div class="img-wrap">
                    <img data-srcs='${JSON.stringify(urls)}' alt="${esc(display)}"
                         onerror="window.__tryNextImg && window.__tryNextImg(this)"/>
                    <span class="ph" hidden>❔</span>
                  </div>
                  <div class="item-name">${esc(display)}</div>
                  <span class="item-count">× ${count.toLocaleString('ru-RU')}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      };

      body.innerHTML = `
        ${renderSection(t('build_start'), pop.start_game_items)}
        ${renderSection(t('build_early'), pop.early_game_items)}
        ${renderSection(t('build_mid'), pop.mid_game_items)}
        ${renderSection(t('build_late'), pop.late_game_items)}
      `;

      setTimeout(initItemImages, 0);
    }catch(e){
      body.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  };

  on(sel, 'change', load);
  await load();
}

// ================================================================
// ГЕРОИ — поиск и список
// ================================================================
async function renderHeroes(app){
  const heroes = cache.heroStats || await fetch(`${API}/heroStats`).then(r=>r.json());
  cache.heroStats = heroes;

  app.innerHTML = `
    <h2 class="page-title">${t('heroes_title')}</h2>
    <p class="page-sub">${t('heroes_sub')}</p>
    <div class="filters" style="margin-bottom:20px">
      <label for="heroSearch">${t('search')}:</label>
      <input id="heroSearch" type="text" placeholder="${t('heroes_search')}"
             style="flex:1;max-width:420px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg3);color:var(--text);outline:none"/>
    </div>
    <div id="heroesBody"></div>
  `;

  const renderHeroesList = (query='') => {
    const q = query.toLowerCase().trim();
    const filtered = heroes.filter(h => !q ||
      (h.localized_name||'').toLowerCase().includes(q) ||
      (h.name||'').toLowerCase().includes(q)
    );

    const body = $('#heroesBody');
    if(!body) return;

    if(!filtered.length){
      body.innerHTML = `<div class="empty-state">${t('heroes_no_results')}</div>`;
      return;
    }

    body.innerHTML = `
      <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${filtered.map(h => {
          const img = heroImgUrl(h.id);
          return `
            <a class="hero-card" href="#/hero/${h.id}">
              <img src="${img}" alt="${esc(h.localized_name)}" loading="lazy"/>
              <div class="name">${esc(h.localized_name)}</div>
              <span class="wr">${esc(h.primary_attr)} · ${esc(h.attack_type)}</span>
            </a>
          `;
        }).join('')}
      </div>
    `;
  };

  on($('#heroSearch'), 'input', e => renderHeroesList(e.target.value));
  renderHeroesList();
}

// ================================================================
// HERO-PAGE
// ================================================================
async function renderHeroPage(app, params){
  const heroId = Number(params?.[0]);
  if(!heroId){
    app.innerHTML = `<div class="empty-state error">${t('not_found')}</div>`;
    return;
  }

  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const [heroStats, matchups, durations, players, itemPop] = await Promise.all([
      cache.heroStats ? Promise.resolve(cache.heroStats) : fetch(`${API}/heroStats`).then(r=>r.json()),
      fetch(`${API}/heroes/${heroId}/matchups`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/heroes/${heroId}/durations`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/heroes/${heroId}/players`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/heroes/${heroId}/itemPopularity`).then(r=>r.json()).catch(()=>({})),
    ]);

    cache.heroStats = heroStats;
    const hero = heroStats.find(h => h.id === heroId);
    if(!hero) throw new Error(t('not_found'));

    const items = await loadItems();
    const itemsObj = itemPop || {};

    // Топ контр-пиков — герои, которые чаще всего выигрывают против нас
    const topMatchups = [...matchups]
      .filter(m => m.games_played >= 20)
      .map(m => ({...m, wr: (m.wins / m.games_played) * 100}))
      .sort((a,b) => b.wr - a.wr)
      .slice(0, 8);

    // Топ-игроков на герое (по количеству матчей)
    const topPlayers = [...(Array.isArray(players) ? players : [])]
      .sort((a,b) => (b.games||0) - (a.games||0))
      .slice(0, 10);

    // Сборка
    const renderItemsRow = (obj) => {
      if(!obj || !Object.keys(obj).length) return `<div class="empty-state" style="padding:12px;font-size:12px">${t('no_data')}</div>`;
      const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0, 8);
      return `<div class="item-grid">${entries.map(([rawKey, count]) => {
        const slug = cache.itemById[String(rawKey)] || rawKey;
        const itemData = items[slug] || {};
        const urls = itemImgCandidates(itemData, slug);
        const display = itemData.dname || slug;
        return `
          <div class="item-card" title="${esc(display)}">
            <div class="img-wrap">
              <img data-srcs='${JSON.stringify(urls)}' alt="${esc(display)}"
                   onerror="window.__tryNextImg && window.__tryNextImg(this)"/>
              <span class="ph" hidden>❔</span>
            </div>
            <div class="item-name">${esc(display)}</div>
            <span class="item-count">× ${count.toLocaleString('ru-RU')}</span>
          </div>`;
      }).join('')}</div>`;
    };

    // Позиции — считаем по lane_role
    const laneRoles = {1:'Safe Lane',2:'Mid',3:'Off Lane',4:'Jungle'};
    const positions = Object.entries(hero).reduce((acc, [k,v]) => {
      const m = k.match(/^(\d)_pick$/);
      if(m) acc[m[1]] = (acc[m[1]]||0) + (v||0);
      return acc;
    }, {});
    const topPositions = Object.entries(positions)
      .sort((a,b) => b[1]-a[1]).slice(0, 3);

    app.innerHTML = `
      <div class="profile-header">
        <img class="avatar" style="border-radius:14px;width:110px;height:110px" src="${heroImgUrl(heroId)}" alt=""/>
        <div class="info">
          <h3>${esc(hero.localized_name)}</h3>
          <div class="meta">
            <span>${esc(hero.primary_attr)}</span>
            <span>${esc(hero.attack_type)}</span>
            <span>${(hero.roles||[]).join(' · ')}</span>
          </div>
          <div class="meta" style="margin-top:8px">
            <a href="https://www.opendota.com/heroes/${heroId}" target="_blank" rel="noopener">${t('hero_open_opendota')}</a>
            <a href="https://dota2protracker.com/hero/${(hero.name||'').replace('npc_dota_hero_','')}" target="_blank" rel="noopener">Dota2ProTracker ↗</a>
          </div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><span class="val">${(hero['1_pick']+hero['2_pick']+hero['3_pick']+hero['4_pick']+hero['5_pick']+hero['6_pick']+hero['7_pick']+hero['8_pick']||0).toLocaleString('ru-RU')}</span><span class="lbl">${t('picks')}</span></div>
        <div class="stat-card"><span class="val green">${hero.pro_win||0}</span><span class="lbl">pro ${t('wins')}</span></div>
        <div class="stat-card"><span class="val red">${hero.pro_ban||0}</span><span class="lbl">pro ${t('bans')}</span></div>
        <div class="stat-card"><span class="val">${hero.base_health||0}</span><span class="lbl">HP</span></div>
        <div class="stat-card"><span class="val">${hero.base_attack_min||0}–${hero.base_attack_max||0}</span><span class="lbl">Атака</span></div>
        <div class="stat-card"><span class="val">${hero.move_speed||0}</span><span class="lbl">Скорость</span></div>
        <div class="stat-card"><span class="val">${hero.base_armor||0}</span><span class="lbl">Броня</span></div>
      </div>

      <h3 style="margin-top:32px">🎯 ${t('heroes_matchups')}</h3>
      <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${topMatchups.length ? topMatchups.map(m => `
          <a class="hero-card" href="#/hero/${m.hero_id}">
            <img src="${heroImgUrl(m.hero_id)}" alt=""/>
            <div class="name">${esc(heroName(m.hero_id))}</div>
            <span class="wr ${m.wr >= 55 ? '' : 'bad'}">${m.wr.toFixed(1)}% · ${m.games_played} ${t('games')}</span>
          </a>
        `).join('') : `<div class="empty-state">${t('no_data')}</div>`}
      </div>

      <h3 style="margin-top:32px">📊 ${t('hero_stats')}</h3>
      <div class="stat-grid">
        <div class="stat-card"><span class="val">${topPositions.map(([p,n])=>`${laneRoles[p]||p}: ${n}`).join(' · ')||'—'}</span><span class="lbl">${t('heroes_positions')}</span></div>
      </div>

      <h3 style="margin-top:32px">🛒 ${t('hero_avg_build')}</h3>
      <h4 style="margin-top:14px;font-size:13px;color:var(--muted)">${t('build_start')}</h4>
      ${renderItemsRow(itemsObj.start_game_items)}
      <h4 style="margin-top:14px;font-size:13px;color:var(--muted)">${t('build_early')}</h4>
      ${renderItemsRow(itemsObj.early_game_items)}
      <h4 style="margin-top:14px;font-size:13px;color:var(--muted)">${t('build_mid')}</h4>
      ${renderItemsRow(itemsObj.mid_game_items)}
      <h4 style="margin-top:14px;font-size:13px;color:var(--muted)">${t('build_late')}</h4>
      ${renderItemsRow(itemsObj.late_game_items)}

      <h3 style="margin-top:32px">🏆 ${t('hero_pro_players')}</h3>
      <table class="data-table">
        <thead><tr><th>#</th><th>${t('leaderboard_name')}</th><th>${t('games')}</th><th>${t('wins')}</th></tr></thead>
        <tbody>
          ${topPlayers.length ? topPlayers.map((p,i) => `
            <tr>
              <td>${i+1}</td>
              <td><a href="#/player/${p.account_id}">${esc(p.personaname || p.name || 'Player '+p.account_id)}</a></td>
              <td>${(p.games||0).toLocaleString('ru-RU')}</td>
              <td>${(p.win||0).toLocaleString('ru-RU')}</td>
            </tr>
          `).join('') : `<tr><td colspan="4"><div class="empty-state">${t('no_data')}</div></td></tr>`}
        </tbody>
      </table>

      <h3 style="margin-top:32px">⏱ ${t('hero_durations')}</h3>
      <div class="chart-wrap">
        <div class="chart-canvas-wrap"><canvas id="chartHeroDur"></canvas></div>
      </div>
    `;

    // График длительности
    setTimeout(() => {
      const canvas = $('#chartHeroDur');
      if(!canvas || !durations?.length) return;
      const labels = durations.map(d => `${Math.floor(d.duration_bin/60)}м`);
      const games = durations.map(d => d.games_played);
      const wins = durations.map(d => d.wins);
      if(cache._charts.heroDur){ try{ cache._charts.heroDur.destroy(); }catch{} }
      cache._charts.heroDur = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: t('games'), data: games, backgroundColor: '#a371f7' },
            { label: t('wins'),  data: wins,  backgroundColor: '#3fb950' },
          ],
        },
        options: { responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ position:'top' } } },
      });
      setTimeout(initItemImages, 0);
    }, 60);

  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ПАТЧИ
// ================================================================
async function renderPatch(app){
  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const patches = await loadPatches();
    if(!patches || !patches.length) throw new Error(t('no_data'));

    // Сортируем по id (новые сверху)
    const sorted = [...patches].sort((a,b) => (b.id||0) - (a.id||0));
    const current = sorted[0];

    // Ссылки на нотсы Valve
    const patchLink = (id) => `https://www.dota2.com/patches/${id}`;

    app.innerHTML = `
      <h2 class="page-title">${t('patch_title')}</h2>
      <p class="page-sub">${t('patch_sub')}</p>

      <div class="profile-header" style="margin-bottom:24px">
        <div style="font-size:64px">🏆</div>
        <div class="info">
          <h3>${t('patch_current')}: <span style="color:var(--accent)">${esc(current.name||('Patch '+current.id))}</span></h3>
          <div class="meta">
            <span>${t('patch_date')}: ${current.date ? fmtDateOnly(current.date) : '—'}</span>
            <span>ID: ${current.id}</span>
          </div>
          <div class="meta" style="margin-top:8px">
            <a href="${patchLink(current.id)}" target="_blank" rel="noopener">${t('patch_read_notes')}</a>
            <a href="https://www.dota2.com/patches" target="_blank" rel="noopener">Все патчи ↗</a>
          </div>
        </div>
      </div>

      <h3 style="margin-top:32px">${t('patch_recent')}</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>${t('patch_name')}</th><th>${t('patch_date')}</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.slice(0, 20).map((p,i) => `
            <tr>
              <td>${i+1}</td>
              <td><b>${esc(p.name||('Patch '+p.id))}</b></td>
              <td>${p.date ? fmtDateOnly(p.date) : '—'}</td>
              <td><a href="${patchLink(p.id)}" target="_blank" rel="noopener" style="font-size:13px">${t('patch_read_notes')}</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ГЛОБАЛЬНАЯ СТАТА
// ================================================================
async function renderStats(app){
  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const [heroStats, totals, publicMatches] = await Promise.all([
      cache.heroStats ? Promise.resolve(cache.heroStats) : fetch(`${API}/heroStats`).then(r=>r.json()),
      fetch(`${API}/totals`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/publicMatches`).then(r=>r.json()).catch(()=>[]),
    ]);
    cache.heroStats = heroStats;

    // Топ по пикам и банам за месяц (все ранги)
    const stats = heroStats.map(h => {
      const picks = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_pick`]||0),0);
      const wins  = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_win`]||0),0);
      return { id: h.id, name: h.localized_name, img: heroImgUrl(h.id), picks, wins, wr: picks?(wins/picks)*100:0, pro_ban: h.pro_ban||0 };
    });

    const topPicks = [...stats].sort((a,b)=>b.picks-a.picks).slice(0, 10);
    const topBans  = [...heroStats].sort((a,b)=>(b.pro_ban||0)-(a.pro_ban||0)).slice(0, 10)
      .map(h => ({ id: h.id, name: h.localized_name, img: heroImgUrl(h.id), pro_ban: h.pro_ban||0 }));

    // Средняя длительность из publicMatches
    const durations = (publicMatches||[]).map(m => m.duration||0).filter(d => d>0);
    const avgDur = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : 0;

    const totalMatches = stats.reduce((s,h)=>s+h.picks,0);

    app.innerHTML = `
      <h2 class="page-title">${t('stats_title')}</h2>
      <p class="page-sub">${t('stats_sub')}</p>

      <div class="stat-grid">
        <div class="stat-card"><span class="val accent">${totalMatches.toLocaleString('ru-RU')}</span><span class="lbl">${t('stats_matches_24h')}</span></div>
        <div class="stat-card"><span class="val">${fmtDuration(avgDur)}</span><span class="lbl">${t('stats_avg_duration')}</span></div>
        <div class="stat-card"><span class="val">${heroStats.length}</span><span class="lbl">${t('stats_total_heroes')}</span></div>
        <div class="stat-card"><span class="val">${Object.keys(cache.items||{}).length || '—'}</span><span class="lbl">${t('stats_total_items')}</span></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px" class="stats-cols">
        <div>
          <h3>📈 ${t('stats_top_picks')}</h3>
          <table class="data-table">
            <thead><tr><th>#</th><th>${t('hero')}</th><th>${t('picks')}</th><th>${t('winrate')}</th></tr></thead>
            <tbody>
              ${topPicks.map((h,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td><a href="#/hero/${h.id}"><img src="${h.img}" alt=""/><span>${esc(h.name)}</span></a></td>
                  <td>${h.picks.toLocaleString('ru-RU')}</td>
                  <td class="wr-cell ${h.wr>=50?'good':'bad'}">${h.wr.toFixed(1)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div>
          <h3>🚫 ${t('stats_top_bans')}</h3>
          <table class="data-table">
            <thead><tr><th>#</th><th>${t('hero')}</th><th>Pro ${t('bans')}</th></tr></thead>
            <tbody>
              ${topBans.map((h,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td><a href="#/hero/${h.id}"><img src="${h.img}" alt=""/><span>${esc(h.name)}</span></a></td>
                  <td>${h.pro_ban}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ТОП-100 ЛИДЕРБОРДА
// ================================================================
async function renderLeaderboard(app){
  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const players = await fetch(`${API}/topPlayers`).then(r=>r.json()).catch(()=>[]);
    if(!Array.isArray(players) || !players.length) throw new Error(t('no_data'));

    const top = [...players].sort((a,b)=>(b.computed_mmr||0) - (a.computed_mmr||0)).slice(0, 100);

    app.innerHTML = `
      <h2 class="page-title">${t('leaderboard_title')}</h2>
      <p class="page-sub">${t('leaderboard_sub')}</p>

      <table class="data-table" style="margin-top:20px">
        <thead>
          <tr>
            <th>#</th>
            <th>${t('leaderboard_name')}</th>
            <th>${t('rank')}</th>
            <th>${t('leaderboard_rating')}</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((p, i) => {
            const rImg = rankImg(p.rank_tier);
            return `
              <tr>
                <td><b>${i+1}</b></td>
                <td>
                  <a href="#/player/${p.account_id}" style="display:flex;align-items:center;gap:8px">
                    ${p.avatar ? `<img src="${p.avatar}" alt="" style="width:32px;height:32px;border-radius:50%"/>` : ''}
                    <span>${esc(p.personaname || p.name || ('Player '+p.account_id))}</span>
                  </a>
                </td>
                <td>${rImg ? `<img src="${rImg}" alt="" style="width:32px;height:auto;border-radius:0;margin:0"/>` : '—'} ${esc(rankName(p.rank_tier))}</td>
                <td><b>${p.computed_mmr || '—'}</b></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ЛИГИ
// ================================================================
async function renderLeagues(app){
  app.innerHTML = `
    <h2 class="page-title">Лиги и турниры</h2>
    <p class="page-sub">Список лиг, по которым есть данные в OpenDota</p>
    <div class="filters">
      <label for="leagueSearch">${t('search')}:</label>
      <input id="leagueSearch" type="text" placeholder="Название лиги…" style="flex:1;max-width:320px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg3);color:var(--text);outline:none"/>
    </div>
    <div id="leaguesBody"><div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div></div>
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
              <div class="lname">${esc(l.name||'—')}</div>
              <div class="lmeta">ID ${l.leagueid}${l.tier ? ' · tier: '+esc(l.tier) : ''}</div>
            </div>
            <a href="https://www.opendota.com/leagues/${l.leagueid}" target="_blank" rel="noopener" style="font-size:13px">Матчи ↗</a>
          </div>
        `).join('')}
      ` : `<div class="empty-state">${t('no_data')}</div>`;
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
    <h2 class="page-title">${t('nav_pro')}</h2>
    <p class="page-sub">Последние матчи про-игроков</p>
    <div id="proBody"><div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div></div>
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
                <span class="match-meta">${esc(m.league_name||'—')} · ${dur} · ${m.radiant_score||0}:${m.dire_score||0}</span>
              </div>
              <div class="kda">
                <div class="kda-val">${m.match_id}</div>
                <div class="result">→</div>
              </div>
            </a>
          `;
        }).join('')}
      </div>

      <h3 style="margin-top:36px">🏆 Топ команд</h3>
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
// ПРОФИЛЬ
// ================================================================
async function renderPlayer(app, params){
  const presetId = params?.[0] || '';

  app.innerHTML = `
    <h2 class="page-title">${t('nav_player')}</h2>
    <p class="page-sub">Steam ID, Steam64, Dotabuff, OpenDota — определим сами.</p>
    <form class="search-form" id="playerForm">
      <input id="playerInput" placeholder="88141661 / ссылка на Steam" autocomplete="off" value="${esc(presetId)}"/>
      <button type="submit">${t('search')}</button>
    </form>
    <div class="quick-links">
      <span>Быстро:</span>
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
      if(result) result.innerHTML = `<div class="empty-state error">⚠ ${t('not_found')}</div>`;
      return;
    }
    await showPlayer(id);
  }

  async function showPlayer(accountId){
    if(result) result.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
    try{
      const [profile, wl, heroes, matches, totals] = await Promise.all([
        fetch(`${API}/players/${accountId}`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/wl`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/heroes?limit=20`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/matches?limit=20`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/totals`).then(r=>r.json()).catch(()=>[]),
      ]);

      if(!profile?.profile) throw new Error(t('not_found'));
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
          <img src="${rImg}" alt="" onerror="this.style.display='none'"/>
          <div class="rank-txt"><b>${esc(rankName(rankTier))}</b>tier ${rankTier}</div>
        </div>
      ` : ''}
    </div>

    <div class="stat-grid">
      <div class="stat-card"><span class="val">${(wl.win+wl.lose).toLocaleString('ru-RU')}</span><span class="lbl">${t('matches')}</span></div>
      <div class="stat-card"><span class="val green">${wl.win.toLocaleString('ru-RU')}</span><span class="lbl">${t('wins')}</span></div>
      <div class="stat-card"><span class="val red">${wl.lose.toLocaleString('ru-RU')}</span><span class="lbl">${t('losses')}</span></div>
      <div class="stat-card"><span class="val ${parseFloat(winrate)>=50?'green':'red'}">${winrate}%</span><span class="lbl">${t('winrate')}</span></div>
      <div class="stat-card"><span class="val">${getTotal('kills')}</span><span class="lbl">${t('kills')}</span></div>
      <div class="stat-card"><span class="val">${getTotal('deaths')}</span><span class="lbl">${t('deaths')}</span></div>
      <div class="stat-card"><span class="val">${getTotal('assists')}</span><span class="lbl">${t('assists')}</span></div>
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
                <span class="match-meta">${won?'Победа':'Поражение'} · ${fmtDuration(m.duration)} · ${fmtDate(m.start_time)}</span>
              </div>
              <div class="kda">
                <div class="kda-val"><span class="k">${m.kills}</span> / <span class="d">${m.deaths}</span> / ${m.assists}</div>
                <div class="result ${won?'win':'lose'}">${won?'WIN':'LOSE'}</div>
              </div>
            </a>
          `;
        }).join('') : `<div class="empty-state">${t('no_data')}</div>`}
      </div>
    </div>

    <div class="tab-panel" id="tab-heroes">
      ${heroes?.length ? `
        <table class="data-table">
          <thead><tr><th>${t('hero')}</th><th>${t('games')}</th><th>${t('wins')}</th><th>${t('winrate')}</th></tr></thead>
          <tbody>
            ${heroes.map(h => {
              const wr = h.games ? (h.win/h.games*100) : 0;
              const cls = wr>=50 ? 'good' : 'bad';
              return `
                <tr>
                  <td><a href="#/hero/${h.hero_id}"><img src="${heroImgUrl(h.hero_id)}" alt=""/><span>${esc(heroName(h.hero_id))}</span></a></td>
                  <td>${h.games}</td>
                  <td>${h.win}</td>
                  <td class="wr-cell ${cls}">${wr.toFixed(1)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : `<div class="empty-state">${t('no_data')}</div>`}
    </div>

    <div class="tab-panel" id="tab-charts">
      <div class="chart-wrap">
        <h3>GPM / XPM</h3>
        <div class="chart-canvas-wrap"><canvas id="chartGpmXpm"></canvas></div>
      </div>
      <div class="chart-wrap">
        <h3>K / D / A</h3>
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
  if(!document.body.contains($('#chartGpmXpm'))) return;

  const sorted = [...matches].filter(m=>m.start_time).sort((a,b)=>a.start_time-b.start_time);
  const labels = sorted.map((_,i) => `#${i+1}`);

  const gpmXpm = $('#chartGpmXpm');
  if(gpmXpm){
    if(cache._charts.gpm){ try{ cache._charts.gpm.destroy(); }catch{} }
    cache._charts.gpm = new Chart(gpmXpm, {
      type:'line',
      data:{ labels, datasets:[
        { label:'GPM', data:sorted.map(m=>m.gold_per_min||0), borderColor:'#e05a3a', backgroundColor:'rgba(224,90,58,.15)', tension:.3, fill:true, pointRadius:2 },
        { label:'XPM', data:sorted.map(m=>m.xp_per_min||0), borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,.15)', tension:.3, fill:true, pointRadius:2 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ position:'top' } } },
    });
  }

  const kda = $('#chartKda');
  if(kda){
    if(cache._charts.kda){ try{ cache._charts.kda.destroy(); }catch{} }
    cache._charts.kda = new Chart(kda, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Kills',   data:sorted.map(m=>m.kills||0),   backgroundColor:'#3fb950' },
        { label:'Deaths',  data:sorted.map(m=>m.deaths||0),  backgroundColor:'#f85149' },
        { label:'Assists', data:sorted.map(m=>m.assists||0), backgroundColor:'#a371f7' },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ position:'top' } } },
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
    <h2 class="page-title">${t('nav_compare')}</h2>
    <p class="page-sub">Введите двух игроков</p>
    <div class="compare-grid">
      <div class="compare-card">
        <form class="search-form" id="formA" style="margin:0">
          <input id="inputA" placeholder="A" value="${esc(presetA)}"/>
        </form>
        <div id="cardA" style="margin-top:14px"></div>
      </div>
      <div class="compare-card">
        <form class="search-form" id="formB" style="margin:0">
          <input id="inputB" placeholder="B" value="${esc(presetB)}"/>
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
      if(card) card.innerHTML = `<div class="empty-state error">⚠ ${t('not_found')}</div>`;
      return null;
    }
    if(card) card.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
    try{
      const [profile, wl] = await Promise.all([
        fetch(`${API}/players/${id}`).then(r=>r.json()),
        fetch(`${API}/players/${id}/wl`).then(r=>r.json()),
      ]);
      if(!profile?.profile) throw new Error(t('not_found'));
      const p = profile.profile;
      const wr = (wl.win+wl.lose) ? (wl.win/(wl.win+wl.lose)*100) : 0;
      const data = { id, profile, wl, wr, rankTier: profile.rank_tier };
      const rImg = rankImg(profile.rank_tier);
      if(card) card.innerHTML = `
        <img src="${p.avatarfull||''}" alt="" onerror="this.style.display='none'"/>
        <h3>${esc(p.personaname||'—')}</h3>
        <div class="meta">ID ${p.account_id}</div>
        ${profile.rank_tier ? `<div class="meta" style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px">${rImg ? `<img src="${rImg}" style="width:36px;height:36px;border:none;border-radius:0" onerror="this.style.display='none'"/>` : ''}<span>${esc(rankName(profile.rank_tier))}</span></div>` : ''}
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
      body.innerHTML = `<div class="empty-state">${t('no_data')}</div>`;
      return;
    }
    const rows = [
      [t('matches'), A.wl.win+A.wl.lose, B.wl.win+B.wl.lose, 'higher'],
      [t('wins'),    A.wl.win,           B.wl.win,           'higher'],
      [t('losses'),  A.wl.lose,          B.wl.lose,          'lower'],
      [t('winrate'), A.wr.toFixed(1)+'%',B.wr.toFixed(1)+'%', 'wr'],
      [t('rank'),    rankName(A.rankTier),rankName(B.rankTier), 'rank'],
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
          return `<div class="compare-row">
            <div class="l ${win==='l'?'better':''}">${esc(String(a))}</div>
            <div class="lbl">${esc(lbl)}</div>
            <div class="r ${win==='r'?'better':''}">${esc(String(b))}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  on($('#formA'), 'submit', async e => { e.preventDefault(); A = await loadOne('A', $('#inputA')?.value || ''); renderComparison(); });
  on($('#formB'), 'submit', async e => { e.preventDefault(); B = await loadOne('B', $('#inputB')?.value || ''); renderComparison(); });

  if(presetA) A = await loadOne('A', presetA);
  if(presetB) B = await loadOne('B', presetB);
  renderComparison();
}

// ================================================================
// МАТЧ
// ================================================================
async function renderMatch(app, params){
  const matchId = params?.[0];
  if(!matchId){ app.innerHTML = `<div class="empty-state error">${t('not_found')}</div>`; return; }

  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const m = await fetch(`${API}/matches/${matchId}`).then(r=>r.json());
    if(!m || !m.match_id) throw new Error(t('not_found'));

    const radiantWin = m.radiant_win;
    const players = m.players || [];
    const rad = players.filter(p => p.player_slot < 128);
    const dire = players.filter(p => p.player_slot >= 128);

    const renderTeam = (team, side) => `
      <div class="team-block ${side}">
        <h3><span>${side==='radiant'?'🌿 Radiant':'🔥 Dire'}</span>
        <span class="score">${side==='radiant' ? (m.radiant_score||0) : (m.dire_score||0)}</span></h3>
        ${team.map(p => `
          <div class="player-row">
            <img src="${heroImgUrl(p.hero_id)}" alt=""/>
            <div class="pname">${esc(heroName(p.hero_id))}<small>${esc(p.personaname || p.name || '—')}</small></div>
            <div class="pstat"><b>${p.kills||0}</b> / ${p.deaths||0} / ${p.assists||0}<br/>
              <span style="font-size:11px">GPM ${p.gold_per_min||0} · XPM ${p.xp_per_min||0} · LH ${p.last_hits||0}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    app.innerHTML = `
      <a href="#/pro" style="font-size:13px">← ${t('nav_pro')}</a>
      <h2 class="page-title" style="margin-top:12px">Match #${m.match_id}</h2>
      <div class="match-header">
        <div style="font-size:20px;font-weight:700">
          <span style="color:var(--ok)">Radiant ${m.radiant_score||0}</span>
          &nbsp;:&nbsp;
          <span style="color:var(--bad)">${m.dire_score||0} Dire</span>
        </div>
        <div class="${radiantWin?'radiant-win':'dire-win'}">${radiantWin?'Победа Radiant':'Победа Dire'}</div>
        <div class="match-meta">
          <span>⏱ ${fmtDuration(m.duration||0)}</span>
          <span>📅 ${fmtDate(m.start_time||0)}</span>
          ${m.league_name ? `<span>🏆 ${esc(m.league_name)}</span>` : ''}
        </div>
      </div>
      <div class="match-teams">
        ${renderTeam(rad, 'radiant')}
        ${renderTeam(dire, 'dire')}
      </div>
      <p style="text-align:center;color:var(--muted);font-size:13px;margin-top:20px">
        <a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota ↗</a>
      </p>
    `;
  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ДРУГИЕ САЙТЫ
// ================================================================
const SITES = [
  { icon:'🎨', title:'Dota2PornFxWeb', url:'https://h6rd.github.io/Dota2PornFxWeb/', desc:'Скачать VPK-паки со скинами для Dota 2.', tags:['Скины','VPK','Моды'] },
  { icon:'😀', title:'Dota 2 Emoticons', url:'https://aluerie.github.io/Dota2Utils/ListEmoticons/', desc:'Список эмодзи для Dota 2 — бинды через консоль.', tags:['Эмодзи','Бинды'] },
  { icon:'📊', title:'Dota 2 Pro Tracker', url:'https://dota2protracker.com/', desc:'Статистика про-игроков: пики, билды, винрейты.', tags:['Про','Мета'] },
  { icon:'👁', title:'OpenDota', url:'https://www.opendota.com/', desc:'Открытая статистика Dota 2 + API.', tags:['API','Стата'] },
  { icon:'🐃', title:'Dotabuff', url:'https://www.dotabuff.com/', desc:'Популярная статистика игроков и героев.', tags:['Профили','Мета'] },
  { icon:'🚀', title:'STRATZ', url:'https://stratz.com/', desc:'Современная аналитика Dota 2.', tags:['Аналитика'] },
];

async function renderSites(app){
  app.innerHTML = `
    <h2 class="page-title">🔗 ${t('nav_sites')}</h2>
    <p class="page-sub">Полезные ресурсы по Dota 2</p>
    <div class="sites-grid">
      ${SITES.map(s => `
        <a class="site-card" href="${s.url}" target="_blank" rel="noopener">
          <div class="site-icon">${s.icon}</div>
          <div class="site-title">${esc(s.title)}<span class="ext">↗</span></div>
          <div class="site-desc">${s.desc}</div>
          <div class="site-tags">${s.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </a>
      `).join('')}
    </div>
  `;
}

// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================
function boot(){
  initTheme();
  initLang();
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