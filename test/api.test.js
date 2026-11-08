// Run with: npm test   (uses Node's built-in test runner, no packages needed)
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');
const catalog = require('../data/catalog.json');

let base;
before(() => new Promise(resolve => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); })));
after(() => new Promise(resolve => server.close(resolve)));
const get = async (p, opts) => { const r = await fetch(base + p, opts); return { status: r.status, headers: r.headers, body: r.headers.get('content-type').includes('json') ? await r.json() : await r.text() }; };

test('catalog is well formed', () => {
  const ids = new Set();
  for (const it of catalog.items) {
    assert.ok(!ids.has(it.id), 'duplicate ' + it.id); ids.add(it.id);
    assert.match(it.id, /^(v|p)-[\w-]+$/);
    assert.ok(['video', 'playlist'].includes(it.type));
    assert.ok(['en', 'hi', 'te'].includes(it.lang));
    assert.ok(it.title && it.channel && it.handle && it.thumb && it.avatar.startsWith('https://'));
    for (const t of it.topics) assert.ok(catalog.topics.some(x => x.id === t), 'unknown topic ' + t);
  }
  for (const p of catalog.paths) for (const s of p.steps) assert.ok(ids.has(s), `path ${p.id} has missing step ${s}`);
});

test('health', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.items, catalog.items.length);
});

test('videos are paginated and filter by language and topic', async () => {
  const page = await get('/api/videos?limit=10&offset=5');
  assert.equal(page.body.items.length, 10);
  assert.equal(page.body.total, catalog.items.length);
  const te = await get('/api/videos?lang=te&limit=100');
  assert.ok(te.body.total > 10);
  assert.ok(te.body.items.every(i => i.lang === 'te'));
  const dsa = await get('/api/videos?topic=dsa&limit=100');
  assert.ok(dsa.body.items.every(i => i.topics.includes('dsa')));
  assert.ok(!('_title' in dsa.body.items[0]), 'internal search fields must not leak');
});

test('search ranks title matches first and respects language', async () => {
  const r = await get('/api/search?q=' + encodeURIComponent('striver graph'));
  assert.equal(r.status, 200);
  assert.equal(r.body.items[0].id, 'p-PLgUwDviBIf0oE3gA41TKO2H5bHpPd7fzn');
  const te = await get('/api/search?q=java&lang=te');
  assert.ok(te.body.items.length >= 2 && te.body.items.every(i => i.lang === 'te'));
  const none = await get('/api/search?q=zzzzqqq');
  assert.equal(none.body.total, 0);
});

test('suggestions return titles', async () => {
  const r = await get('/api/suggest?q=spring');
  assert.ok(r.body.length > 0 && r.body.every(t => typeof t === 'string'));
});

test('watch lookup by video id and playlist id, with related and paths', async () => {
  const v = await get('/api/watch?v=rfscVS0vtbw');
  assert.equal(v.status, 200);
  assert.equal(v.body.item.type, 'video');
  assert.ok(v.body.related.length > 0 && v.body.related.every(r => r.id !== v.body.item.id));
  const p = await get('/api/watch?list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz');
  assert.equal(p.body.item.type, 'playlist');
  assert.ok(p.body.paths.some(x => x.id === 'dsa'));
  const missing = await get('/api/watch?v=doesnotexist');
  assert.equal(missing.status, 404);
});

test('channel pages', async () => {
  const r = await get('/api/channels/takeUforward');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 5);
  assert.equal((await get('/api/channels/nobody-here')).status, 404);
});

test('paths include full items', async () => {
  const r = await get('/api/paths');
  assert.equal(r.body.length, catalog.paths.length);
  assert.ok(r.body[0].items[0].title);
});

test('app routes serve the page, static files have types and security headers', async () => {
  for (const p of ['/', '/watch?v=rfscVS0vtbw', '/results?search_query=dsa', '/feed/history', '/paths', '/@takeUforward']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.body, /<title>CodeTube<\/title>/);
  }
  const js = await get('/app.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  const csp = js.headers.get('content-security-policy');
  assert.match(csp, /frame-src https:\/\/www\.youtube-nocookie\.com/);
  assert.match(csp, /img-src[^;]*i\.ytimg\.com/);
  assert.equal(js.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('blocks path traversal and unknown files', async () => {
  assert.equal((await get('/..%2fserver.js')).status, 404);
  assert.equal((await get('/%2e%2e/data/catalog.json')).status, 404);
  assert.equal((await get('/nope.js')).status, 404);
  assert.equal((await get('/api/nope')).status, 404);
});

test('gzip for large responses', async () => {
  const r = await fetch(base + '/api/videos?limit=100', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  const body = await r.json();
  assert.equal(body.items.length, 100);
});
