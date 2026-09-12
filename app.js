// ================================================================
// Eye Dota 2 — SPA
// ================================================================

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const HERO_CDN = `${CDN}/apps/dota2/images/dota_react/heroes`;
const ABILITY_CDN = `${CDN}/apps/dota2/images/dota_react/abilities`;
const RANK_CDN = 'https://www.opendota.com/assets/images/dota2/rank_icons';

const RANKS = {1:'Herald',2:'Guardian',3:'Crusader',4:'Archon',5:'Legend',6:'Ancient',7:'Divine',8:'Immortal'};
const GAME_MODES = {0:'Unknown',1:'All Pick',2:'Captains Mode',3:'Random Draft',4:'Single Draft',5:'All Random',16:'Captains Draft',18:'Ability Draft',22:'All Pick (Ranked)',23:'Turbo'};
const LANE_ROLES = {1:'Safe Lane',2:'Mid',3:'Off Lane',4:'Jungle'};

const WORKER_BASE = 'https://eye-dota2-proxy.human001user.workers.dev';
const PUBLIC_PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const cache = {
  heroMap:{}, heroSlug:{}, heroImg:{}, heroStats:null, items:null,
  itemById:{}, abilityNames:{}, patches:null, leagues:null, _charts:{},
};

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
  if(!sec && sec !== 0) return '0:00';
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
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
window.__tryNextImg = function(img){
  const raw = img.getAttribute('data-srcs');
  if(!raw){ img.style.opacity='0'; return; }
  let list; try { list = JSON.parse(raw); } catch { list = []; }
  const current = img.src;
  const idx = list.findIndex(u => u === current || current.endsWith(u.split('/').pop()));
  const nextIdx = idx >= 0 ? idx + 1 : 0;
  if(nextIdx < list.length) img.src = list[nextIdx];
  else {
    img.style.display='none';
    const ph = img.parentElement?.querySelector('.ph');
    if(ph) ph.hidden = false;
  }
};
function initItemImages(){
  document.querySelectorAll('.item-card img[data-srcs]').forEach(img => {
    if(img.src) return;
    let list; try { list = JSON.parse(img.getAttribute('data-srcs')); } catch { list = []; }
    if(list.length) img.src = list[0];
    else {
      img.style.display='none';
      const ph = img.parentElement?.querySelector('.ph');
      if(ph) ph.hidden = false;
    }
  });
}

// ================================================================
// STEAM ID
// ================================================================
function steam64To32(s){
  try{
    const big = BigInt(s);
    const base = 76561197960265728n;
    if(big < base) return null;
    return Number(big - base);
  } catch { return null; }
}
function steam32To64(s){
  try { return (BigInt(s) + 76561197960265728n).toString(); }
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
  }catch(e){ console.warn(e); }
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
    return items;
  }catch{ return {}; }
}
async function loadPatches(){
  if(cache.patches) return cache.patches;
  try{
    cache.patches = await fetch(`${API}/constants/patch`).then(r=>r.json());
    return cache.patches;
  }catch{ return []; }
}
async function loadAbilities(){
  if(Object.keys(cache.abilityNames).length) return cache.abilityNames;
  try{
    cache.abilityNames = await fetch(`${API}/constants/abilities`).then(r=>r.json());
    return cache.abilityNames;
  }catch{ return {}; }
}

// ================================================================
// НАСТРОЙКИ
// ================================================================
const SETTINGS = { theme:'dark', accent:'orange', fontsize:'md', compact:'off' };

const ACCENTS = {
  orange: { accent:'#e05a3a', accent2:'#f5a623', hover:'rgba(224,90,58,.07)' },
  red:    { accent:'#e24545', accent2:'#f07070', hover:'rgba(226,69,69,.07)' },
  blue:   { accent:'#4a8fe0', accent2:'#7cb1f0', hover:'rgba(74,143,224,.07)' },
  green:  { accent:'#4ec26b', accent2:'#7bd48f', hover:'rgba(78,194,107,.07)' },
  purple: { accent:'#a371f7', accent2:'#c4a5fa', hover:'rgba(163,113,247,.07)' },
};

function loadSettings(){
  try{
    const saved = JSON.parse(localStorage.getItem('eye-settings') || '{}');
    Object.assign(SETTINGS, saved);
  }catch{}
}
function saveSettings(){
  localStorage.setItem('eye-settings', JSON.stringify(SETTINGS));
}
function applySettings(){
  const root = document.documentElement;
  let theme = SETTINGS.theme;
  if(theme === 'auto'){
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', SETTINGS.accent);
  root.setAttribute('data-fontsize', SETTINGS.fontsize);
  root.setAttribute('data-compact', SETTINGS.compact);

  const acc = ACCENTS[SETTINGS.accent] || ACCENTS.orange;
  root.style.setProperty('--accent', acc.accent);
  root.style.setProperty('--accent2', acc.accent2);
  root.style.setProperty('--bg-hover', acc.hover);

  const sizes = { sm:'13px', md:'15px', lg:'17px' };
  document.body.style.fontSize = sizes[SETTINGS.fontsize] || sizes.md;

  $$('#themeRow button').forEach(b => b.classList.toggle('active', b.dataset.themeVal === SETTINGS.theme));
  $$('#accentRow button').forEach(b => b.classList.toggle('active', b.dataset.accentVal === SETTINGS.accent));
  $$('#fontRow button').forEach(b => b.classList.toggle('active', b.dataset.fontVal === SETTINGS.fontsize));
  $$('#compactRow button').forEach(b => b.classList.toggle('active', b.dataset.compactVal === SETTINGS.compact));

  const themeBtn = $('#themeToggle');
  if(themeBtn) themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
}
function initSettings(){
  loadSettings(); applySettings();
  on($('#settingsBtn'), 'click', () => $('#settingsModal')?.classList.remove('hidden'));
  on($('#settingsClose'), 'click', () => $('#settingsModal')?.classList.add('hidden'));
  on($('.modal-backdrop'), 'click', () => $('#settingsModal')?.classList.add('hidden'));
  $$('#themeRow button').forEach(b => on(b, 'click', () => { SETTINGS.theme=b.dataset.themeVal; saveSettings(); applySettings(); }));
  $$('#accentRow button').forEach(b => on(b, 'click', () => { SETTINGS.accent=b.dataset.accentVal; saveSettings(); applySettings(); }));
  $$('#fontRow button').forEach(b => on(b, 'click', () => { SETTINGS.fontsize=b.dataset.fontVal; saveSettings(); applySettings(); }));
  $$('#compactRow button').forEach(b => on(b, 'click', () => { SETTINGS.compact=b.dataset.compactVal; saveSettings(); applySettings(); }));
  on($('#themeToggle'), 'click', () => {
    SETTINGS.theme = (SETTINGS.theme === 'dark') ? 'light' : 'dark';
    saveSettings(); applySettings();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if(SETTINGS.theme === 'auto') applySettings();
  });
}

// ================================================================
// ЯЗЫК
// ================================================================
function initLang(){
  const saved = localStorage.getItem('eye-lang') || 'ru';
  window.setLang(saved);
  on($('#langToggle'), 'click', () => {
    const next = (window.__lang === 'ru') ? 'en' : 'ru';
    window.setLang(next);
  });
}

// ================================================================
// РОУТЕР
// ================================================================
const routes = {
  servers: renderServers, meta: renderMeta, builds: renderBuilds,
  heroes: renderHeroes, hero: renderHeroPage,
  patch: renderPatch, stats: renderStats, leaderboard: renderLeaderboard,
  recommend: renderRecommend, pick: renderPick,
  leagues: renderLeagues, pro: renderPro,
  player: renderPlayer, compare: renderCompare, match: renderMatch, sites: renderSites,
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
    try{ await fn(app, params); }
    catch(e){
      console.error('Route error', route, e);
      app.innerHTML = `<section class="empty-state error">⚠ ${t('error')}: ${esc(e.message||e)}</section>`;
    }
  } finally { navigating = false; }
}

// ================================================================
// СЕРВЕРЫ
// ================================================================
const REGIONS = [
  { name:'🇪🇺 Европа', cellid:3 },
  { name:'🌎 Америка', cellid:1 },
  { name:'🌏 Азия', cellid:5 },
];
function extractEndpoint(entry){
  if(typeof entry === 'string') return entry;
  if(entry && typeof entry === 'object') return entry.endpoint || entry.legacy_endpoint || entry.hostname || '';
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
      const r = await fetch(build(steamUrl), { headers:{ 'Accept':'application/json' }});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return JSON.parse(await r.text());
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
  }catch(e){ return { ok:false, error:true, message:e.message, servers:[] }; }
}
async function renderServers(app){
  app.innerHTML = `
    <h2 class="page-title">Состояние серверов Dota 2</h2>
    <p class="page-sub">Live-статус CM-серверов Valve. Источник: <code>GetCMListForConnect</code>.
      <a href="https://steamstat.us" target="_blank" rel="noopener">steamstat.us ↗</a></p>
    <div class="status-summary" id="summary"><span class="dot loading"></span> ${t('loading')}</div>
    <div class="grid-3" style="margin-top:24px">
      ${REGIONS.map(r => `<article class="region" id="region-${r.cellid}"><h3>${r.name}</h3>
        <div class="region-status"><span class="dot loading"></span> ${t('loading')}</div>
        <ul class="server-list" id="list-${r.cellid}"></ul></article>`).join('')}
    </div>
  `;
  const refresh = async () => {
    let totalAlive=0, totalServers=0, failedRegions=0;
    for(const region of REGIONS){
      const res = await checkRegion(region.cellid);
      const listEl = $(`#list-${region.cellid}`);
      const statusEl = $(`#region-${region.cellid}`)?.querySelector('.region-status');
      if(res.error){
        failedRegions++;
        if(statusEl) statusEl.innerHTML = `<span class="dot bad"></span> ${t('error')}`;
        if(listEl) listEl.innerHTML = '';
        continue;
      }
      totalAlive += res.alive; totalServers += res.total;
      if(statusEl){
        statusEl.innerHTML = res.alive > 0
          ? `<span class="dot ok"></span> <b>${res.alive}</b> online · ${res.ping} мс`
          : `<span class="dot warn"></span> ${t('no_data')}`;
      }
      if(listEl){
        const list = res.servers.slice(0,8);
        listEl.innerHTML = list.length
          ? list.map(addr => `<li><span class="name">${esc(addr)}</span></li>`).join('')
          : `<li><span class="name" style="opacity:.6">— ${t('no_data')} —</span></li>`;
        if(res.servers.length > list.length){
          listEl.innerHTML += `<li style="text-align:center;color:var(--muted);font-size:11px">…+${res.servers.length-list.length}</li>`;
        }
      }
    }
    const sm = $('#summary');
    if(!sm) return;
    if(totalServers===0 && failedRegions===REGIONS.length){
      sm.innerHTML = `<span class="dot bad"></span> ${t('error')}. <a href="https://steamstat.us" target="_blank" rel="noopener">steamstat.us</a>`;
    } else if(totalServers===0){
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
    <p class="page-sub">Топ героев · OpenDota</p>
    <div class="filters">
      <label for="metaBracket">Ранг:</label>
      <select id="metaBracket">
        <option value="all">Все</option>
        <option value="1">Herald</option><option value="2">Guardian</option>
        <option value="3">Crusader</option><option value="4">Archon</option>
        <option value="5">Legend</option><option value="6">Ancient</option>
        <option value="7">Divine</option><option value="8">Immortal</option>
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
    let list = heroes.map(h => ({ ...h, picks:picksOf(h), wins:winsOf(h),
      wr: picksOf(h)?(winsOf(h)/picksOf(h))*100:0,
      contested: (h.pro_pick||0)+(h.pro_ban||0) }));
    if(sort==='wr') list = list.filter(h=>h.picks>=100).sort((a,b)=>b.wr-a.wr);
    else if(sort==='contested') list = list.sort((a,b)=>b.contested-a.contested);
    else list = list.sort((a,b)=>b.picks-a.picks);
    const top = list.slice(0,40);
    const body = $('#metaBody');
    if(!body) return;
    body.innerHTML = `<table class="data-table"><thead><tr>
      <th>#</th><th>${t('hero')}</th><th>${t('attribute')}</th><th>${t('games')}</th>
      <th>${t('wins')}</th><th>${t('winrate')}</th><th>Pro picks</th><th>Pro bans</th>
    </tr></thead><tbody>
      ${top.map((h,i) => {
        const wrCls = h.wr>=50?'good':'bad';
        return `<tr>
          <td>${i+1}</td>
          <td><a href="#/hero/${h.id}"><img src="${heroImgUrl(h.id)}" loading="lazy"/><span>${esc(h.localized_name)}</span></a></td>
          <td>${esc(h.primary_attr)}</td>
          <td>${h.picks.toLocaleString('ru-RU')}</td>
          <td>${h.wins.toLocaleString('ru-RU')}</td>
          <td class="wr-cell ${wrCls}">${h.wr.toFixed(1)}%</td>
          <td>${h.pro_pick||0}</td><td>${h.pro_ban||0}</td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
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
  if(sel) sel.innerHTML = sorted.map(h => `<option value="${h.id}">${esc(h.localized_name)}</option>`).join('');

  const load = async () => {
    const id = $('#buildHero')?.value;
    const body = $('#buildBody');
    if(!body || !id) return;
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
        const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,12);
        return `<h3 style="margin-top:24px">${title}</h3>
          <div class="item-grid">
            ${entries.map(([rawKey, count]) => {
              const slug = cache.itemById[String(rawKey)] || rawKey;
              const itemData = items[slug] || {};
              const urls = itemImgCandidates(itemData, slug);
              const display = itemData.dname || slug;
              return `<div class="item-card" title="${esc(display)}">
                <div class="img-wrap">
                  <img data-srcs='${JSON.stringify(urls)}' alt="${esc(display)}"
                       onerror="window.__tryNextImg && window.__tryNextImg(this)"/>
                  <span class="ph" hidden>❔</span>
                </div>
                <div class="item-name">${esc(display)}</div>
                <span class="item-count">× ${count.toLocaleString('ru-RU')}</span>
              </div>`;
            }).join('')}
          </div>`;
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
// ГЕРОИ
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
  const renderList = (q='') => {
    const ql = q.toLowerCase().trim();
    const filtered = heroes.filter(h => !ql ||
      (h.localized_name||'').toLowerCase().includes(ql) ||
      (h.name||'').toLowerCase().includes(ql));
    const body = $('#heroesBody');
    if(!body) return;
    if(!filtered.length){ body.innerHTML = `<div class="empty-state">${t('heroes_no_results')}</div>`; return; }
    body.innerHTML = `<div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
      ${filtered.map(h => `<a class="hero-card" href="#/hero/${h.id}">
        <img src="${heroImgUrl(h.id)}" alt="${esc(h.localized_name)}" loading="lazy"/>
        <div class="name">${esc(h.localized_name)}</div>
        <span class="wr">${esc(h.primary_attr)} · ${esc(h.attack_type)}</span>
      </a>`).join('')}
    </div>`;
  };
  on($('#heroSearch'), 'input', e => renderList(e.target.value));
  renderList();
}

// ================================================================
// HERO-PAGE
// ================================================================
async function renderHeroPage(app, params){
  const heroId = Number(params?.[0]);
  if(!heroId){ app.innerHTML = `<div class="empty-state error">${t('not_found')}</div>`; return; }
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

    const topMatchups = [...matchups].filter(m=>m.games_played>=20)
      .map(m => ({...m, wr:(m.wins/m.games_played)*100}))
      .sort((a,b)=>b.wr-a.wr).slice(0,8);

    const topPlayers = [...(Array.isArray(players)?players:[])]
      .sort((a,b)=>(b.games||0)-(a.games||0)).slice(0,10);

    const renderItemsRow = (obj) => {
      if(!obj || !Object.keys(obj).length) return `<div class="empty-state" style="padding:12px">${t('no_data')}</div>`;
      const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8);
      return `<div class="item-grid">
        ${entries.map(([rawKey, count]) => {
          const slug = cache.itemById[String(rawKey)] || rawKey;
          const itemData = items[slug] || {};
          const urls = itemImgCandidates(itemData, slug);
          const display = itemData.dname || slug;
          return `<div class="item-card" title="${esc(display)}">
            <div class="img-wrap">
              <img data-srcs='${JSON.stringify(urls)}' alt="${esc(display)}"
                   onerror="window.__tryNextImg && window.__tryNextImg(this)"/>
              <span class="ph" hidden>❔</span>
            </div>
            <div class="item-name">${esc(display)}</div>
            <span class="item-count">× ${count.toLocaleString('ru-RU')}</span>
          </div>`;
        }).join('')}
      </div>`;
    };

    const positions = Object.entries(hero).reduce((acc,[k,v])=>{
      const m = k.match(/^(\d)_pick$/);
      if(m) acc[m[1]] = (acc[m[1]]||0) + (v||0);
      return acc;
    },{});
    const topPositions = Object.entries(positions).sort((a,b)=>b[1]-a[1]).slice(0,3);

    app.innerHTML = `
      <div class="profile-header">
        <img class="avatar" style="border-radius:14px;width:110px;height:110px" src="${heroImgUrl(heroId)}" alt=""/>
        <div class="info">
          <h3>${esc(hero.localized_name)}</h3>
          <div class="meta"><span>${esc(hero.primary_attr)}</span><span>${esc(hero.attack_type)}</span>
            <span>${(hero.roles||[]).join(' · ')}</span></div>
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
            <span class="wr ${m.wr>=55?'':'bad'}">${m.wr.toFixed(1)}% · ${m.games_played} ${t('games')}</span>
          </a>`).join('') : `<div class="empty-state">${t('no_data')}</div>`}
      </div>

      <h3 style="margin-top:32px">📊 ${t('hero_stats')}</h3>
      <div class="stat-grid">
        <div class="stat-card"><span class="val">${topPositions.map(([p,n])=>`${LANE_ROLES[p]||p}: ${n}`).join(' · ')||'—'}</span><span class="lbl">${t('heroes_positions')}</span></div>
      </div>

      <h3 style="margin-top:32px">🛒 ${t('hero_avg_build')}</h3>
      <h4 style="margin-top:14px;color:var(--muted)">${t('build_start')}</h4>
      ${renderItemsRow(itemsObj.start_game_items)}
      <h4 style="margin-top:14px;color:var(--muted)">${t('build_early')}</h4>
      ${renderItemsRow(itemsObj.early_game_items)}
      <h4 style="margin-top:14px;color:var(--muted)">${t('build_mid')}</h4>
      ${renderItemsRow(itemsObj.mid_game_items)}
      <h4 style="margin-top:14px;color:var(--muted)">${t('build_late')}</h4>
      ${renderItemsRow(itemsObj.late_game_items)}

      <h3 style="margin-top:32px">🏆 ${t('hero_pro_players')}</h3>
      <table class="data-table"><thead><tr><th>#</th><th>${t('leaderboard_name')}</th><th>${t('games')}</th><th>${t('wins')}</th></tr></thead>
        <tbody>${topPlayers.length ? topPlayers.map((p,i) => `
          <tr><td>${i+1}</td>
            <td><a href="#/player/${p.account_id}">${esc(p.personaname||p.name||'Player '+p.account_id)}</a></td>
            <td>${(p.games||0).toLocaleString('ru-RU')}</td>
            <td>${(p.win||0).toLocaleString('ru-RU')}</td>
          </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">${t('no_data')}</div></td></tr>`}
        </tbody></table>

      <h3 style="margin-top:32px">⏱ ${t('hero_durations')}</h3>
      <div class="chart-wrap"><div class="chart-canvas-wrap"><canvas id="chartHeroDur"></canvas></div></div>
    `;
    setTimeout(() => {
      const canvas = $('#chartHeroDur');
      if(!canvas || !durations?.length) return;
      const labels = durations.map(d => `${Math.floor(d.duration_bin/60)}м`);
      const games = durations.map(d => d.games_played);
      const wins = durations.map(d => d.wins);
      if(cache._charts.heroDur){ try{ cache._charts.heroDur.destroy(); }catch{} }
      cache._charts.heroDur = new Chart(canvas, {
        type:'bar',
        data:{ labels, datasets:[
          { label:t('games'), data:games, backgroundColor:'#a371f7' },
          { label:t('wins'),  data:wins,  backgroundColor:'#3fb950' },
        ]},
        options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ position:'top' } } },
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
    const sorted = [...patches].sort((a,b)=>(b.id||0)-(a.id||0));
    const current = sorted[0];
    const link = id => `https://www.dota2.com/patches/${id}`;
    app.innerHTML = `
      <h2 class="page-title">${t('patch_title')}</h2>
      <p class="page-sub">${t('patch_sub')}</p>
      <div class="profile-header">
        <div style="font-size:64px">🏆</div>
        <div class="info">
          <h3>${t('patch_current')}: <span style="color:var(--accent)">${esc(current.name||('Patch '+current.id))}</span></h3>
          <div class="meta"><span>${t('patch_date')}: ${current.date?fmtDateOnly(current.date):'—'}</span><span>ID: ${current.id}</span></div>
          <div class="meta" style="margin-top:8px">
            <a href="${link(current.id)}" target="_blank" rel="noopener">${t('patch_read_notes')}</a>
            <a href="https://www.dota2.com/patches" target="_blank" rel="noopener">Все патчи ↗</a>
          </div>
        </div>
      </div>
      <h3 style="margin-top:32px">${t('patch_recent')}</h3>
      <table class="data-table"><thead><tr><th>#</th><th>${t('patch_name')}</th><th>${t('patch_date')}</th><th></th></tr></thead>
        <tbody>${sorted.slice(0,20).map((p,i) => `<tr>
          <td>${i+1}</td><td><b>${esc(p.name||('Patch '+p.id))}</b></td>
          <td>${p.date?fmtDateOnly(p.date):'—'}</td>
          <td><a href="${link(p.id)}" target="_blank" rel="noopener" style="font-size:13px">${t('patch_read_notes')}</a></td>
        </tr>`).join('')}</tbody>
      </table>`;
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
    const [heroStats, publicMatches, items] = await Promise.all([
      cache.heroStats ? Promise.resolve(cache.heroStats) : fetch(`${API}/heroStats`).then(r=>r.json()),
      fetch(`${API}/publicMatches`).then(r=>r.json()).catch(()=>[]),
      loadItems(),
    ]);
    cache.heroStats = heroStats;

    const stats = heroStats.map(h => {
      const picks = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_pick`]||0),0);
      const wins  = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_win`]||0),0);
      return { id:h.id, name:h.localized_name, img:heroImgUrl(h.id), picks, wins, wr:picks?(wins/picks)*100:0, pro_ban:h.pro_ban||0 };
    });
    const topPicks = [...stats].sort((a,b)=>b.picks-a.picks).slice(0,10);
    const topBans  = [...heroStats].sort((a,b)=>(b.pro_ban||0)-(a.pro_ban||0)).slice(0,10)
      .map(h => ({ id:h.id, name:h.localized_name, img:heroImgUrl(h.id), pro_ban:h.pro_ban||0 }));
    const durations = (publicMatches||[]).map(m=>m.duration||0).filter(d=>d>0);
    const avgDur = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : 0;
    const totalMatches = stats.reduce((s,h)=>s+h.picks,0);

    app.innerHTML = `
      <h2 class="page-title">${t('stats_title')}</h2>
      <p class="page-sub">${t('stats_sub')}</p>
      <div class="stat-grid">
        <div class="stat-card"><span class="val accent">${totalMatches.toLocaleString('ru-RU')}</span><span class="lbl">${t('stats_matches_24h')}</span></div>
        <div class="stat-card"><span class="val">${fmtDuration(avgDur)}</span><span class="lbl">${t('stats_avg_duration')}</span></div>
        <div class="stat-card"><span class="val">${heroStats.length}</span><span class="lbl">${t('stats_total_heroes')}</span></div>
        <div class="stat-card"><span class="val">${Object.keys(items).length||'—'}</span><span class="lbl">${t('stats_total_items')}</span></div>
      </div>
      <div class="stats-cols" style="margin-top:32px">
        <div><h3>📈 ${t('stats_top_picks')}</h3>
          <table class="data-table"><thead><tr><th>#</th><th>${t('hero')}</th><th>${t('picks')}</th><th>${t('winrate')}</th></tr></thead>
            <tbody>${topPicks.map((h,i) => `<tr>
              <td>${i+1}</td>
              <td><a href="#/hero/${h.id}"><img src="${h.img}"/><span>${esc(h.name)}</span></a></td>
              <td>${h.picks.toLocaleString('ru-RU')}</td>
              <td class="wr-cell ${h.wr>=50?'good':'bad'}">${h.wr.toFixed(1)}%</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div><h3>🚫 ${t('stats_top_bans')}</h3>
          <table class="data-table"><thead><tr><th>#</th><th>${t('hero')}</th><th>Pro ${t('bans')}</th></tr></thead>
            <tbody>${topBans.map((h,i) => `<tr>
              <td>${i+1}</td>
              <td><a href="#/hero/${h.id}"><img src="${h.img}"/><span>${esc(h.name)}</span></a></td>
              <td>${h.pro_ban}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// ТОП-100
// ================================================================
async function renderLeaderboard(app){
  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
  try{
    const players = await fetch(`${API}/topPlayers`).then(r=>r.json()).catch(()=>[]);
    if(!Array.isArray(players) || !players.length) throw new Error(t('no_data'));
    const top = [...players].sort((a,b)=>(b.computed_mmr||0)-(a.computed_mmr||0)).slice(0,100);
    app.innerHTML = `
      <h2 class="page-title">${t('leaderboard_title')}</h2>
      <p class="page-sub">${t('leaderboard_sub')}</p>
      <table class="data-table" style="margin-top:20px">
        <thead><tr><th>${t('leaderboard_pos')}</th><th>${t('leaderboard_name')}</th><th>${t('rank')}</th><th>${t('leaderboard_rating')}</th></tr></thead>
        <tbody>${top.map((p,i) => {
          const rImg = rankImg(p.rank_tier);
          return `<tr>
            <td><b>${i+1}</b></td>
            <td><a href="#/player/${p.account_id}" style="display:flex;align-items:center;gap:8px">
              ${p.avatar ? `<img src="${p.avatar}" style="width:32px;height:32px;border-radius:50%"/>` : ''}
              <span>${esc(p.personaname||p.name||('Player '+p.account_id))}</span>
            </a></td>
            <td>${rImg ? `<img src="${rImg}" style="width:32px;height:auto;border-radius:0;margin:0"/>` : '—'} ${esc(rankName(p.rank_tier))}</td>
            <td><b>${p.computed_mmr||'—'}</b></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

// ================================================================
// РЕКОМЕНДАЦИИ
// ================================================================
async function renderRecommend(app){
  const savedId = localStorage.getItem('eye-my-account') || '';
  app.innerHTML = `
    <h2 class="page-title">${t('rec_title')}</h2>
    <p class="page-sub">${t('rec_sub')}</p>
    <form class="search-form" id="recForm" style="max-width:520px">
      <input id="recInput" placeholder="${t('rec_input_placeholder')}" value="${esc(savedId)}"/>
      <button type="submit">${t('rec_analyze')}</button>
    </form>
    <div id="recBody" style="margin-top:24px"></div>
  `;
  const body = $('#recBody');

  async function analyze(accountId){
    body.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('rec_loading')}</div>`;
    try{
      const [profile, matches, heroStats] = await Promise.all([
        fetch(`${API}/players/${accountId}`).then(r=>r.json()),
        fetch(`${API}/players/${accountId}/matches?limit=50`).then(r=>r.json()),
        cache.heroStats ? Promise.resolve(cache.heroStats) : fetch(`${API}/heroStats`).then(r=>r.json()),
      ]);
      cache.heroStats = heroStats;
      if(!profile?.profile) throw new Error(t('not_found'));
      if(!matches?.length) throw new Error(t('rec_no_data'));
      localStorage.setItem('eye-my-account', accountId);

      const byHero = {};
      for(const m of matches){
        const id = m.hero_id;
        if(!id) continue;
        if(!byHero[id]) byHero[id] = { hero_id:id, games:0, wins:0, kills:0, deaths:0, assists:0 };
        const h = byHero[id];
        h.games++;
        const isRadiant = m.player_slot < 128;
        const won = (m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant);
        if(won) h.wins++;
        h.kills += m.kills||0; h.deaths += m.deaths||0; h.assists += m.assists||0;
      }
      const heroList = Object.values(byHero).map(h => ({
        ...h,
        wr: (h.wins/h.games)*100,
        kda: h.deaths ? ((h.kills+h.assists)/h.deaths) : (h.kills+h.assists),
      }));
      const bestHeroes = heroList.filter(h=>h.games>=3 && h.wr>=50)
        .sort((a,b)=>(b.wr-a.wr)||(b.games-a.games)).slice(0,5);
      const worstHeroes = heroList.filter(h=>h.games>=3 && h.wr<45)
        .sort((a,b)=>(a.wr-b.wr)||(b.games-a.games)).slice(0,5);

      const byLane = {};
      for(const m of matches){
        if(!m.lane_role) continue;
        const lr = m.lane_role;
        if(!byLane[lr]) byLane[lr] = { games:0, wins:0 };
        byLane[lr].games++;
        const isRadiant = m.player_slot < 128;
        const won = (m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant);
        if(won) byLane[lr].wins++;
      }
      const positions = Object.entries(byLane)
        .map(([lr,s]) => ({ lane:Number(lr), name: LANE_ROLES[lr]||`Lane ${lr}`, ...s, wr: s.games?(s.wins/s.games)*100:0 }))
        .sort((a,b)=>b.wr-a.wr).slice(0,3);

      const playedIds = new Set(Object.keys(byHero).map(Number));
      const tryHeroes = heroStats
        .map(h => {
          const picks = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_pick`]||0),0);
          const wins  = ['1','2','3','4','5','6','7','8'].reduce((s,k)=>s+(h[`${k}_win`]||0),0);
          return { id:h.id, name:h.localized_name, img:heroImgUrl(h.id), picks, wins, wr: picks?(wins/picks)*100:0 };
        })
        .filter(h => h.picks >= 5000 && h.wr >= 52 && !playedIds.has(h.id))
        .sort((a,b)=>b.wr-a.wr).slice(0,5);

      const profile_p = profile.profile;
      body.innerHTML = `
        <div class="profile-header" style="margin-bottom:24px">
          <img class="avatar" src="${profile_p.avatarfull||''}" alt="" onerror="this.style.display='none'"/>
          <div class="info">
            <h3>${esc(profile_p.personaname||'Player '+accountId)}</h3>
            <div class="meta"><span>ID: ${accountId}</span>${profile_p.loccountrycode?`<span>${esc(profile_p.loccountrycode)}</span>`:''}</div>
            <div class="meta" style="margin-top:6px">Проанализировано матчей: <b>${matches.length}</b></div>
          </div>
        </div>
        ${bestHeroes.length ? `
          <h3 style="margin-top:24px">✅ ${t('rec_best_heroes')} <span style="color:var(--muted);font-size:12px">(${t('rec_min_games')})</span></h3>
          <table class="data-table"><thead><tr><th>#</th><th>${t('hero')}</th><th>${t('games')}</th><th>${t('wins')}</th><th>${t('winrate')}</th><th>KDA</th></tr></thead>
            <tbody>${bestHeroes.map((h,i) => `<tr>
              <td>${i+1}</td>
              <td><a href="#/hero/${h.hero_id}"><img src="${heroImgUrl(h.hero_id)}"/><span>${esc(heroName(h.hero_id))}</span></a></td>
              <td>${h.games}</td><td>${h.wins}</td>
              <td class="wr-cell good">${h.wr.toFixed(1)}%</td>
              <td>${h.kda.toFixed(2)}</td>
            </tr>`).join('')}</tbody>
          </table>` : ''}
        ${worstHeroes.length ? `
          <h3 style="margin-top:32px">⚠️ ${t('rec_worst_heroes')}</h3>
          <table class="data-table"><thead><tr><th>#</th><th>${t('hero')}</th><th>${t('games')}</th><th>${t('wins')}</th><th>${t('winrate')}</th><th>KDA</th></tr></thead>
            <tbody>${worstHeroes.map((h,i) => `<tr>
              <td>${i+1}</td>
              <td><a href="#/hero/${h.hero_id}"><img src="${heroImgUrl(h.hero_id)}"/><span>${esc(heroName(h.hero_id))}</span></a></td>
              <td>${h.games}</td><td>${h.wins}</td>
              <td class="wr-cell bad">${h.wr.toFixed(1)}%</td>
              <td>${h.kda.toFixed(2)}</td>
            </tr>`).join('')}</tbody>
          </table>` : ''}
        ${positions.length ? `
          <h3 style="margin-top:32px">📍 ${t('rec_best_positions')}</h3>
          <div class="stat-grid">
            ${positions.map(p => `<div class="stat-card">
              <span class="val accent">${p.name}</span>
              <span class="lbl">${p.games} ${t('games')} · ${p.wr.toFixed(0)}% ${t('winrate')}</span>
            </div>`).join('')}
          </div>` : ''}
        ${tryHeroes.length ? `
          <h3 style="margin-top:32px">🎲 ${t('rec_try')}</h3>
          <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            ${tryHeroes.map(h => `<a class="hero-card" href="#/hero/${h.id}">
              <img src="${h.img}" alt=""/>
              <div class="name">${esc(h.name)}</div>
              <span class="wr">${h.wr.toFixed(1)}% · ${(h.picks/1000).toFixed(0)}k ${t('games')}</span>
            </a>`).join('')}
          </div>` : ''}
      `;
    }catch(e){
      body.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  }

  on($('#recForm'), 'submit', e => {
    e.preventDefault();
    const raw = $('#recInput')?.value || '';
    const id = extractAccountId(raw);
    if(!id || typeof id === 'object'){
      body.innerHTML = `<div class="empty-state error">⚠ ${t('not_found')}</div>`;
      return;
    }
    analyze(id);
  });
  if(savedId){
    const id = extractAccountId(savedId);
    if(id && typeof id !== 'object') analyze(id);
  }
}

// ================================================================
// ИДЕАЛЬНЫЙ ПИК
// ================================================================
async function renderPick(app){
  const heroes = cache.heroStats || await fetch(`${API}/heroStats`).then(r=>r.json());
  cache.heroStats = heroes;
  const selected = new Set();
  app.innerHTML = `
    <h2 class="page-title">${t('pick_title')}</h2>
    <p class="page-sub">${t('pick_sub')} · <span style="color:var(--muted)">${t('pick_select')}</span></p>
    <div class="filters" style="justify-content:space-between">
      <div>${t('pick_selected')}: <b id="pickCount">0</b></div>
      <div style="display:flex;gap:8px">
        <button id="pickClear" class="settings-btn">${t('pick_clear')}</button>
        <button id="pickAnalyze" class="settings-btn active">${t('pick_analyze')}</button>
      </div>
    </div>
    <h3>${t('pick_enemy')}</h3>
    <div class="hero-grid" id="pickGrid" style="grid-template-columns:repeat(auto-fill,minmax(100px,1fr))">
      ${heroes.sort((a,b)=>(a.localized_name||'').localeCompare(b.localized_name||'','ru')).map(h => `
        <div class="hero-card pick-hero" data-id="${h.id}" style="cursor:pointer">
          <img src="${heroImgUrl(h.id)}" alt="${esc(h.localized_name)}" loading="lazy"/>
          <div class="name">${esc(h.localized_name)}</div>
        </div>`).join('')}
    </div>
    <div id="pickResult" style="margin-top:32px"></div>
  `;
  function updateCount(){
    const c = $('#pickCount');
    if(c) c.textContent = selected.size;
  }
  $$('.pick-hero').forEach(card => {
    on(card, 'click', () => {
      const id = Number(card.dataset.id);
      if(selected.has(id)){ selected.delete(id); card.classList.remove('picked'); }
      else { selected.add(id); card.classList.add('picked'); }
      updateCount();
    });
  });
  on($('#pickClear'), 'click', () => {
    selected.clear();
    $$('.pick-hero').forEach(c => c.classList.remove('picked'));
    updateCount();
    $('#pickResult').innerHTML = '';
  });
  on($('#pickAnalyze'), 'click', async () => {
    const result = $('#pickResult');
    if(!selected.size){
      result.innerHTML = `<div class="empty-state error">⚠ ${t('pick_need_heroes')}</div>`;
      return;
    }
    result.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
    try{
      const enemyIds = [...selected];
      const allMatchups = await Promise.all(
        enemyIds.map(id => fetch(`${API}/heroes/${id}/matchups`).then(r=>r.json()).catch(()=>[]))
      );
      const candidates = {};
      allMatchups.forEach(matchups => {
        for(const m of matchups){
          if(!m.hero_id || !m.games_played || m.games_played < 10) continue;
          const wr = (m.wins / m.games_played) * 100;
          if(!candidates[m.hero_id]) candidates[m.hero_id] = { id:m.hero_id, wrs:[], games:0 };
          candidates[m.hero_id].wrs.push(wr);
          candidates[m.hero_id].games += m.games_played;
        }
      });
      const list = Object.values(candidates)
        .filter(c => c.wrs.length === enemyIds.length)
        .map(c => ({ ...c, avgWr: c.wrs.reduce((a,b)=>a+b,0) / c.wrs.length }));
      const topPicks = [...list].sort((a,b)=>b.avgWr-a.avgWr).slice(0,5);
      const topBans  = [...list].sort((a,b)=>a.avgWr-b.avgWr).slice(0,5);
      result.innerHTML = `
        <h3>✅ ${t('pick_picks')}</h3>
        <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          ${topPicks.length ? topPicks.map(c => `<a class="hero-card" href="#/hero/${c.id}">
            <img src="${heroImgUrl(c.id)}" alt=""/>
            <div class="name">${esc(heroName(c.id))}</div>
            <span class="wr">${c.avgWr.toFixed(1)}% ${t('pick_wr_vs')} · ${c.games} ${t('pick_games_vs')}</span>
          </a>`).join('') : `<div class="empty-state">${t('no_data')}</div>`}
        </div>
        <h3 style="margin-top:32px">🚫 ${t('pick_bans')}</h3>
        <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          ${topBans.length ? topBans.map(c => `<a class="hero-card" href="#/hero/${c.id}">
            <img src="${heroImgUrl(c.id)}" alt=""/>
            <div class="name">${esc(heroName(c.id))}</div>
            <span class="wr bad">${c.avgWr.toFixed(1)}% ${t('pick_wr_vs')} · ${c.games} ${t('pick_games_vs')}</span>
          </a>`).join('') : `<div class="empty-state">${t('no_data')}</div>`}
        </div>`;
    }catch(e){
      result.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  });
}

// ================================================================
// ЛИГИ
// ================================================================
async function renderLeagues(app){
  app.innerHTML = `
    <h2 class="page-title">Лиги и турниры</h2>
    <p class="page-sub">Список лиг из OpenDota</p>
    <div class="filters">
      <label for="leagueSearch">${t('search')}:</label>
      <input id="leagueSearch" type="text" placeholder="Название лиги…"
             style="flex:1;max-width:320px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg3);color:var(--text);outline:none"/>
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
      const show = filtered.slice(0,100);
      body.innerHTML = show.length ? `
        <p class="page-sub">Найдено: ${filtered.length.toLocaleString('ru-RU')} · показано ${show.length}</p>
        ${show.map(l => `<div class="league-row">
          <div><div class="lname">${esc(l.name||'—')}</div>
            <div class="lmeta">ID ${l.leagueid}${l.tier?' · tier: '+esc(l.tier):''}</div></div>
          <a href="https://www.opendota.com/leagues/${l.leagueid}" target="_blank" rel="noopener" style="font-size:13px">Матчи ↗</a>
        </div>`).join('')}
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
// ПРО
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
    for(const p of proPlayers){ if(p.team_id && p.team_name) teamSet.set(p.team_id, p.team_name); }
    const topTeams = [...teamSet.entries()].slice(0,20);
    const body = $('#proBody');
    if(!body) return;
    body.innerHTML = `
      <h3>🔥 Последние про-матчи</h3>
      <div class="matches-list">
        ${matches.slice(0,20).map(m => {
          const dur = m.duration ? fmtDuration(m.duration) : '—';
          return `<a class="match-row ${m.radiant_win?'win':'lose'}" href="#/match/${m.match_id}">
            <div style="font-size:11px;color:var(--muted);text-align:center">
              ${m.radiant_win?'<span style="color:var(--ok);font-weight:700">R</span>':'<span style="color:var(--bad);font-weight:700">D</span>'}
            </div>
            <div class="match-info">
              <span class="hero-name">${esc(m.radiant_name||'Radiant')} vs ${esc(m.dire_name||'Dire')}</span>
              <span class="match-meta">${esc(m.league_name||'—')} · ${dur} · ${m.radiant_score||0}:${m.dire_score||0}</span>
            </div>
            <div class="kda"><div class="kda-val">${m.match_id}</div><div class="result">→</div></div>
          </a>`;
        }).join('')}
      </div>
      <h3 style="margin-top:36px">🏆 Топ команд</h3>
      <div class="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
        ${topTeams.map(([id,name]) => `<a class="hero-card" href="https://www.opendota.com/teams/${id}" target="_blank" rel="noopener" style="padding:14px;text-align:left">
          <div class="name" style="padding:0;font-size:13px">${esc(name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">team_id ${id}</div>
        </a>`).join('')}
      </div>`;
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
    <p class="page-sub">Steam ID, Steam64, Dotabuff, OpenDota</p>
    <form class="search-form" id="playerForm">
      <input id="playerInput" placeholder="88141661 / ссылка" value="${esc(presetId)}"/>
      <button type="submit">${t('search')}</button>
    </form>
    <div class="quick-links"><span>Быстро:</span>
      <button data-id="88141661">Dendi</button>
      <button data-id="86745912">Miracle-</button>
      <button data-id="111620041">SumaiL</button>
      <button data-id="132851371">Puppey</button>
      <button data-id="19672354">Arteezy</button>
    </div>
    <div id="playerResult" style="margin-top:24px"></div>
  `;
  const result = $('#playerResult');
  async function showPlayer(accountId){
    result.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
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
      result.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
    }
  }
  on($('#playerForm'), 'submit', e => {
    e.preventDefault();
    const id = extractAccountId($('#playerInput')?.value || '');
    if(!id || typeof id === 'object'){
      result.innerHTML = `<div class="empty-state error">⚠ ${t('not_found')}</div>`;
      return;
    }
    showPlayer(id);
  });
  $$('.quick-links button').forEach(b => on(b, 'click', () => {
    $('#playerInput').value = b.dataset.id;
    showPlayer(b.dataset.id);
  }));
  if(presetId){
    const id = extractAccountId(presetId);
    if(id && typeof id !== 'object') showPlayer(id);
  }
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
      <img class="avatar" src="${p.avatarfull||''}" alt="" onerror="this.style.display='none'"/>
      <div class="info">
        <h3>${esc(p.personaname||'—')}</h3>
        <div class="meta"><span>ID: ${p.account_id}</span>${p.loccountrycode?`<span>${esc(p.loccountrycode)}</span>`:''}
          <a href="https://steamcommunity.com/profiles/${steam32To64(p.account_id)}" target="_blank" rel="noopener">Steam ↗</a>
          <a href="https://www.opendota.com/players/${p.account_id}" target="_blank" rel="noopener">OpenDota ↗</a>
          <a href="https://www.dotabuff.com/players/${p.account_id}" target="_blank" rel="noopener">Dotabuff ↗</a>
          <a href="#/compare/${p.account_id}">Сравнить ⚔</a>
        </div>
      </div>
      ${rImg ? `<div class="rank-badge"><img src="${rImg}" onerror="this.style.display='none'"/>
        <div class="rank-txt"><b>${esc(rankName(rankTier))}</b>tier ${rankTier}</div></div>` : ''}
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
          return `<a class="match-row ${won?'win':'lose'}" href="#/match/${m.match_id}">
            <img class="hero-img" src="${heroImgUrl(m.hero_id)}" loading="lazy"/>
            <div class="match-info">
              <span class="hero-name">${esc(heroName(m.hero_id))}</span>
              <span class="match-meta">${won?'Победа':'Поражение'} · ${fmtDuration(m.duration)} · ${fmtDate(m.start_time)}</span>
            </div>
            <div class="kda">
              <div class="kda-val"><span class="k">${m.kills}</span> / <span class="d">${m.deaths}</span> / ${m.assists}</div>
              <div class="result ${won?'win':'lose'}">${won?'WIN':'LOSE'}</div>
            </div>
          </a>`;
        }).join('') : `<div class="empty-state">${t('no_data')}</div>`}
      </div>
    </div>
    <div class="tab-panel" id="tab-heroes">
      ${heroes?.length ? `<table class="data-table">
        <thead><tr><th>${t('hero')}</th><th>${t('games')}</th><th>${t('wins')}</th><th>${t('winrate')}</th></tr></thead>
        <tbody>${heroes.map(h => {
          const wr = h.games ? (h.win/h.games*100) : 0;
          const cls = wr>=50?'good':'bad';
          return `<tr>
            <td><a href="#/hero/${h.hero_id}"><img src="${heroImgUrl(h.hero_id)}"/><span>${esc(heroName(h.hero_id))}</span></a></td>
            <td>${h.games}</td><td>${h.win}</td>
            <td class="wr-cell ${cls}">${wr.toFixed(1)}%</td>
          </tr>`;
        }).join('')}</tbody></table>` : `<div class="empty-state">${t('no_data')}</div>`}
    </div>
    <div class="tab-panel" id="tab-charts">
      <div class="chart-wrap"><h3>GPM / XPM</h3>
        <div class="chart-canvas-wrap"><canvas id="chartGpmXpm"></canvas></div></div>
      <div class="chart-wrap"><h3>K / D / A</h3>
        <div class="chart-canvas-wrap"><canvas id="chartKda"></canvas></div></div>
    </div>
  `;
  $$('.tabs button', cont).forEach(btn => on(btn, 'click', () => {
    $$('.tabs button', cont).forEach(b => b.classList.remove('active'));
    $$('.tab-panel', cont).forEach(p => p.classList.remove('active'));
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
  const g = $('#chartGpmXpm');
  if(g){
    if(cache._charts.gpm){ try{ cache._charts.gpm.destroy(); }catch{} }
    cache._charts.gpm = new Chart(g, {
      type:'line', data:{ labels, datasets:[
        { label:'GPM', data:sorted.map(m=>m.gold_per_min||0), borderColor:'#e05a3a', backgroundColor:'rgba(224,90,58,.15)', tension:.3, fill:true, pointRadius:2 },
        { label:'XPM', data:sorted.map(m=>m.xp_per_min||0), borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,.15)', tension:.3, fill:true, pointRadius:2 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ position:'top' } } },
    });
  }
  const k = $('#chartKda');
  if(k){
    if(cache._charts.kda){ try{ cache._charts.kda.destroy(); }catch{} }
    cache._charts.kda = new Chart(k, {
      type:'bar', data:{ labels, datasets:[
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
  const A0 = params?.[0] || '', B0 = params?.[1] || '';
  app.innerHTML = `
    <h2 class="page-title">${t('nav_compare')}</h2>
    <div class="compare-grid">
      <div class="compare-card">
        <form class="search-form" id="formA" style="margin:0"><input id="inputA" placeholder="A" value="${esc(A0)}"/></form>
        <div id="cardA" style="margin-top:14px"></div>
      </div>
      <div class="compare-card">
        <form class="search-form" id="formB" style="margin:0"><input id="inputB" placeholder="B" value="${esc(B0)}"/></form>
        <div id="cardB" style="margin-top:14px"></div>
      </div>
    </div>
    <div id="compareBody"></div>
  `;
  let A=null, B=null;
  async function loadOne(w, raw){
    const id = extractAccountId(raw);
    const card = $(`#card${w}`);
    if(!id || typeof id==='object'){ if(card) card.innerHTML = `<div class="empty-state error">⚠</div>`; return null; }
    card.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;
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
      card.innerHTML = `<img src="${p.avatarfull||''}" onerror="this.style.display='none'"/>
        <h3>${esc(p.personaname||'—')}</h3>
        <div class="meta">ID ${p.account_id}</div>
        ${profile.rank_tier?`<div class="meta" style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px">${rImg?`<img src="${rImg}" style="width:36px;height:36px;border:none" onerror="this.style.display='none'"/>`:''}<span>${esc(rankName(profile.rank_tier))}</span></div>`:''}`;
      return data;
    }catch(e){
      card.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
      return null;
    }
  }
  function renderComparison(){
    const body = $('#compareBody');
    if(!A||!B){ body.innerHTML = `<div class="empty-state">${t('no_data')}</div>`; return; }
    const rows = [
      [t('matches'), A.wl.win+A.wl.lose, B.wl.win+B.wl.lose, 'higher'],
      [t('wins'),    A.wl.win,           B.wl.win,           'higher'],
      [t('losses'),  A.wl.lose,          B.wl.lose,          'lower'],
      [t('winrate'), A.wr.toFixed(1)+'%',B.wr.toFixed(1)+'%','wr'],
      [t('rank'),    rankName(A.rankTier),rankName(B.rankTier),'rank'],
    ];
    const better = (a,b,m) => {
      if(m==='higher') return a>b?'l':(b>a?'r':'');
      if(m==='lower')  return a<b?'l':(b<a?'r':'');
      if(m==='wr')     return parseFloat(a)>parseFloat(b)?'l':(parseFloat(b)>parseFloat(a)?'r':'');
      if(m==='rank')   return (A.rankTier||0)>(B.rankTier||0)?'l':((B.rankTier||0)>(A.rankTier||0)?'r':'');
      return '';
    };
    body.innerHTML = `<div class="compare-stats">${rows.map(([lbl,a,b,m]) => {
      const w = better(a,b,m);
      return `<div class="compare-row">
        <div class="l ${w==='l'?'better':''}">${esc(String(a))}</div>
        <div class="lbl">${esc(lbl)}</div>
        <div class="r ${w==='r'?'better':''}">${esc(String(b))}</div>
      </div>`;
    }).join('')}</div>`;
  }
  on($('#formA'), 'submit', async e => { e.preventDefault(); A = await loadOne('A', $('#inputA').value); renderComparison(); });
  on($('#formB'), 'submit', async e => { e.preventDefault(); B = await loadOne('B', $('#inputB').value); renderComparison(); });
  if(A0) A = await loadOne('A', A0);
  if(B0) B = await loadOne('B', B0);
  renderComparison();
}

// ================================================================
// МАТЧ — полная страница
// ================================================================
async function renderMatch(app, params){
  const matchId = params?.[0];
  if(!matchId){ app.innerHTML = `<div class="empty-state error">${t('not_found')}</div>`; return; }
  app.innerHTML = `<div class="empty-state"><span class="dot loading"></span> ${t('loading')}</div>`;

  try{
    const [m, items, abilities] = await Promise.all([
      fetch(`${API}/matches/${matchId}`).then(r=>r.json()),
      loadItems(),
      loadAbilities(),
    ]);
    if(!m || !m.match_id) throw new Error(t('not_found'));

    const radiantWin = m.radiant_win;
    const players = m.players || [];
    const rad = players.filter(p => p.player_slot < 128);
    const dire = players.filter(p => p.player_slot >= 128);
    const isParsed = !!m.version;

    const itemImg = (id) => {
      if(!id) return '';
      const slug = cache.itemById[String(id)];
      if(!slug) return '';
      const item = items[slug];
      const urls = itemImgCandidates(item, slug);
      return urls[0] || '';
    };
    const itemName = (id) => {
      if(!id) return '';
      const slug = cache.itemById[String(id)];
      return slug ? (items[slug]?.dname || slug) : '';
    };
    const abilityImg = (id) => {
      if(!id) return '';
      return `${ABILITY_CDN}/${id}.png`;
    };

    const renderAbilities = (player) => {
      const arr = player.ability_upgrades_arr || [];
      if(!arr.length) return '<span style="color:var(--muted);font-size:12px">—</span>';
      return `<div class="abilities-row">
        ${arr.map((id, i) => `<span class="ability-step" title="Ур. ${i+1}">
          <img src="${abilityImg(id)}" onerror="this.style.opacity='.3'"/>
        </span>`).join('')}
      </div>`;
    };

    const renderItems = (player) => {
      const main = ['item_0','item_1','item_2','item_3','item_4','item_5'];
      const back = ['backpack_0','backpack_1','backpack_2'];
      const neutral = ['item_neutral'];
      const slot = (k) => {
        const id = player[k];
        if(!id) return `<span class="slot empty"></span>`;
        const img = itemImg(id);
        const name = itemName(id);
        return `<span class="slot" title="${esc(name)}">
          ${img ? `<img src="${img}" onerror="this.style.display='none'"/>` : `<span class="slot-text">${esc(name.slice(0,3))}</span>`}
        </span>`;
      };
      return `
        <div class="items-grid">
          <div class="items-row">${main.map(slot).join('')}</div>
          <div class="items-row small">
            ${back.map(slot).join('')}
            <span class="separator"></span>
            ${neutral.map(slot).join('')}
          </div>
        </div>
      `;
    };

    const playerRow = (p, side) => {
      const kills = p.kills || 0, deaths = p.deaths || 0, assists = p.assists || 0;
      const kda = deaths ? ((kills + assists) / deaths) : (kills + assists);
      const isRadiant = side === 'radiant';
      return `
        <tr class="player-tr ${isRadiant ? 'radiant-row' : 'dire-row'}">
          <td class="cell-hero">
            <a href="#/hero/${p.hero_id}" class="hero-mini">
              <img src="${heroImgUrl(p.hero_id)}" alt=""/>
              <div>
                <div class="hero-mini-name">${esc(heroName(p.hero_id))}</div>
                <div class="hero-mini-level">Lv ${p.level || '?'}</div>
              </div>
            </a>
          </td>
          <td class="cell-player">
            <a href="#/player/${p.account_id}">${esc(p.personaname || p.name || 'Anonymous')}</a>
          </td>
          <td class="cell-num"><b>${kills}</b> / <span style="color:var(--bad)">${deaths}</span> / ${assists}</td>
          <td class="cell-num">${kda.toFixed(2)}</td>
          <td class="cell-num">${(p.total_gold || 0).toLocaleString('ru-RU')}</td>
          <td class="cell-num">${p.gold_per_min || 0}</td>
          <td class="cell-num">${p.xp_per_min || 0}</td>
          <td class="cell-num">${p.last_hits || 0} / ${p.denies || 0}</td>
          <td class="cell-num">${(p.hero_damage || 0).toLocaleString('ru-RU')}</td>
          <td class="cell-num">${(p.tower_damage || 0).toLocaleString('ru-RU')}</td>
          <td class="cell-num">${(p.hero_healing || 0).toLocaleString('ru-RU')}</td>
          <td class="cell-items">${renderItems(p)}</td>
          <td class="cell-abilities">${renderAbilities(p)}</td>
          <td class="cell-num small-meta">
            ${p.rune_pickups || 0} 🧿 ·
            ${p.camps_stacked || 0} 🏕 ·
            ${p.obs_placed || 0} 👁 ·
            ${p.sen_placed || 0} 🔭
          </td>
          <td class="cell-num">${p.buyback_count || 0}</td>
        </tr>
      `;
    };

    const roshanEvents = (m.objectives || []).filter(o => o.type === 'roshan_kill');
    const firstBlood = m.first_blood_time;
    const goldAdv = m.radiant_gold_adv || [];
    const xpAdv = m.radiant_xp_adv || [];

    app.innerHTML = `
      <a href="#/pro" style="font-size:13px">← ${t('nav_pro')}</a>
      <h2 class="page-title" style="margin-top:12px">Match #${m.match_id}</h2>

      <div class="match-header">
        <div style="font-size:22px;font-weight:700;display:flex;gap:16px;justify-content:center;align-items:center;flex-wrap:wrap">
          <span style="color:var(--ok)">🌿 Radiant ${m.radiant_score||0}</span>
          <span style="color:var(--muted)">—</span>
          <span style="color:var(--bad)">${m.dire_score||0} Dire 🔥</span>
        </div>
        <div class="${radiantWin?'radiant-win':'dire-win'}" style="margin-top:8px">
          ${radiantWin?'Победа Radiant':'Победа Dire'}
        </div>
        <div class="match-meta" style="margin-top:16px">
          <span>⏱ ${fmtDuration(m.duration||0)}</span>
          <span>📅 ${fmtDate(m.start_time||0)}</span>
          <span>🎮 ${GAME_MODES[m.game_mode]||'Mode '+m.game_mode}</span>
          ${m.league_name?`<span>🏆 ${esc(m.league_name)}</span>`:''}
          ${firstBlood ? `<span>🩸 Первая кровь: ${fmtDuration(firstBlood)}</span>` : ''}
          ${!isParsed ? `<span style="color:var(--warn)">⚠ Матч не распарсен — часть данных недоступна</span>` : ''}
        </div>
      </div>

      <div class="tabs">
        <button data-tab="players" class="active">👥 Игроки</button>
        <button data-tab="charts">📈 Графики</button>
        <button data-tab="events">🎯 События</button>
      </div>

      <div class="tab-panel active" id="tab-players">
        <h3 style="margin-bottom:12px;color:var(--ok)">🌿 Radiant</h3>
        <div class="players-table-wrap">
          <table class="players-table">
            <thead><tr>
              <th>Герой</th><th>Игрок</th><th>K/D/A</th><th>KDA</th>
              <th>Net</th><th>GPM</th><th>XPM</th><th>LH/DN</th>
              <th>Hero DMG</th><th>Tower DMG</th><th>Heal</th>
              <th>Предметы</th><th>Скиллы</th><th>Прочее</th><th>BB</th>
            </tr></thead>
            <tbody>${rad.map(p => playerRow(p, 'radiant')).join('')}</tbody>
          </table>
        </div>
        <h3 style="margin:24px 0 12px;color:var(--bad)">🔥 Dire</h3>
        <div class="players-table-wrap">
          <table class="players-table">
            <thead><tr>
              <th>Герой</th><th>Игрок</th><th>K/D/A</th><th>KDA</th>
              <th>Net</th><th>GPM</th><th>XPM</th><th>LH/DN</th>
              <th>Hero DMG</th><th>Tower DMG</th><th>Heal</th>
              <th>Предметы</th><th>Скиллы</th><th>Прочее</th><th>BB</th>
            </tr></thead>
            <tbody>${dire.map(p => playerRow(p, 'dire')).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="tab-panel" id="tab-charts">
        <div class="chart-wrap">
          <h3>💰 Net worth advantage <span style="font-size:12px;color:var(--muted)">(&gt; 0 — ведёт Radiant)</span></h3>
          <div class="chart-canvas-wrap"><canvas id="chartGoldAdv"></canvas></div>
        </div>
        <div class="chart-wrap">
          <h3>⭐ XP advantage</h3>
          <div class="chart-canvas-wrap"><canvas id="chartXpAdv"></canvas></div>
        </div>
        <div class="chart-wrap">
          <h3>💎 Net worth по игрокам</h3>
          <div class="chart-canvas-wrap"><canvas id="chartGoldPlayers"></canvas></div>
        </div>
      </div>

      <div class="tab-panel" id="tab-events">
        <h3>🐉 Рошаны</h3>
        ${roshanEvents.length ? `
          <table class="data-table" style="margin-top:12px">
            <thead><tr><th>Время</th><th>Команда</th></tr></thead>
            <tbody>${roshanEvents.map(r => `
              <tr>
                <td>${fmtDuration(r.time || 0)}</td>
                <td>${r.team === 2 ? '<span style="color:var(--ok)">🌿 Radiant</span>' : '<span style="color:var(--bad)">🔥 Dire</span>'}</td>
              </tr>`).join('')}</tbody>
          </table>
        ` : '<div class="empty-state">Нет данных о Рошане (матч не распарсен)</div>'}
        <h3 style="margin-top:24px">🩸 Первая кровь</h3>
        <div class="status-summary" style="margin-top:12px">
          ${firstBlood ? `Через <b>${fmtDuration(firstBlood)}</b> после начала игры` : '<span style="color:var(--muted)">Нет данных</span>'}
        </div>
      </div>

      <p style="text-align:center;color:var(--muted);font-size:13px;margin-top:30px">
        <a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota ↗</a>
        &nbsp;·&nbsp;
        <a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff ↗</a>
        &nbsp;·&nbsp;
        <a href="https://stratz.com/matches/${m.match_id}" target="_blank" rel="noopener">STRATZ ↗</a>
      </p>
    `;

    $$('.tabs button', app).forEach(btn => on(btn, 'click', () => {
      $$('.tabs button', app).forEach(b => b.classList.remove('active'));
      $$('.tab-panel', app).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = $('#tab-'+btn.dataset.tab, app);
      if(panel) panel.classList.add('active');
      if(btn.dataset.tab === 'charts') setTimeout(() => drawMatchCharts(m, goldAdv, xpAdv), 30);
    }));

    setTimeout(() => drawMatchCharts(m, goldAdv, xpAdv), 80);

  }catch(e){
    app.innerHTML = `<div class="empty-state error">⚠ ${esc(e.message)}</div>`;
  }
}

function drawMatchCharts(m, goldAdv, xpAdv){
  if(!window.Chart) return;

  const canvasGold = document.getElementById('chartGoldAdv');
  if(canvasGold && goldAdv?.length){
    if(cache._charts.matchGold){ try{ cache._charts.matchGold.destroy(); }catch{} }
    const labels = goldAdv.map((_, i) => `${i}м`);
    cache._charts.matchGold = new Chart(canvasGold, {
      type: 'line',
      data: { labels, datasets: [{ label:'Radiant − Dire', data:goldAdv,
        borderColor:'#e05a3a', backgroundColor:'rgba(224,90,58,.15)',
        tension:.3, fill:true, pointRadius:0 }]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false,
        plugins:{ legend:{ display:false }},
        scales:{ y:{ grid:{ color:'rgba(255,255,255,.06)' }},
                 x:{ grid:{ display:false }, ticks:{ maxTicksLimit:12 }}}},
    });
  }

  const canvasXp = document.getElementById('chartXpAdv');
  if(canvasXp && xpAdv?.length){
    if(cache._charts.matchXp){ try{ cache._charts.matchXp.destroy(); }catch{} }
    const labels = xpAdv.map((_, i) => `${i}м`);
    cache._charts.matchXp = new Chart(canvasXp, {
      type:'line',
      data:{ labels, datasets:[{ label:'Radiant − Dire', data:xpAdv,
        borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,.15)',
        tension:.3, fill:true, pointRadius:0 }]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false,
        plugins:{ legend:{ display:false }},
        scales:{ y:{ grid:{ color:'rgba(255,255,255,.06)' }},
                 x:{ grid:{ display:false }, ticks:{ maxTicksLimit:12 }}}},
    });
  }

  const canvasPlayers = document.getElementById('chartGoldPlayers');
  if(canvasPlayers && m.players?.length){
    const sorted = [...m.players].sort((a,b) => {
      if(a.player_slot < 128 && b.player_slot >= 128) return -1;
      if(a.player_slot >= 128 && b.player_slot < 128) return 1;
      return 0;
    });
    const labels = sorted.map(p => heroName(p.hero_id));
    const data = sorted.map(p => p.total_gold || 0);
    const colors = sorted.map(p => p.player_slot < 128 ? '#3fb950' : '#f85149');
    if(cache._charts.matchPlayers){ try{ cache._charts.matchPlayers.destroy(); }catch{} }
    cache._charts.matchPlayers = new Chart(canvasPlayers, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Net worth', data, backgroundColor:colors }]},
      options:{ responsive:true, maintainAspectRatio:false, animation:false,
        plugins:{ legend:{ display:false }},
        scales:{ y:{ grid:{ color:'rgba(255,255,255,.06)' }},
                 x:{ grid:{ display:false }, ticks:{ maxRotation:45, minRotation:30 }}}},
    });
  }
}

// ================================================================
// ДРУГИЕ САЙТЫ
// ================================================================
const SITES = [
  { icon:'🎨', title:'Dota2PornFxWeb', url:'https://h6rd.github.io/Dota2PornFxWeb/', desc:'VPK-паки со скинами для Dota 2.', tags:['Скины','VPK'] },
  { icon:'😀', title:'Dota 2 Emoticons', url:'https://aluerie.github.io/Dota2Utils/ListEmoticons/', desc:'Список эмодзи для Dota 2.', tags:['Эмодзи'] },
  { icon:'📊', title:'Dota 2 Pro Tracker', url:'https://dota2protracker.com/', desc:'Статистика про-игроков.', tags:['Про','Мета'] },
  { icon:'👁', title:'OpenDota', url:'https://www.opendota.com/', desc:'Открытая статистика Dota 2.', tags:['API'] },
  { icon:'🐃', title:'Dotabuff', url:'https://www.dotabuff.com/', desc:'Популярная статистика.', tags:['Профили'] },
  { icon:'🚀', title:'STRATZ', url:'https://stratz.com/', desc:'Аналитика Dota 2.', tags:['Аналитика'] },
];
async function renderSites(app){
  app.innerHTML = `
    <h2 class="page-title">🔗 ${t('nav_sites')}</h2>
    <p class="page-sub">Полезные ресурсы по Dota 2</p>
    <div class="sites-grid">
      ${SITES.map(s => `<a class="site-card" href="${s.url}" target="_blank" rel="noopener">
        <div class="site-icon">${s.icon}</div>
        <div class="site-title">${esc(s.title)}<span class="ext">↗</span></div>
        <div class="site-desc">${s.desc}</div>
        <div class="site-tags">${s.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
      </a>`).join('')}
    </div>`;
}

// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================
function boot(){
  initSettings();
  initLang();
  loadHeroMap().catch(()=>{});

  window.addEventListener('hashchange', () => navigate());

  if(!location.hash){ location.hash = '#/servers'; }
  else { navigate(); }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
