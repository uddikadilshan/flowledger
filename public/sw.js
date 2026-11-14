// Cache public shell assets only. Never cache Supabase, auth callbacks, business data or mutations.
const CACHE = "flowledger-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "/offline.html",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("flowledger-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const r = event.request,
    u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    event.respondWith(fetch(r).catch(() => caches.match("/offline.html")));
    return;
  }
  if (
    u.pathname.startsWith("/_next/static/") ||
    u.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(r).then(
        (cached) =>
          cached ||
          fetch(r).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((c) => c.put(r, copy)));
            }
            return response;
          }),
      ),
    );
  }
});
