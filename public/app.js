// CodeTube front end: a small single-page app with no build step.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  playlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 7H2v1h20V7zm-9 5H2v-1h11v1zm0 4H2v-1h11v1zm2 3v-8l7 4-7 4z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.71zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12.71 12 8.15 8.15-.71.71L12 12.71l-8.15 8.15-.71-.71L11.29 12 3.15 3.85l.71-.71L12 11.29l8.15-8.15.71.71L12.71 12z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.63 20.66 12 15 18.37V14h-1c-3.96 0-7.14 1-9.75 3.09 1.84-4.07 5.11-6.4 9.89-7.1l.86-.13V5.63M14 3v6C6.22 10.13 3.11 15.33 2 21c2.78-3.97 6.44-6 12-6v6l8-9-8-9z"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3h-7v1h5.29l-8.65 8.65.71.71L20 4.71V10h1V3zM18 20H4V6h7V5H3v16h16v-8h-1v7z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17H9V8h2v9zm4-9h-2v9h2V8zm4-4v1h-1v16H6V5H5V4h4V3h6v1h4zm-2 1H7v15h10V5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19H7V5h2v14zm8-14h-2v14h2V5z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 12 8-12 8V4z"/></svg>'
};

/* ---------- API ---------- */
async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || 'Something went wrong. Try again.'); e.status = r.status; throw e; }
  return body;
}

/* ---------- watch history (kept in this browser only) ---------- */
const HKEY = 'codetube.history.v1';
const PKEY = 'codetube.history.paused';
const History = {
  all() { try { return JSON.parse(localStorage.getItem(HKEY) || '{}'); } catch { return {}; } },
  save(map) { try { localStorage.setItem(HKEY, JSON.stringify(map)); } catch { /* storage full or blocked */ } },
  get(id) { return this.all()[id] || null; },
  paused() { try { return localStorage.getItem(PKEY) === '1'; } catch { return false; } },
  setPaused(v) { try { localStorage.setItem(PKEY, v ? '1' : '0'); } catch { /* ignore */ } },
  put(item, patch = {}) {
    if (this.paused()) return;
    const map = this.all();
    const prev = map[item.id] || {};
    map[item.id] = { ...prev, ...patch, id: item.id, at: Date.now(), item: snapshot(item) };
    const keys = Object.keys(map);
    if (keys.length > 500) keys.sort((a, b) => map[a].at - map[b].at).slice(0, keys.length - 500).forEach(k => delete map[k]);
    this.save(map);
  },
  remove(id) { const m = this.all(); delete m[id]; this.save(m); },
  clear() { this.save({}); }
};
const snapshot = it => ({
  id: it.id, type: it.type, ytId: it.ytId, title: it.title, channel: it.channel, handle: it.handle,
  avatar: it.avatar, length: it.length, lang: it.lang, langName: it.langName, topicLabels: it.topicLabels, about: it.about, thumb: it.thumb
});
function progressOf(id) {
  const h = History.get(id);
  if (!h) return 0;
  if (h.done) return 1;
  return h.dur > 0 && h.pos > 0 ? Math.min(1, h.pos / h.dur) : 0;
}
const watched = id => { const h = History.get(id); return !!h && (h.done || progressOf(id) >= 0.9 || (h.item && h.item.type === 'playlist')); };

/* ---------- small renderers ---------- */
const watchUrl = it => it.type === 'video' ? `/watch?v=${encodeURIComponent(it.ytId)}` : `/watch?list=${encodeURIComponent(it.ytId)}`;
const ytUrl = it => it.type === 'video' ? `https://www.youtube.com/watch?v=${it.ytId}` : `https://www.youtube.com/playlist?list=${it.ytId}`;
const thumbUrl = (it, size = 'hqdefault') => `https://i.ytimg.com/vi/${encodeURIComponent(it.thumb)}/${size}.jpg`;
const initial = name => esc((String(name).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase());

function avatar(it, cls = '') {
  return `<a class="avatar ${cls}" href="/@${encodeURIComponent(it.handle)}" aria-label="${esc(it.channel)} channel">${initial(it.channel)}<img src="${esc(it.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`;
}
function thumb(it, size) {
  const p = progressOf(it.id);
  const badge = it.type === 'playlist' ? `<span class="badge">${ICON.playlist}Playlist</span>` : (it.length ? `<span class="badge">${esc(it.length)}</span>` : '');
  return `<a class="thumb ${it.type}" href="${watchUrl(it)}" tabindex="-1" aria-hidden="true"><img src="${thumbUrl(it, size)}" alt="" loading="lazy" decoding="async">${badge}${p ? `<span class="progress"><i style="width:${(p * 100).toFixed(1)}%"></i></span>` : ''}</a>`;
}
const subline = it => `${esc(it.langName)} · ${esc(it.topicLabels[0])}${it.type === 'playlist' ? ' · Course' : ''}`;

const card = it => `<div class="card">${thumb(it, 'hqdefault')}<div class="details">${avatar(it)}<div class="meta"><a class="title" href="${watchUrl(it)}" title="${esc(it.title)}">${esc(it.title)}</a><a class="channel" href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a><span class="sub">${subline(it)}</span></div></div></div>`;
const compact = it => `<div class="compact">${thumb(it, 'mqdefault')}<div class="meta"><a class="title" href="${watchUrl(it)}" title="${esc(it.title)}">${esc(it.title)}</a><a class="channel" href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a><span class="sub">${subline(it)}</span></div></div>`;
const row = (it, extra = '') => `<div class="row">${thumb(it, 'hqdefault')}<div class="meta"><a class="title" href="${watchUrl(it)}">${esc(it.title)}</a><span class="sub">${subline(it)}${it.length ? ' · ' + esc(it.length) : ''}</span><div class="chan-line">${avatar(it)}<a class="channel" href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a></div><span class="about">${esc(it.about)}</span>${extra}</div></div>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// Replace broken avatar images with the letter underneath.
document.addEventListener('error', e => { const img = e.target; if (img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('avatar')) img.remove(); }, true);

/* ---------- router ---------- */
let routeToken = 0;
function navigate(url, replace = false) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}
document.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a || a.target === '_blank' || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.preventDefault();
  if (u.pathname + u.search + u.hash === location.pathname + location.search + location.hash) return;
  navigate(u.pathname + u.search + u.hash);
});
window.addEventListener('popstate', route);

function setNav(p) {
  const key = p === '/' ? 'home' : p === '/paths' ? 'paths' : p === '/feed/history' ? 'history' : '';
  document.querySelectorAll('.guide a').forEach(a => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

async function route() {
  const token = ++routeToken;
  stopPlayer();
  closeSuggest();
  const u = new URL(location.href);
  const p = u.pathname;
  setNav(p);
  window.scrollTo(0, 0);
  $('#q').value = p === '/results' ? (u.searchParams.get('search_query') || '') : '';
  try {
    if (p === '/') await Home(token);
    else if (p === '/watch') await Watch(token, u.searchParams);
    else if (p === '/results') await Results(token, u.searchParams.get('search_query') || '');
    else if (p === '/feed/history') HistoryPage();
    else if (p === '/paths') await Paths(token);
    else if (p.startsWith('/@')) await Channel(token, decodeURIComponent(p.slice(2)));
    else notFound();
  } catch (err) {
    if (token !== routeToken) return;
    app.innerHTML = `<div class="empty">${esc(err.status === 404 ? "This page isn't available." : err.message)}<br><br><a href="/">Go to Home</a></div>`;
    document.title = 'CodeTube';
  }
}
function notFound() { app.innerHTML = `<div class="empty">This page isn't available.<br><br><a href="/">Go to Home</a></div>`; document.title = 'CodeTube'; }

/* ---------- Home ---------- */
let topicsCache = null;
let homeChip = sessionStorage.getItem('codetube.chip') || 'all';
async function Home(token) {
  document.title = 'CodeTube';
  if (!topicsCache) topicsCache = await getJSON('/api/topics');
  if (token !== routeToken) return;
  const chips = [{ id: 'all', label: 'All' }, { id: 'lang:te', label: 'Telugu' }, { id: 'lang:hi', label: 'Hindi' }, { id: 'lang:en', label: 'English' },
    ...topicsCache.map(t => ({ id: t.id, label: t.label }))];
  if (!chips.some(c => c.id === homeChip)) homeChip = 'all';
  app.innerHTML = `<div class="chips-bar"><div class="chips" role="group" aria-label="Filter">${chips.map(c => `<button type="button" class="chip" data-chip="${c.id}" aria-pressed="${c.id === homeChip}">${esc(c.label)}</button>`).join('')}</div></div><div class="grid" id="grid"></div><div class="loading" id="more">Loading…</div><div class="sentinel" id="sentinel"></div>`;
  const active = app.querySelector('.chip[aria-pressed="true"]');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  app.querySelector('.chips').addEventListener('click', e => {
    const b = e.target.closest('[data-chip]'); if (!b) return;
    homeChip = b.dataset.chip; sessionStorage.setItem('codetube.chip', homeChip);
    app.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    loadFeed(routeToken, true);
  });
  await loadFeed(token, true);
}
let feed = { offset: 0, total: Infinity, busy: false, observer: null };
async function loadFeed(token, reset) {
  if (reset) {
    feed = { offset: 0, total: Infinity, busy: false, observer: feed.observer };
    $('#grid').innerHTML = '';
    window.scrollTo(0, 0);
  }
  if (feed.busy || feed.offset >= feed.total) return;
  feed.busy = true;
  const params = new URLSearchParams({ offset: feed.offset, limit: 24 });
  if (homeChip.startsWith('lang:')) params.set('lang', homeChip.slice(5)); else if (homeChip !== 'all') params.set('topic', homeChip);
  const chipAtRequest = homeChip;
  try {
    const data = await getJSON('/api/videos?' + params);
    if (token !== routeToken || chipAtRequest !== homeChip) return;
    feed.total = data.total; feed.offset += data.items.length;
    $('#grid').insertAdjacentHTML('beforeend', data.items.map(card).join(''));
    const more = $('#more');
    if (more) { more.hidden = feed.offset >= feed.total; if (!data.total) { more.hidden = false; more.textContent = 'Nothing here yet.'; } }
  } finally { feed.busy = false; }
  if (!feed.observer) {
    feed.observer = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting) && $('#grid')) loadFeed(routeToken, false);
    }, { rootMargin: '800px 0px' });
  }
  feed.observer.disconnect();
  const s = $('#sentinel'); if (s) feed.observer.observe(s);
}

/* ---------- Watch ---------- */
let player = null, playerItem = null, saveTimer = null;
async function Watch(token, params) {
  const v = params.get('v'), list = params.get('list');
  if (!v && !list) return notFound();
  const q = new URLSearchParams(v ? { v } : { list });
  const data = await getJSON('/api/watch?' + q);
  if (token !== routeToken) return;
  const it = data.item;
  document.title = it.title + ' - CodeTube';
  const paths = data.paths.map(p => `<a href="/paths#${esc(p.id)}">${esc(p.title)}</a> (step ${p.step} of ${p.of})`).join(', ');
  const tags = [it.langName, ...it.topicLabels].map(t => '#' + t.replace(/[^\p{L}\p{N}]+/gu, '')).join(' ');
  app.innerHTML = `<div class="watch">
    <div class="primary">
      <div class="player" id="player"><div id="yt"></div></div>
      <h1 class="wtitle">${esc(it.title)}</h1>
      <div class="owner">
        ${avatar(it)}
        <div class="owner-name"><a href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a><span>@${esc(it.handle)}</span></div>
        <div class="actions">
          <button type="button" class="pill" id="share">${ICON.share}Share</button>
          <a class="pill" href="${ytUrl(it)}" target="_blank" rel="noopener">${ICON.external}Open on YouTube</a>
        </div>
      </div>
      <div class="desc">
        <p class="dmeta">${it.type === 'playlist' ? 'Playlist / full course' : 'Video' + (it.length ? ' · ' + esc(it.length) : '')} · ${esc(it.langName)}</p>
        ${it.about ? `<p>${esc(it.about)}</p>` : ''}
        ${paths ? `<p>Part of ${paths}.</p>` : ''}
        <p><a href="/results?search_query=${encodeURIComponent(it.topicLabels[0])}">${esc(tags)}</a></p>
      </div>
    </div>
    <aside class="secondary" aria-label="Up next">
      <h2 class="upnext-title">Up next</h2>
      ${data.related.map(compact).join('')}
    </aside>
  </div>`;
  $('#share').addEventListener('click', async () => {
    const link = location.origin + watchUrl(it);
    try { await navigator.clipboard.writeText(link); toast('Link copied'); }
    catch { toast(link); }
  });
  mountPlayer(token, it);
}

let ytReady = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube player could not load'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('YouTube player timed out')), 10000);
  });
  ytReady.catch(() => { ytReady = null; });
  return ytReady;
}

async function mountPlayer(token, it) {
  const h = History.get(it.id);
  const vars = { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin };
  if (h && !h.done && h.dur > 60 && h.pos > 10 && h.pos < h.dur - 20) vars.start = Math.floor(h.pos);
  if (it.type === 'playlist') {
    vars.listType = 'playlist'; vars.list = it.ytId;
    if (h && Number.isInteger(h.idx) && h.idx > 0) vars.index = h.idx;
  }
  playerItem = it;
  try {
    const YT = await loadYouTubeAPI();
    if (token !== routeToken) return;
    const opts = {
      host: 'https://www.youtube-nocookie.com',
      width: '100%', height: '100%', playerVars: vars,
      events: {
        onStateChange: e => onState(e, it),
        onError: e => onPlayerError(e, it)
      }
    };
    if (it.type === 'video') opts.videoId = it.ytId;
    player = new YT.Player('yt', opts);
  } catch {
    if (token !== routeToken) return;
    // Fallback: a plain embed still plays the video; progress is not tracked.
    const params = new URLSearchParams({ autoplay: 1, rel: 0, playsinline: 1 });
    if (vars.start) params.set('start', vars.start);
    const src = it.type === 'video'
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.ytId)}?${params}`
      : `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(it.ytId)}&${params}`;
    $('#player').innerHTML = `<iframe src="${src}" title="${esc(it.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    History.put(it);
  }
}

function saveProgress(it, extra = {}) {
  if (!player || typeof player.getCurrentTime !== 'function') return;
  try {
    const pos = player.getCurrentTime() || 0;
    const dur = player.getDuration() || 0;
    const patch = { pos, dur, ...extra };
    if (it.type === 'playlist' && typeof player.getPlaylistIndex === 'function') {
      const idx = player.getPlaylistIndex();
      if (idx >= 0) patch.idx = idx;
    }
    if (it.type === 'video' && dur && pos >= dur * 0.95) patch.done = true;
    History.put(it, patch);
  } catch { /* player not ready */ }
}
function onState(e, it) {
  const S = window.YT.PlayerState;
  if (e.data === S.PLAYING) {
    saveProgress(it);
    clearInterval(saveTimer);
    saveTimer = setInterval(() => saveProgress(it), 5000);
  } else if (e.data === S.PAUSED || e.data === S.BUFFERING) {
    saveProgress(it);
    if (e.data === S.PAUSED) clearInterval(saveTimer);
  } else if (e.data === S.ENDED) {
    clearInterval(saveTimer);
    if (it.type === 'video') saveProgress(it, { done: true });
    else saveProgress(it);
  }
}
function onPlayerError(e, it) {
  const blocked = e.data === 101 || e.data === 150 || e.data === 153;
  $('#player').innerHTML = `<div class="player-msg"><span>${blocked ? 'The owner of this video only allows it to play on YouTube.' : "This video can't be played here right now."}</span><a class="pill dark" href="${ytUrl(it)}" target="_blank" rel="noopener">${ICON.external}Watch on YouTube</a></div>`;
  player = null;
}
function stopPlayer() {
  clearInterval(saveTimer);
  if (player && playerItem) saveProgress(playerItem);
  try { if (player && player.destroy) player.destroy(); } catch { /* ignore */ }
  player = null; playerItem = null;
}
window.addEventListener('pagehide', () => { if (player && playerItem) saveProgress(playerItem); });
document.addEventListener('visibilitychange', () => { if (document.hidden && player && playerItem) saveProgress(playerItem); });

/* ---------- Search ---------- */
async function Results(token, q) {
  document.title = (q ? q + ' - ' : '') + 'CodeTube';
  if (!q.trim()) { app.innerHTML = `<div class="empty">Type something to search.</div>`; return; }
  app.innerHTML = `<div class="page"><div class="loading">Searching…</div></div>`;
  const data = await getJSON('/api/search?' + new URLSearchParams({ q }));
  if (token !== routeToken) return;
  app.innerHTML = `<div class="page">${data.items.length
    ? data.items.map(it => row(it)).join('')
    : `<div class="empty">No results for “${esc(q)}”. Try a shorter search, like a topic or channel name.</div>`}</div>`;
}

const searchForm = $('#search');
const qInput = $('#q');
const sugg = $('#suggestions');
let suggTimer = null, suggIndex = -1, suggItems = [];
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const q = qInput.value.trim();
  if (!q) return;
  closeSuggest();
  qInput.blur();
  navigate('/results?search_query=' + encodeURIComponent(q));
});
qInput.addEventListener('input', () => {
  clearTimeout(suggTimer);
  const q = qInput.value.trim();
  if (!q) return closeSuggest();
  suggTimer = setTimeout(async () => {
    try {
      const list = await getJSON('/api/suggest?' + new URLSearchParams({ q }));
      if (qInput.value.trim() !== q) return;
      suggItems = list; suggIndex = -1;
      if (!list.length) return closeSuggest();
      sugg.innerHTML = list.map((t, i) => `<li role="option" id="s${i}" data-i="${i}" aria-selected="false">${ICON.search}<span>${esc(t)}</span></li>`).join('');
      sugg.hidden = false; qInput.setAttribute('aria-expanded', 'true');
    } catch { closeSuggest(); }
  }, 120);
});
qInput.addEventListener('keydown', e => {
  if (sugg.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = suggItems.length;
    if (e.key === 'ArrowDown') suggIndex = suggIndex >= n - 1 ? -1 : suggIndex + 1;
    else suggIndex = suggIndex <= -1 ? n - 1 : suggIndex - 1;
    sugg.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', i === suggIndex));
    if (suggIndex >= 0) { qInput.value = suggItems[suggIndex]; qInput.setAttribute('aria-activedescendant', 's' + suggIndex); }
  } else if (e.key === 'Escape') { closeSuggest(); }
});
sugg.addEventListener('mousedown', e => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault();
  qInput.value = suggItems[+li.dataset.i];
  searchForm.requestSubmit();
});
qInput.addEventListener('blur', () => setTimeout(closeSuggest, 100));
function closeSuggest() { sugg.hidden = true; sugg.innerHTML = ''; suggIndex = -1; qInput.setAttribute('aria-expanded', 'false'); qInput.removeAttribute('aria-activedescendant'); }
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); qInput.focus(); }
});

/* ---------- History ---------- */
function HistoryPage() {
  document.title = 'Watch history - CodeTube';
  const render = (filter = '') => {
    const paused = History.paused();
    const entries = Object.values(History.all()).filter(e => e.item).sort((a, b) => b.at - a.at)
      .filter(e => !filter || (e.item.title + ' ' + e.item.channel).toLowerCase().includes(filter.toLowerCase()));
    const groups = new Map();
    const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const today = startOfDay(Date.now());
    entries.forEach(e => {
      const day = startOfDay(e.at);
      const label = day === today ? 'Today' : day === today - 864e5 ? 'Yesterday' : day > today - 7 * 864e5
        ? new Date(e.at).toLocaleDateString(undefined, { weekday: 'long' })
        : new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(e);
    });
    const list = entries.length
      ? [...groups].map(([label, es]) => `<h2 class="group-label">${esc(label)}</h2>${es.map(e => {
          const it = e.item;
          return `<div class="row small">${thumb(it, 'hqdefault')}<div class="meta"><a class="title" href="${watchUrl(it)}">${esc(it.title)}</a><a class="channel" href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a><span class="about">${esc(it.about)}</span></div><button type="button" class="remove" data-remove="${esc(it.id)}" aria-label="Remove from watch history" title="Remove from watch history">${ICON.close}</button></div>`;
        }).join('')}`).join('')
      : `<div class="empty">${filter ? 'Nothing in your history matches that search.' : paused ? 'Watch history is paused. Videos you watch won\'t show up here.' : 'Videos you watch will show up here.<br><br><a href="/">Browse videos</a>'}</div>`;
    app.innerHTML = `<div class="page"><div class="page-head"><h1>Watch history</h1></div><div class="history-wrap">
      <div class="history-list">${list}</div>
      <div class="history-side">
        <label class="vh" for="hq">Search watch history</label>
        <input id="hq" type="search" placeholder="Search watch history" value="${esc(filter)}">
        <div id="clear-area"><button type="button" class="link-btn" id="clear">${ICON.trash}Clear all watch history</button></div>
        <button type="button" class="link-btn" id="pause">${paused ? ICON.play + 'Turn on watch history' : ICON.pause + 'Pause watch history'}</button>
        <p class="note">History is saved only in this browser on this device. Nothing is sent to a server and there is no account.</p>
      </div></div></div>`;
    const hq = $('#hq');
    hq.addEventListener('input', () => { const pos = hq.selectionStart; render(hq.value); const n = $('#hq'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#pause').addEventListener('click', () => { History.setPaused(!paused); toast(paused ? 'Watch history is on' : 'Watch history paused'); render(filter); });
    $('#clear').addEventListener('click', () => {
      $('#clear-area').innerHTML = `<div class="confirm"><span>Clear all watch history from this browser? This can't be undone.</span><div><button type="button" class="pill dark" id="yes">Clear history</button><button type="button" class="pill" id="no">Cancel</button></div></div>`;
      $('#yes').addEventListener('click', () => { History.clear(); toast('Watch history cleared'); render(); });
      $('#no').addEventListener('click', () => render(filter));
    });
    app.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { History.remove(b.dataset.remove); toast('Removed from watch history'); render(filter); }));
  };
  render();
}

/* ---------- Learning paths ---------- */
async function Paths(token) {
  document.title = 'Learning paths - CodeTube';
  const paths = await getJSON('/api/paths');
  if (token !== routeToken) return;
  const wanted = location.hash.slice(1);
  app.innerHTML = `<div class="page"><div class="page-head"><h1>Learning paths</h1></div>${paths.map((p, pi) => {
    const done = p.items.filter(i => watched(i.id)).length;
    const next = p.items.find(i => !watched(i.id)) || p.items[0];
    const open = wanted ? wanted === p.id : pi === 0;
    return `<details class="path" id="${esc(p.id)}" ${open ? 'open' : ''}><summary>
      <div class="thumb ${next.type}"><img src="${thumbUrl(next)}" alt="" loading="lazy"><span class="badge">${ICON.playlist}${p.items.length} steps</span></div>
      <div><h2>${esc(p.title)}</h2><p>${esc(p.about)}</p><div class="pbar"><i style="width:${Math.round(done / p.items.length * 100)}%"></i></div><span class="pcount">${done} of ${p.items.length} watched</span></div>
    </summary><ol class="steps">${p.items.map((it, i) => `<li><span class="num">${i + 1}</span>${thumb(it, 'mqdefault')}<div class="meta"><a class="title" href="${watchUrl(it)}">${esc(it.title)}</a><a class="channel" href="/@${encodeURIComponent(it.handle)}">${esc(it.channel)}</a>${watched(it.id) ? '<span class="done-tag">Watched</span>' : ''}</div></li>`).join('')}</ol></details>`;
  }).join('')}</div>`;
  if (wanted) { const el = document.getElementById(wanted); if (el) el.scrollIntoView({ block: 'start' }); }
}

/* ---------- Channel ---------- */
async function Channel(token, handle) {
  const data = await getJSON('/api/channels/' + encodeURIComponent(handle));
  if (token !== routeToken) return;
  const c = data.channel;
  document.title = c.name + ' - CodeTube';
  const fake = { handle: c.handle, channel: c.name, avatar: c.avatar };
  app.innerHTML = `<div class="page" style="max-width:1284px"><div class="chan-head">${avatar(fake)}<div><h1>${esc(c.name)}</h1><p>@${esc(c.handle)} · ${data.items.length} on CodeTube</p><a class="pill" href="https://www.youtube.com/@${encodeURIComponent(c.handle)}" target="_blank" rel="noopener">${ICON.external}View channel on YouTube</a></div></div><div class="grid">${data.items.map(card).join('')}</div></div>`;
}

route();
