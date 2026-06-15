// Service worker for Firebase Cloud Messaging (background push only — no caching)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDyRYM0h3HKGkM5-NFRAfNqIF3xV4bwbTo',
  authDomain: 'thirst-trap-15acc.firebaseapp.com',
  projectId: 'thirst-trap-15acc',
  storageBucket: 'thirst-trap-15acc.firebasestorage.app',
  messagingSenderId: '826121149801',
  appId: '1:826121149801:web:87e496a7b01b080890b1f8',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Thirst Trap', {
    body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: { url: payload.fcmOptions?.link || 'https://thirst-trap-15acc.web.app' },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('thirst-trap') && 'focus' in client) return client.focus();
      }
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
