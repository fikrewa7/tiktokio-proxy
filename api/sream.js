// api/stream.js — streaming proxy with Range + CORS preflight support
export const config = { runtime: "edge" };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Type, Content-Range, Accept-Ranges",
};

export default async function handler(req) {
  // ── Preflight ───────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  // ── Validate URL ────────────────────────────────────────
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400, headers: CORS });
  if (!/^https:\/\/tiktokio\.app\/download\.php\?stream=1/.test(url)) {
    return new Response("Invalid stream url", { status: 400, headers: CORS });
  }

  // ── Forward headers (incl. Range) ───────────────────────
  const fwd = {
    "User-Agent": UA,
    Referer: "https://tiktokio.app/",
    Accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) fwd.Range = range;

  // ── Fetch upstream ──────────────────────────────────────
  let upstream;
  try {
    upstream = await fetch(url, { headers: fwd, redirect: "follow" });
  } catch (e) {
    return new Response("Upstream fetch failed: " + String(e), {
      status: 502,
      headers: CORS,
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(
      `Upstream ${upstream.status}: ${upstream.statusText}`,
      { status: upstream.status, headers: CORS }
    );
  }

  // ── Build response headers ──────────────────────────────
  const headers = new Headers(CORS);
  const pass = ["content-type", "content-length", "content-range", "accept-ranges"];
  for (const h of pass) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  // Critical: media players reject responses with no content-type
  if (!headers.get("content-type")) {
    headers.set("Content-Type", "video/mp4");
  }

  // Tell browsers not to cache expiring signed URLs
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,   // pass through 200 or 206
    headers,
  });
}
