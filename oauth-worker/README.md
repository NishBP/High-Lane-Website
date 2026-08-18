# OAuth provider for the CMS

Decap CMS runs in the browser and commits straight to GitHub. GitHub's OAuth
handshake needs a client **secret**, and a secret can't live in a page anyone
can view-source. This Worker is the only server-side piece of the whole site:
it swaps GitHub's short-lived `?code` for an access token and passes that token
back to `/admin`.

It stores nothing and costs nothing — a sign-in is two requests, against a free
tier of 100,000 a day.

Everything below needs your GitHub and Cloudflare accounts, so it's yours to
run. Do it in this order — step 2 needs the URL that step 1 prints.

## 1. Deploy the Worker

```bash
cd oauth-worker
npx wrangler login
npx wrangler deploy
```

It will fail to log anyone in until step 3, which is fine. Note the URL it
prints — something like `https://high-lane-oauth.<your-subdomain>.workers.dev`.
(On a brand-new account Cloudflare asks you to pick that subdomain first.)

Check it's alive by opening that URL in a browser: it should answer with a
short plain-text description, not an error.

## 2. Create the GitHub OAuth App

<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**

| Field | Value |
| --- | --- |
| Application name | `High Lane CMS` |
| Homepage URL | `https://highlanemedia.com` |
| Authorization callback URL | `https://high-lane-oauth.<your-subdomain>.workers.dev/callback` |

The callback URL must match **exactly**, including `/callback` and no trailing
slash — GitHub rejects the login otherwise.

Register it, then on the app's page:

- copy the **Client ID** (shown on the page)
- click **Generate a new client secret** and copy it **immediately** — GitHub
  shows the secret once and never again

This is an OAuth App, not a GitHub App. Don't create the other kind; the flow
here is the OAuth App one.

## 3. Give the Worker its credentials

```bash
cd oauth-worker
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Each prompts for the value and stores it encrypted. They are never written to
this repo.

Same thing through the dashboard, if you prefer: **Workers & Pages** →
`high-lane-oauth` → **Settings** → **Variables and Secrets** → add both as
type **Secret**.

## 4. Point the CMS at the Worker

In [`admin/config.yml`](../admin/config.yml), replace the placeholder:

```yaml
base_url: https://high-lane-oauth.<your-subdomain>.workers.dev
```

No trailing slash. Commit and let Cloudflare Pages rebuild, then open
`https://highlanemedia.com/admin` and click **Login with GitHub**.

## DNS

**None needed.** The `workers.dev` URL works as-is.

If you'd rather it lived on your own domain — `auth.highlanemedia.com`, say —
add it in the dashboard under the Worker → **Settings** → **Domains & Routes** →
**Add** → **Custom Domain**. Cloudflare creates the DNS record itself. You then
have to update *two* things to match: the OAuth App's callback URL on GitHub,
and `base_url` in `admin/config.yml`.

## Who can actually edit

Anyone can open `/admin` — it's a static page. But saving requires a GitHub
account with **write access to `NishBP/High-Lane-Website`**, because every save
is a commit made as that user. To give someone editing rights, add them as a
collaborator on the repo. To remove it, remove them. There is no separate CMS
user list.

The repo is public, so its contents are already visible to everyone; `/admin`
doesn't leak anything new.

## Settings reference

| Name | Where | Value |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | Worker secret | from the GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | Worker secret | from the GitHub OAuth App |
| `ALLOWED_ORIGINS` | Worker var, in `wrangler.toml` | origins allowed to receive the token |

`ALLOWED_ORIGINS` is the guard that stops another site from opening this Worker
and collecting a token. It ships as the two `highlanemedia.com` origins. Add
your `*.pages.dev` preview host to that list if you want to log into the CMS
from a preview deploy as well.

## If login fails

| What you see | Cause |
| --- | --- |
| `redirect_uri MISMATCH` on GitHub | the callback URL in the OAuth App isn't exactly `<worker>/callback` |
| Popup opens, closes, nothing happens | the site's origin isn't in `ALLOWED_ORIGINS` |
| `State mismatch — start again from /admin` | the popup was opened directly, or sat unused for 10+ minutes |
| `The Worker is missing its GitHub credentials` | step 3 didn't take — re-run `wrangler secret put` |
| Login works, saving 404s | the GitHub account has no write access to the repo |
