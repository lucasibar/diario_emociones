const CACHE_NAME = 'mood-tracker-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
  './icon.svg'
];

// Install and Cache Assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate & Cleanup Old Caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Cache-First with Network Fallback
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).catch(() => {
        // Fallback for document navigation if offline and not cached
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Listen to Push Notifications
self.addEventListener('push', (e) => {
  let data = {
    title: '¿Cómo te sentís hoy?',
    body: 'Es hora de registrar tu humor. ¡Toca un emoji!'
  };

  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = {
        title: '¿Cómo te sentís hoy?',
        body: e.data.text()
      };
    }
  }

  const options = {
    body: data.body,
    icon: 'icon.svg',
    badge: 'icon.svg',
    vibrate: [200, 100, 200],
    tag: 'mood-notification',
    renotify: true,
    data: {
      url: self.registration.scope
    },
    actions: [
      { action: 'sad', title: '😞 Mal' },
      { action: 'neutral', title: '😐 Neutral' },
      { action: 'happy', title: '😊 Bien' }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle Notification Actions and Clicks
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  let moodVal = '';
  if (e.action === 'sad') {
    moodVal = '2';
  } else if (e.action === 'neutral') {
    moodVal = '3';
  } else if (e.action === 'happy') {
    moodVal = '4';
  }

  // Construct URL with query parameters
  const baseUrl = e.notification.data.url;
  const targetUrl = moodVal ? `${baseUrl}?mood=${moodVal}` : baseUrl;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an open tab and navigate it
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
        }
      }
      // If no tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
