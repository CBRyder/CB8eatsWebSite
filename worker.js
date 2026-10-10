// Cloudflare Worker entry point. Almost everything is served as a static
// asset (see wrangler.jsonc's "assets" config) — this script only exists to
// intercept one API route (sending the applicant a copy of their answers), show
// the Dev hub at the root of the dev hostnames, and keep the dev pages off every
// other hostname, before falling through to the static site for everything else.
//
// Required secret (set via `wrangler secret put RESEND_API_KEY`, or the
// Cloudflare dashboard — Workers & Pages -> this worker -> Settings ->
// Variables and Secrets -- never committed to the repo):
//   RESEND_API_KEY   — a Resend API key with send permission
//
// Optional var (plain, not secret — safe to set in wrangler.jsonc's `vars`
// if you want it version-controlled, or as a dashboard variable):
//   APPLY_FROM_EMAIL — the verified "from" address applications are sent
//                      from. Falls back to a placeholder that will fail
//                      until you set a real verified address.

const APPLY_EMAIL_ROUTE = '/api/send-application-confirmation';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The Dev hub has its own hostname, with or without the www. Visiting
// dev.cb8eats.com (the bare address, nothing after the slash) shows the same
// page that lives at /dev: three cards for the Tarboro Life tracker, the COA
// tracker and Warframe. Every other path on that hostname (css, js, the tracker
// pages, warframe-data.json) falls through to the normal static assets, so the
// pages' relative links keep working. The hostnames themselves are attached to
// this Worker in the Cloudflare dashboard (Domains & Routes), not here.
const DEV_HOSTS = new Set(['dev.cb8eats.com', 'www.dev.cb8eats.com']);
const DEV_ORIGIN = 'https://www.dev.cb8eats.com';
const DEV_PAGE = '/dev'; // extensionless on purpose: /dev.html would 307-redirect to /dev

// The dev pages exist ONLY on the dev hostnames, because that is the hostname
// Cloudflare Access puts its login wall in front of. On any other hostname
// (the public site, the workers.dev address) the dev pages redirect to the dev
// hostname, and the dev data files are simply not served. Keys are lowercase
// paths with no trailing slash; every path here must also be listed in
// wrangler.jsonc's assets.run_worker_first, or this check never runs for it.
const DEV_PAGES = new Map([
  ['/dev', '/'], ['/dev.html', '/'],
  ['/tracker', '/tracker'], ['/tracker.html', '/tracker'],
  ['/coa-tracker', '/coa-tracker'], ['/coa-tracker.html', '/coa-tracker'],
  ['/warframe', '/warframe'], ['/warframe.html', '/warframe'],
]);
const DEV_DATA = new Set(['/resource-inventory.json', '/coa-inventory.json', '/warframe-data.json', '/warframe-mod-stats.json', '/warframe-community-builds.json']);

// Decode %xx, collapse repeated slashes, drop a trailing slash and lowercase,
// so /%64ev, //dev and /Dev/ cannot slip past the exact-match lists above.
function normalizePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  return (decoded.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/').toLowerCase();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === APPLY_EMAIL_ROUTE && request.method === 'POST') {
      return handleSendConfirmation(request, env);
    }

    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const onDevHost = DEV_HOSTS.has(url.hostname);

    if (onDevHost && url.pathname === '/' && isRead) {
      const pageUrl = new URL(DEV_PAGE, url);
      pageUrl.search = url.search;
      return env.ASSETS.fetch(new Request(pageUrl, request));
    }

    if (!onDevHost) {
      const path = normalizePath(url.pathname);
      if (path !== null && DEV_PAGES.has(path)) {
        // 302 (not 301) so browsers never cache it: where the dev pages live may change.
        return Response.redirect(DEV_ORIGIN + DEV_PAGES.get(path) + url.search, 302);
      }
      if (path !== null && DEV_DATA.has(path)) {
        return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleSendConfirmation(request, env) {
  const jsonResponse = (data, status) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured');
    return jsonResponse({ error: 'Email sending is not configured' }, 500);
  }

  // Dashboard-set vars on a Git-integration-managed Worker only take effect
  // on the *next* deploy, not retroactively on whatever's already running —
  // if this fires, the currently live deployment predates APPLY_FROM_EMAIL
  // being set, and it's silently falling back to Resend's sandbox address.
  if (!env.APPLY_FROM_EMAIL) {
    console.warn('APPLY_FROM_EMAIL is not set — falling back to onboarding@resend.dev');
  }

  const discordUsername = String(body?.discordUsername || '').slice(0, 200);
  const positions = Array.isArray(body?.positions) ? body.positions.map(String).slice(0, 10) : [];
  const experience = String(body?.experience || '').slice(0, 5000);
  const whyJoin = String(body?.whyJoin || '').slice(0, 5000);
  const availability = String(body?.availability || '').slice(0, 500);

  const textBody = [
    "Thanks for applying to the Tarboro Life staff team! Here's a copy of what you submitted:",
    '',
    `Discord username: ${discordUsername}`,
    `Applying for: ${positions.join(', ')}`,
    `Experience: ${experience}`,
    `Why join: ${whyJoin}`,
    `Availability: ${availability}`,
    '',
    "We'll reach out to you on Discord.",
  ].join('\n');

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.APPLY_FROM_EMAIL || 'onboarding@resend.dev',
        to: [email],
        subject: 'Your Tarboro Life staff application',
        text: textBody,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error:', resendRes.status, errText);
      return jsonResponse({ error: 'Email send failed' }, 502);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error('Failed to call Resend:', err);
    return jsonResponse({ error: 'Email send failed' }, 502);
  }
}
