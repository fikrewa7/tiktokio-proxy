// api/tiktok.js
// POST /api/tiktok  { url: "https://vt.tiktok.com/...", type: "" }
//
// Proxies tiktokio.app extraction + resolves the numeric TikTok video ID
// via the official oEmbed endpoint. Returns JSON with CORS headers so it
// can be called from any origin.

const UPSTREAM = "https://tiktokio.app/download.php";
const OEMBED   = "https://www.tiktok.com/oembed";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ─── CORS ────────────────────────────────────────────────
// Use "*" while testing. For production, swap to an allowlist:
//   const ALLOWED = ["http://localhost:7700", "https://your-site.com"];
//   const origin = req.headers.origin;
//   if (ALLOWED.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//     res.setHeader("Vary", "Origin");
//   }
function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─── numeric video ID via oEmbed ─────────────────────────
async function resolveVideoId(tiktokUrl) {
  try {
    const r = await fetch(`${OEMBED}?url=${encodeURIComponent(tiktokUrl)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    // oEmbed returns { html: '<blockquote ... data-video-id="7412...">…</blockquote>' }
    const m = (j.html || "").match(/data-video-id="(\d+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ─── handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  applyCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, type = "" } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing 'url' field" });
  }

  try {
    // 1. Extract from tiktokio
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
        Referer: "https://tiktokio.app/",
        Origin: "https://tiktokio.app",
      },
      body: JSON.stringify({ url, type }),
    });

    const text = await upstream.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(upstream.status).json({
        error: "Upstream returned non-JSON",
        status: upstream.status,
        body: text.slice(0, 500),
      });
    }

    // 2. Enrich with numeric video ID (non-blocking failure — null on error)
    if (data && data.status === "success") {
      data.video_id = await resolveVideoId(url);
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({
      error: "Upstream fetch failed",
      detail: String(err),
    });
  }
}
