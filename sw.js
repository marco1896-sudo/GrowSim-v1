const CACHE_VERSION = 'growsim-v1-20260303';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');

function appPath(relativePath) {
  const normalized = String(relativePath || '').replace(/^\//, '');
  return `${BASE_PATH}/${normalized}`.replace(/\/\/+/g, '/');
}

const APP_SHELL_FILES = [
  appPath(''),
  appPath('index.html'),
  appPath('styles.css'),
  appPath('app.js'),
  appPath('manifest.webmanifest'),
  appPath('data/events.json'),
  appPath('icons/icon-192.png'),
  appPath('icons/icon-512.png'),
  appPath('assets/backgrounds/bg_dark_01.jpg'),
  appPath('assets/backgrounds/bg_dark_02.jpg')
];

self.addEventListener('install', (event) => {
  console.info('[sw] install', CACHE_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.info('[sw] activate', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    return;
  }

  if (url.pathname.startsWith(appPath('assets/'))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (url.pathname === appPath('data/events.json')) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationFallback(event.request));
    return;
  }

  event.respondWith(shellThenNetwork(event.request));
});

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }

  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_error) {
    return hit || Response.error();
  }
}

async function shellThenNetwork(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  const cached = await shellCache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      shellCache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_error) {
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_error) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function navigationFallback(request) {
  try {
    const fresh = await fetch(request);
    const shellCache = await caches.open(SHELL_CACHE);
    shellCache.put(appPath('index.html'), fresh.clone());
    return fresh;
  } catch (_error) {
    const shellCache = await caches.open(SHELL_CACHE);
    return shellCache.match(appPath('index.html'));
  }
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Grow Simulator',
    body: 'Ein neues Ereignis wartet.',
    eventId: 'unknown'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed
      };
    } catch (_error) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: appPath('icons/icon-192.png'),
      badge: appPath('icons/icon-192.png'),
      data: {
        url: `${appPath('')}#event=${encodeURIComponent(payload.eventId || 'unknown')}`
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || appPath('');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return null;
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event && event.data ? event.data : null;
  if (!data || data.type !== 'GS_SHOW_NOTIFICATION') {
  if (!data || data.type !== 'SHOW_NOTIFICATION') {
    return;
  }

  const title = data.title || 'GrowSim';
  const options = data.options && typeof data.options === 'object' ? data.options : {};
  event.waitUntil(self.registration.showNotification(title, options));
});
