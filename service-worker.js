const CACHE_NAME = "ademritme-v8";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js?v=timing-5-1-v1",
  "manifest.webmanifest",
  "favicon.ico",
  "icons/logo.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "audio/hrv-breath-5min.mp3?v=timing-5-1-v1",
  "audio/hrv-breath-8min.mp3?v=timing-5-1-v1",
  "audio/hrv-breath-12min.mp3?v=timing-5-1-v1",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.headers.has("range")) {
    event.respondWith(handleRangeRequest(event.request));
    return;
  }
  if (shouldUseNetworkFirst(event.request)) {
    event.respondWith(fetchAndCache(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetchAndCache(event.request);
    }),
  );
});

function shouldUseNetworkFirst(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return request.mode === "navigate" || request.destination === "script";
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

async function handleRangeRequest(request) {
  const cached = await caches.match(request.url);
  const response = cached || await fetch(request.url);
  const range = request.headers.get("range");
  const match = /bytes=(\d+)-(\d*)/.exec(range || "");
  if (!match) return response;

  const arrayBuffer = await response.arrayBuffer();
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : arrayBuffer.byteLength - 1;
  const chunk = arrayBuffer.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.byteLength),
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
    },
  });
}
