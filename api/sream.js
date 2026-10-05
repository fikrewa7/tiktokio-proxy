// api/stream.js — proxies video bytes through your domain with CORS
export const config = { runtime: "edge" }; // edge streams without the 4.5MB body limit

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export default async function handler(req) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  // Only allow tiktokio.app stream URLs — prevents open-proxy abuse
  if (!/^https:\/\/tiktokio\.app\/download\.php\?stream=1/.test(url)) {
    return new Response("Invalid stream url", { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://tiktokio.app/" },
  });

  if (!upstream.ok) {
    return new Response("Upstream error", { status: upstream.status });
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  const cl = upstream.headers.get("content-length");
  if (ct) headers.set("Content-Type", ct);
  if (cl) headers.set("Content-Length", cl);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Type");
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, { status: 200, headers });
}
