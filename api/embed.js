// api/embed.js
export const config = { runtime: 'edge' };

const TIKTOK_EMBED = 'https://www.tiktok.com/embed/';
const CACHE_TTL = 3600; // 1 hour in seconds

export default async function handler(req) {
  const url = new URL(req.url);
  const username = url.searchParams.get('user') || 'tiktok';

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const tiktokRes = await fetch(`${TIKTOK_EMBED}@${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!tiktokRes.ok) {
      return json({ error: 'TikTok request failed', status: tiktokRes.status }, 502, cors);
    }

    const html = await tiktokRes.text();

    // Extract embedded JSON data from the page
    const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/);
    
    let data = null;
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const userDetail = parsed?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
        if (userDetail) {
          data = {
            user: {
              id: userDetail.user?.id,
              uniqueId: userDetail.user?.uniqueId,
              nickname: userDetail.user?.nickname,
              avatarLarger: userDetail.user?.avatarLarger,
              signature: userDetail.user?.signature,
              verified: userDetail.user?.verified,
              secUid: userDetail.user?.secUid,
            },
            stats: {
              followerCount: userDetail.stats?.followerCount,
              followingCount: userDetail.stats?.followingCount,
              heartCount: userDetail.stats?.heartCount,
              videoCount: userDetail.stats?.videoCount,
            },
          };
        }
      } catch (e) {
        // JSON parse failed, fall through to fallback
      }
    }

    if (!data) {
      // Fallback: simple DOM-based extraction
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const avatarMatch = html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i);
      
      data = {
        user: {
          uniqueId: username,
          nickname: titleMatch ? titleMatch[1].replace(' on TikTok', '').trim() : `@${username}`,
          avatarLarger: avatarMatch ? avatarMatch[1] : null,
        },
        stats: null,
        _fallback: true,
      };
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=86400`,
      },
    });

  } catch (err) {
    return json({ error: 'Internal error', detail: err.message }, 500, cors);
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
