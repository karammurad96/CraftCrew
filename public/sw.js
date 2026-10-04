/* CraftCrew service worker (T84): makes the app installable and keeps the page shell usable with poor or no
 * reception. It never touches /api/ or /uploads/ requests — those always go to the network, so data is never
 * served stale; offline writes are queued by offline-sync.js instead. Static files (HTML, JS, CSS, icons)
 * come from the network first and are cached as they arrive; the cached copy answers only when the network
 * fails, so a page the phone has opened before stays usable with no signal at all. Network first (T141): after
 * a deploy every file is the new version at once, never old scripts talking to a new server.
 */
// v4 (T141): network first, so old caches are dropped
const CACHE = "craftcrew-shell-v4";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        // No network: the copy from the last visit, and for a page navigation the shell rather than an error page
        const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
        if (cached) return cached;
        if (req.mode === "navigate") return (await cache.match("/index.html")) || Response.error();
        return Response.error();
      }
    }),
  );
});
