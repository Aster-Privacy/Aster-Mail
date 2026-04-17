//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
/// <reference lib="webworker" />
export {};

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();

          await Promise.all(
            keys.map((k) => caches.delete(k).catch(() => false)),
          );
        }
      } catch {}
      try {
        await self.clients.claim();
      } catch {}
    })(),
  );
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.origin && event.origin !== self.location.origin) {
    return;
  }
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: { type?: string; title?: string; body?: string } = {};

  try {
    data = event.data.json();
  } catch {
    data = { title: "AsterMail", body: event.data.text() };
  }

  const title = data.title || "AsterMail";
  const options: NotificationOptions = {
    body: data.body || "You have a new notification",
    icon: "/pwa-192x192.png",
    badge: "/favicon-32x32.png",
    tag: data.type || "default",
    data: { url: "/mail/inbox" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url_to_open = event.notification.data?.url || "/mail/inbox";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((window_clients) => {
        for (const client of window_clients) {
          if (client.url.includes(url_to_open) && "focus" in client) {
            return client.focus();
          }
        }

        return self.clients.openWindow(url_to_open);
      }),
  );
});
