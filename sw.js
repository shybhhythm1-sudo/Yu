// خدمة الخلفية (Service Worker) لتطبيق "المُصحف"
// المهام: (1) تفعيل التثبيت الحقيقي كتطبيق PWA
//         (2) تخزين مؤقت لهيكل التطبيق ليعمل حتى لو ضعف الاتصال
//         (3) عرض إشعارات نظام حقيقية (تظهر في شريط إشعارات الهاتف)
//         (4) محاولة تشغيل تذكيرات دورية عبر Periodic Background Sync (مدعومة جزئيًا فقط على أندرويد/كروم)

const CACHE_NAME = 'quran-app-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// شبكة أولاً لطلبات الـ API (نصوص القرآن، مواقيت الصلاة) حتى تكون دائمًا محدثة،
// وملفات التطبيق نفسها من التخزين المؤقت أولاً حتى يفتح بسرعة وبدون إنترنت.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isAppShell = APP_SHELL.some(p => url.pathname.endsWith(p.replace('./', '')));

  if (isAppShell) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // لباقي الطلبات (API خارجية) — لا نتدخل، نتركها تمر عادي لأصل الموقع
});

// -------- الإشعارات --------
// الصفحة الرئيسية (index.html) بترسل رسالة هنا كل ما يحين وقت أذان/تذكير،
// وإحنا هنا بنستخدم registration.showNotification عشان يظهر إشعار حقيقي
// في نظام الهاتف (حتى لو المتصفح/التطبيق مصغّر)، مش مجرد toast جوه الصفحة.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const title = data.title || 'المُصحف';
    const options = {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      // نمط اهتزاز مميز وقت الأذان نفسه (أطول من التذكير العادي)، يتحدد من الصفحة
      vibrate: Array.isArray(data.vibrate) ? data.vibrate : [200, 100, 200],
      silent: false, // يطلب من النظام تشغيل صوت الإشعار الافتراضي (المتصفح لا يدعم صوت mp3 مخصص داخل الإشعار نفسه)
      tag: data.tag || 'quran-app-notif',
      renotify: true,
      requireInteraction: !!data.requireInteraction,
      data: { url: data.url || './index.html', isAdhan: !!data.isAdhan }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// -------- محاولة مزامنة دورية في الخلفية (Periodic Background Sync) --------
// ملحوظة مهمة: هذه الميزة مدعومة فقط على متصفح Chrome على أندرويد بعد تثبيت
// التطبيق فعليًا على الشاشة الرئيسية، وغير مدعومة على iOS/Safari أو متصفحات سطح المكتب.
// لذلك هي "إضافة أفضلية" وليست الاعتماد الأساسي لعمل الإشعارات.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'quran-prayer-check') {
    event.waitUntil(
      self.registration.showNotification('المُصحف', {
        body: 'افتح التطبيق الآن — لو فاتك وقت أذان قريب هيشغّله لك التطبيق فورًا.',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [150, 80, 150],
        tag: 'periodic-check'
      })
    );
  }
});
