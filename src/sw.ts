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

self.addEventListener("install", (event: ExtendableEvent) => {
  void event;
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();

          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        }
      } catch {}
      try {
        await self.clients.claim();
      } catch {}
    })(),
  );
});

let logout_purge_in_progress = false;

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.origin && event.origin !== self.location.origin) {
    return;
  }
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "LOGOUT_PURGE") {
    if (logout_purge_in_progress) return;
    logout_purge_in_progress = true;
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
        logout_purge_in_progress = false;
      })(),
    );
  }
});

const ALLOWED_NOTIFICATION_PATH_PREFIXES = [
  "/inbox",
  "/email/",
  "/search",
  "/settings",
  "/contacts",
  "/subscriptions",
  "/all",
  "/starred",
  "/sent",
  "/drafts",
  "/archive",
  "/spam",
  "/trash",
  "/folder/",
  "/tag/",
];

function sanitize_notification_path(input: unknown): string {
  if (typeof input !== "string") return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  if (input.startsWith("/\\")) return "/";
  if (/[\r\n\t]/.test(input)) return "/";
  if (input.length > 256) return "/";
  for (const prefix of ALLOWED_NOTIFICATION_PATH_PREFIXES) {
    if (input === prefix.replace(/\/$/, "") || input.startsWith(prefix)) {
      return input;
    }
  }

  return "/";
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: { type?: string; title?: string; body?: string; url?: unknown } = {};

  try {
    data = event.data.json();
  } catch {
    data = { title: "AsterMail", body: event.data.text() };
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const is_test = data.type === "test";
      const app_is_open = clients.length > 0;

      if (app_is_open && !is_test) {
        return;
      }

      const safe_url = sanitize_notification_path(data.url);
      const options: NotificationOptions = {
        body: "You have a new message",
        icon: "/pwa-192x192.png",
        badge: "/favicon-32x32.png",
        tag: data.type || "default",
        data: { url: safe_url },
      };

      await self.registration.showNotification("AsterMail", options);
    })(),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url_to_open = sanitize_notification_path(event.notification.data?.url);

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
