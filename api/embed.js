// api/embed.js
export const config = { runtime: 'edge' };

const CACHE_TTL = 3600;

export default async function handler(req) {
  const url = new URL(req.url);
  const username = (url.searchParams.get('user') || 'tiktok').replace(/^@/, '');

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let upstream;
  try {
    upstream = await fetch(`https://www.tiktok.com/embed/@${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    return json({ error: 'fetch failed', detail: String(err.message || err) }, 502, cors);
  }

  const html = await upstream.text();

  const match = html.match(
    /<script id="__FRONTITY_CONNECT_STATE__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) {
    return json({ error: 'state script not found', status: upstream.status }, 502, cors);
  }

  let state;
  try { state = JSON.parse(match[1]); }
  catch (e) {
    return json({ error: 'state JSON parse failed', detail: String(e.message || e) }, 502, cors);
  }

  const data = state?.source?.data?.[`/embed/@${username}`];
  if (!data || !data.userInfo) {
    return json({ error: 'no userInfo in state', keys: Object.keys(state?.source?.data || {}) }, 404, cors);
  }

  const u = data.userInfo;
  const videos = (data.videoList || []).map(function (v) {
    return {
      id: v.id,
      desc: v.desc,
      cover: v.coverUrl,
      dynamicCover: v.dynamicCoverUrl,
      play: v.playCount,
      url: `https://www.tiktok.com/@${u.uniqueId}/video/${v.id}`,
    };
  });

  const payload = {
    user: {
      id: u.id,
      uniqueId: u.uniqueId,
      nickname: u.nickname,
      avatar: u.avatarThumbUrl,
      signature: u.signature,
      verified: u.verified,
      privateAccount: u.privateAccount,
    },
    stats: {
      followers: u.followerCount,
      following: u.followingCount,
      likes: u.heartCount,
    },
    videos: videos,
    profileUrl: `https://www.tiktok.com/@${u.uniqueId}`,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=86400`,
    },
  });
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
