// api/stream.js — buffers video so we can send Content-Length + handle Range
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

  // ── Validate ────────────────────────────────────────────
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400, headers: CORS });
  if (!/^https:\/\/tiktokio\.app\/download\.php\?stream=1/.test(url)) {
    return new Response("Invalid stream url", { status: 400, headers: CORS });
  }

  // ── Fetch upstream (full body) ──────────────────────────
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://tiktokio.app/",
        Accept: "*/*",
      },
      redirect: "follow",
    });
  } catch (e) {
    return new Response("Upstream fetch failed: " + String(e), {
      status: 502,
      headers: CORS,
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream ${upstream.status}`, {
      status: upstream.status,
      headers: CORS,
    });
  }

  // Buffer the entire body — needed because upstream sends no Content-Length
  const buf = new Uint8Array(await upstream.arrayBuffer());
  const total = buf.byteLength;

  const range = req.headers.get("range");

  // ── Range response (206) ────────────────────────────────
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end   = m[2] ? parseInt(m[2], 10) : total - 1;
      const safeEnd = Math.min(end, total - 1);

      if (start <= safeEnd) {
        const slice = buf.slice(start, safeEnd + 1);
        const h = new Headers(CORS);
        h.set("Content-Type", "video/mp4");
        h.set("Content-Length", String(slice.byteLength));
        h.set("Content-Range", `bytes ${start}-${safeEnd}/${total}`);
        h.set("Accept-Ranges", "bytes");
        h.set("Cache-Control", "no-store");
        return new Response(slice, { status: 206, headers: h });
      }
      // Unsatisfiable range
      return new Response(null, {
        status: 416,
        headers: {
          ...CORS,
          "Content-Range": `bytes */${total}`,
        },
      });
    }
  }

  // ── Full response (200) ─────────────────────────────────
  const h = new Headers(CORS);
  h.set("Content-Type", "video/mp4");
  h.set("Content-Length", String(total));
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", "no-store");

  // HEAD requests don't send a body
  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers: h });
  }

  return new Response(buf, { status: 200, headers: h });
}
