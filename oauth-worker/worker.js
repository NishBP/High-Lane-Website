/**
 * High Lane — GitHub OAuth provider for Decap CMS.
 *
 * Decap runs entirely in the browser and commits straight to GitHub, but a
 * browser can't hold the OAuth client secret. This Worker does the one thing
 * that has to happen server-side: swap the short-lived ?code GitHub hands back
 * for an access token, then pass that token to the CMS window.
 *
 * It is the "netlify-cms-github-oauth-provider" flow, ported to Workers:
 *
 *   1. /admin opens a popup at   <worker>/auth
 *   2. we redirect that popup to GitHub's consent screen
 *   3. GitHub sends the user back to  <worker>/callback?code=…&state=…
 *   4. we exchange the code for a token, and postMessage it to /admin
 *
 * No storage, no logging of tokens, nothing to pay for — this fits inside the
 * Workers free tier with room to spare.
 *
 * Configure (see README.md in this folder):
 *   GITHUB_CLIENT_ID       secret
 *   GITHUB_CLIENT_SECRET   secret
 *   ALLOWED_ORIGINS        var — comma-separated origins allowed to receive
 *                          the token. Leave unset only for local debugging.
 */

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const STATE_COOKIE = 'hl_oauth_state';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') return startAuth(url, env);
    if (url.pathname === '/callback') return finishAuth(url, request, env);

    return new Response(
      'High Lane CMS OAuth provider.\n\n' +
      'Point Decap at this origin with backend.base_url in admin/config.yml.\n' +
      'Endpoints: /auth, /callback\n',
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }
};

/* ── step 1: hand the user to GitHub ────────────────────────────────────── */

function startAuth(url, env) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('GITHUB_CLIENT_ID is not set on this Worker.', { status: 500 });
  }

  // CSRF: GitHub echoes this back, and we compare it against a cookie only
  // this browser has.
  const state = crypto.randomUUID();

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorize.searchParams.set('scope', url.searchParams.get('scope') || 'repo');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      'set-cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'cache-control': 'no-store'
    }
  });
}

/* ── step 2: trade the code for a token, and hand it back to /admin ─────── */

async function finishAuth(url, request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request.headers.get('cookie'), STATE_COOKIE);

  if (url.searchParams.get('error')) {
    return postBack('error', { message: url.searchParams.get('error_description') || url.searchParams.get('error') }, allowed);
  }
  if (!code) {
    return postBack('error', { message: 'GitHub did not return a code.' }, allowed);
  }
  if (!expected || state !== expected) {
    // Either the cookie expired, or this callback did not start at /auth.
    return postBack('error', { message: 'State mismatch — start again from /admin.' }, allowed);
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return postBack('error', { message: 'The Worker is missing its GitHub credentials.' }, allowed);
  }

  let token;
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'high-lane-cms-oauth'
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/callback`
      })
    });
    const data = await res.json();
    // GitHub answers 200 with an {error} body when the code is stale.
    if (data.error) return postBack('error', { message: data.error_description || data.error }, allowed);
    token = data.access_token;
    if (!token) return postBack('error', { message: 'GitHub returned no access token.' }, allowed);
  } catch (err) {
    return postBack('error', { message: `Token exchange failed: ${err.message}` }, allowed);
  }

  return postBack('success', { token, provider: 'github' }, allowed);
}

/* ── the handshake Decap expects ─────────────────────────────────────────
   The CMS window is listening. It cannot address this popup directly, so the
   popup announces itself first ("authorizing:github"), the CMS replies, and
   only then do we send the token — to that window's own origin, never "*". */

function postBack(status, payload, allowed) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signing in…</title></head>
<body style="font:15px system-ui;padding:2rem;color:#08191b">
<p>${status === 'success' ? 'Signed in. You can close this window.' : 'Sign-in failed. You can close this window.'}</p>
<script>
(function () {
  var allowed = ${JSON.stringify(allowed)};
  var message = ${JSON.stringify(message)};
  if (!window.opener) { document.body.innerHTML += '<p>Open this from /admin, not directly.</p>'; return; }
  function receive(e) {
    if (allowed.length && allowed.indexOf(e.origin) === -1) return;
    window.opener.postMessage(message, e.origin);
    window.removeEventListener('message', receive, false);
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // burn the state cookie either way
      'set-cookie': `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
    }
  });
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
