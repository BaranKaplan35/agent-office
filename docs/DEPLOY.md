# Deploying the demo (Render, mock mode)

The public demo runs in **mock mode**: every agent gives canned answers, no API key is
needed and nobody's quota is spent. Visitors can try the whole workflow — questions,
plans, reviews, revisions, the final merge and the 3D office.

The repo includes a [Render Blueprint](../render.yaml): one free web service that runs
`npm ci && npm run build`, then `npm start` (the production server serves the API and
the built client on Render's `PORT`), with `LLM_PROVIDER=mock`.

## Steps

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. **New → Blueprint**, connect the GitHub account and give Render access to the
   `agent-office` repository (also works for a private repository).
3. Pick the repository; Render reads `render.yaml` and shows one service,
   `agent-office-demo` (free plan). Click **Apply** / **Deploy Blueprint**.
4. Wait for the first build (a few minutes). The service URL looks like
   `https://agent-office-demo.onrender.com`; `/api/health` should answer
   `{"ok":true,"provider":"mock",…}`.
5. Every push to `main` redeploys automatically.

## Good to know

- **Don't add API keys to the demo.** With a real provider, every visitor would spend
  your quota. Mock mode ignores the per-agent models in the team files.
- **Free instances sleep** after about 15 minutes without traffic; the next visit wakes
  them up in about a minute.
- **Tasks are not kept** on the free plan (its disk is wiped on restart), so the
  Blueprint turns `PERSIST_TASKS` off. Each visitor's own task is remembered in their
  browser while the instance runs.
- **Don't set `NODE_ENV=production`** on the service: `npm ci` would then skip the dev
  dependencies the build needs. The server build runs in production mode anyway.
