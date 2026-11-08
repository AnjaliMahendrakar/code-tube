// CodeTube server: serves the web app and a small JSON API over the curated catalog.
// No dependencies. Run with:  node server.js   (Node 18 or newer)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'catalog.json'), 'utf8'));

/* ---------- catalog indexes ---------- */
const LANGS = { en: 'English', hi: 'Hindi', te: 'Telugu' };
const topicLabel = Object.fromEntries(catalog.topics.map(t => [t.id, t.label]));
const items = catalog.items.map((it, order) => ({
  ...it,
  order,
  langName: LANGS[it.lang],
  topicLabels: it.topics.map(t => topicLabel[t]),
  // lower-cased text used for search
  _title: it.title.toLowerCase(),
  _channel: (it.channel + ' ' + it.handle + ' ' + ((catalog.channelAliases || {})[it.handle] || '')).toLowerCase(),
  _rest: [it.about, ...it.topics.map(t => topicLabel[t]), LANGS[it.lang], it.type].join(' ').toLowerCase()
}));
const byId = new Map(items.map(i => [i.id, i]));
const byYt = new Map(items.map(i => [i.ytId, i]));

const publicItem = ({ _title, _channel, _rest, ...rest }) => rest;

function pathsFor(id) {
  return catalog.paths
    .filter(p => p.steps.includes(id))
    .map(p => ({ id: p.id, title: p.title, step: p.steps.indexOf(id) + 1, of: p.steps.length }));
}

function related(item, limit = 12) {
  const primary = item.topics[0];
  const score = other => {
    let s = 0;
    if (other.topics[0] === primary) s += 4;
    s += other.topics.filter(t => item.topics.includes(t)).length * 2;
    if (other.lang === item.lang) s += 1;
    if (other.handle === item.handle) s += 1;
    return s;
  };
  return items
    .filter(o => o.id !== item.id)
    .map(o => ({ o, s: score(o) }))
    .filter(x => x.s > 1)
    .sort((a, b) => b.s - a.s || a.o.order - b.o.order)
    .slice(0, limit)
    .map(x => publicItem(x.o));
}

function tokens(q) {
  return String(q || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}+#.]+/u).filter(Boolean);
}

function search(q, { lang, limit = 40 } = {}) {
  const words = tokens(q);
  if (!words.length) return [];
  const out = [];
  for (const it of items) {
    if (lang && it.lang !== lang) continue;
    let score = 0;
    let all = true;
    for (const w of words) {
      let s = 0;
      if (it._title.includes(w)) s += it._title.split(/\s+/).includes(w) ? 6 : 4;
      if (it._channel.includes(w)) s += 3;
      if (it._rest.includes(w)) s += 1;
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) out.push({ it, score });
  }
  out.sort((a, b) => b.score - a.score || a.it.order - b.it.order);
  return out.slice(0, limit).map(x => publicItem(x.it));
}

function suggest(q) {
  const words = tokens(q);
  if (!words.length) return [];
  const seen = new Set();
  const out = [];
  for (const it of search(q, { limit: 30 })) {
    const t = it.title;
    if (!seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length >= 8) break;
  }
  return out;
}

/* ---------- API ---------- */
function api(url) {
  const p = url.pathname;
  const q = url.searchParams;
  const lang = LANGS[q.get('lang')] ? q.get('lang') : null;

  if (p === '/api/health') return [200, { ok: true, items: items.length }];

  if (p === '/api/topics') {
    return [200, catalog.topics.map(t => ({ ...t, count: items.filter(i => i.topics.includes(t.id) && (!lang || i.lang === lang)).length }))];
  }

  if (p === '/api/videos') {
    const topic = q.get('topic');
    const type = q.get('type');
    const limit = Math.min(Math.max(parseInt(q.get('limit'), 10) || 24, 1), 100);
    const offset = Math.max(parseInt(q.get('offset'), 10) || 0, 0);
    const list = items.filter(i =>
      (!lang || i.lang === lang) &&
      (!topic || topic === 'all' || i.topics.includes(topic)) &&
      (!type || i.type === type));
    return [200, { total: list.length, offset, limit, items: list.slice(offset, offset + limit).map(publicItem) }];
  }

  let m = p.match(/^\/api\/videos\/([\w.-]+)$/);
  if (m) {
    const it = byId.get(m[1]);
    if (!it) return [404, { error: 'No video with that id.' }];
    return [200, { item: publicItem(it), related: related(it), paths: pathsFor(it.id) }];
  }

  if (p === '/api/watch') {
    const key = q.get('list') && !q.get('v') ? 'p-' + q.get('list') : 'v-' + q.get('v');
    const it = byId.get(key) || byYt.get(q.get('v') || '') || byYt.get(q.get('list') || '');
    if (!it) return [404, { error: 'This video is not in the CodeTube catalog.' }];
    return [200, { item: publicItem(it), related: related(it), paths: pathsFor(it.id) }];
  }

  if (p === '/api/search') {
    const query = (q.get('q') || '').slice(0, 200);
    const results = search(query, { lang, limit: Math.min(parseInt(q.get('limit'), 10) || 40, 100) });
    return [200, { q: query, total: results.length, items: results }];
  }

  if (p === '/api/suggest') return [200, suggest((q.get('q') || '').slice(0, 100))];

  m = p.match(/^\/api\/channels\/([\w.-]+)$/);
  if (m) {
    const list = items.filter(i => i.handle.toLowerCase() === m[1].toLowerCase());
    if (!list.length) return [404, { error: 'No channel with that handle.' }];
    return [200, { channel: { handle: list[0].handle, name: list[0].channel, avatar: list[0].avatar }, items: list.map(publicItem) }];
  }

  if (p === '/api/paths') {
    return [200, catalog.paths.map(pa => ({ ...pa, items: pa.steps.map(id => publicItem(byId.get(id))) }))];
  }

  return [404, { error: 'Unknown API route.' }];
}

/* ---------- HTTP ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    "img-src 'self' data: https://i.ytimg.com https://yt3.googleusercontent.com https://yt3.ggpht.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  // YouTube embeds need the page origin in the Referer header, so keep this policy.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
// Paths the single-page app handles in the browser.
const APP_ROUTES = /^\/($|watch$|results$|feed\/history$|paths$|@[\w.-]+$)/;

function send(req, res, status, body, type, extra = {}) {
  const headers = { 'Content-Type': type, ...SECURITY_HEADERS, ...extra };
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const compressible = /^(text\/|application\/(json|manifest)|image\/svg)/.test(type) && buf.length > 1024;
  if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(status, headers);
    return res.end(req.method === 'HEAD' ? undefined : zlib.gzipSync(buf));
  }
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendFile(req, res, file, cache) {
  fs.readFile(file, (err, data) => {
    if (err) return send(req, res, 404, 'Not found', TYPES['.txt']);
    send(req, res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': cache });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, JSON.stringify({ error: 'Method not allowed.' }), TYPES['.json'], { Allow: 'GET, HEAD' });
  }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(req, res, 400, 'Bad request', TYPES['.txt']); }

  if (url.pathname.startsWith('/api/')) {
    let status, body;
    try { [status, body] = api(url); } catch (e) { status = 500; body = { error: 'Server error.' }; console.error(e); }
    return send(req, res, status, JSON.stringify(body), TYPES['.json'], { 'Cache-Control': 'no-cache' });
  }

  if (APP_ROUTES.test(url.pathname)) {
    return sendFile(req, res, path.join(PUBLIC_DIR, 'index.html'), 'no-cache');
  }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'Bad request', TYPES['.txt']); }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(req, res, 404, 'Not found', TYPES['.txt']);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(req, res, 404, 'Not found', TYPES['.txt']);
    sendFile(req, res, file, 'public, max-age=3600');
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`CodeTube running at http://localhost:${PORT}`));
}

module.exports = { server, search, related };
