// sw.js — Service Worker
// 完全オフライン対応・キャッシュ戦略

const CACHE_NAME = 'sudoku-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/engine/validator.js',
  '/engine/solver.js',
  '/engine/analyzer.js',
  '/engine/generator.js',
];

// ---- インストール：静的アセットをキャッシュ ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ---- アクティベート：古いキャッシュを削除 ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---- フェッチ：Cache First 戦略 ----
self.addEventListener('fetch', event => {
  // HTMLは Network First（最新版を優先）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // その他は Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return res;
      });
    })
  );
});

// ---- バックグラウンド同期（将来対応）----
self.addEventListener('sync', event => {
  if (event.tag === 'sync-records') {
    // オンライン時にスコアを同期（将来実装）
  }
});
