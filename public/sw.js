/* CraftCrew service worker (T84): makes the app installable and keeps the page shell usable with poor or no
 * reception. It never touches /api/ or /uploads/ requests — those always go to the network, so data is never
 * served stale; offline writes are queued by offline-sync.js instead. Static files (HTML, JS, CSS, icons)
 * use stale-while-revalidate: the cached copy answers instantly, and a background fetch refreshes it for
 * next time, so a page the phone has opened before stays usable with no signal at all.
 */
const CACHE = "craftcrew-shell-v1";
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
      const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        network; // refresh the cache in the background; the page already has an answer
        return cached;
      }
      const fresh = await network;
      if (fresh) return fresh;
      // Nothing cached and no network: for a page navigation, the shell is better than a browser error page.
      if (req.mode === "navigate") return (await cache.match("/index.html")) || Response.error();
      return Response.error();
    }),
  );
});
