// Cloudflare Worker entry point. Almost everything is served as a static
// asset (see wrangler.jsonc's "assets" config) — this script only exists to
// intercept one API route (sending the applicant a copy of their answers)
// before falling through to the static site for every other request.
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === APPLY_EMAIL_ROUTE && request.method === 'POST') {
      return handleSendConfirmation(request, env);
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
