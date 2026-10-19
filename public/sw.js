const VERSION = "luskam-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.add(OFFLINE_URL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("luskam-shell-") && name !== VERSION).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/auth") || url.pathname.startsWith("/account") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/checkout")) return;
  if (["code", "token", "access_token", "refresh_token"].some((key) => url.searchParams.has(key))) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      return (await caches.match(OFFLINE_URL)) || Response.error();
    }
  })());
});
