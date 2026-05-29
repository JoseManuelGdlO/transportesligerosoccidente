 
self.addEventListener("push", (event) => {
  let data = { title: "TLO", body: "", url: "/" };
  try {
    if (event.data) {
      const t = event.data.text();
      const j = JSON.parse(t);
      if (j.title) data.title = j.title;
      if (j.body) data.body = j.body;
      if (j.url) data.url = j.url;
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rel = event.notification.data?.url || "/";
  const targetUrl = new URL(rel, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          void c.navigate(targetUrl);
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
