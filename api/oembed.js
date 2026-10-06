// api/oembed.js  —  ESM version (matches "type": "module")
// Usage:  GET /api/oembed?url=https://www.tiktok.com/@tiktok

const TIKTOK_OEMBED = 'https://www.tiktok.com/oembed';
const TTL_MS        = 60 * 60 * 1000;
const MAX_ENTRIES   = 200;
const UPSTREAM_MS   = 8000;

const mem = new Map();

function memGet(k) {
  const hit = mem.get(k);
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) { mem.delete(k); return null; }
  mem.delete(k); mem.set(k, hit);
  return hit.v;
}
function memSet(k, v) {
  if (mem.size >= MAX_ENTRIES) mem.delete(mem.keys().next().value);
  mem.set(k, { t: Date.now(), v });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const raw = req.query && req.query.url;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'Missing ?url= query param' });
    return;
  }

  let parsed;
  try { parsed = new URL(raw); }
  catch { res.status(400).json({ error: 'Invalid URL' }); return; }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) {
    res.status(400).json({ error: 'Only tiktok.com URLs are allowed' });
    return;
  }

  const cached = memGet(raw);
  if (cached) {
    res.setHeader('X-Cache',       'HIT-MEM');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(cached);
    return;
  }

  const upstreamURL = `${TIKTOK_OEMBED}?url=${encodeURIComponent(raw)}`;
  const controller  = new AbortController();
  const timer       = setTimeout(() => controller.abort(), UPSTREAM_MS);

  try {
    const upstream = await fetch(upstreamURL, {
      signal:  controller.signal,
      headers: {
        Accept:       'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TikTokOEmbedProxy/1.0)',
      },
    });
    clearTimeout(timer);

    const text = await upstream.text();

    if (!upstream.ok) {
      res.status(upstream.status)
         .setHeader('X-Upstream-Status', String(upstream.status))
         .json({
           error:  'Upstream oEmbed failed',
           status: upstream.status,
           detail: text.slice(0, 400),
         });
      return;
    }

    let data;
    try { data = JSON.parse(text); }
    catch {
      res.status(502).json({
        error:  'Upstream returned non-JSON',
        detail: text.slice(0, 200),
      });
      return;
    }

    memSet(raw, data);

    res.setHeader('X-Cache',       'MISS');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(data);

  } catch (err) {
    clearTimeout(timer);
    const aborted = err && err.name === 'AbortError';
    res.status(502).json({
      error:  aborted ? 'Upstream timeout' : 'Fetch failed',
      detail: String((err && err.message) || err),
    });
  }
}
