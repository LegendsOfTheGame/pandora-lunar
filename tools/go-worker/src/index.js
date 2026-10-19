// ledger-go: the Adventurer's Ledger's click counter for outbound wiki links.
//
// GET /wiki/<page title>  ->  302 to that page on ffxiv.consolegameswiki.com, and one
//                             is added to the count for (today, title).
// GET /stats              ->  the last 30 days of counts as JSON, only with the
//                             STATS_KEY secret in an "Authorization: Bearer" header.
//
// What is stored: the UTC day, the page title and a number. No IP address, cookie,
// referrer or user agent is read or kept. The Ledger's links also send no referrer.
//
// The redirect never waits on the database. If the count fails, the visitor still
// reaches the wiki: a counter must not break a link.

const WIKI = 'https://ffxiv.consolegameswiki.com/mediawiki/index.php?title=';
// Long enough for any real page title; stops junk paths from filling the table.
const MAX_TITLE = 160;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });

    if (url.pathname.startsWith('/wiki/')) return wiki(url, env, ctx);
    if (url.pathname === '/stats') return stats(request, env);
    return new Response('Not found', { status: 404 });
  }
};

function wiki(url, env, ctx) {
  let title;
  try { title = decodeURIComponent(url.pathname.slice('/wiki/'.length)); }
  catch { return new Response('Bad page title', { status: 400 }); }
  title = title.replace(/ /g, '_');
  if (!title || title.length > MAX_TITLE || /[\u0000-\u001f<>[\]{}|#]/.test(title))
    return new Response('Bad page title', { status: 400 });

  if (env.DB) {
    const day = new Date().toISOString().slice(0, 10);
    ctx.waitUntil(env.DB
      .prepare('INSERT INTO clicks (day, target, n) VALUES (?1, ?2, 1) ON CONFLICT (day, target) DO UPDATE SET n = n + 1')
      .bind(day, title)
      .run()
      .catch(() => {}));
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: WIKI + encodeURIComponent(title),
      // Every click reaches the Worker, so every click is counted.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

async function stats(request, env) {
  // Without the secret set, the endpoint does not exist.
  if (!env.STATS_KEY || request.headers.get('Authorization') !== 'Bearer ' + env.STATS_KEY)
    return new Response('Not found', { status: 404 });
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB
    .prepare('SELECT target, SUM(n) AS clicks FROM clicks WHERE day >= ?1 GROUP BY target ORDER BY clicks DESC')
    .bind(since)
    .all();
  return Response.json({ since, pages: results }, { headers: { 'Cache-Control': 'no-store' } });
}
