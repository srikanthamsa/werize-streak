self.addEventListener("push", (event) => {
  const data = event.data.json();
  const title = data.title || "Streak";
  const options = {
    body: data.body,
    icon: "/streak-logo.png",
    badge: "/streak-logo.png",
    data: data.data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/")
  );
});
