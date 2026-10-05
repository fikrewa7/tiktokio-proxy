// api/tiktok.js — NO runtime config needed

const UPSTREAM = "https://tiktokio.app/download.php";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Referer": "https://tiktokio.app/",
        "Origin": "https://tiktokio.app",
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

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Upstream fetch failed", detail: String(err) });
  }
}
