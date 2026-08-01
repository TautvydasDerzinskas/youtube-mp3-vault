// Qobuz HQ discovery's verification surface — see services/qobuz/session.ts
// for why this exists at all: the community backend's Turnstile challenge
// can only be completed by a real human in a real browser, so this backend
// hands the challenge to an opted-in user's client instead of automating it.
import { Router } from 'express';
import { prisma } from '../services/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { completeVerification, getPendingVerificationChallengeUrl } from '../services/qobuz/session';

const router = Router();

// GET /api/hq/qobuz/status — polled by the frontend/mobile while the current
// user has Qobuz HQ discovery enabled. Only ever surfaces a challenge to a
// user who opted in, even though the underlying session is shared/global.
router.get('/qobuz/status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { qobuzHqEnabled: true },
    });
    const challengeUrl = user?.qobuzHqEnabled ? getPendingVerificationChallengeUrl() : null;
    res.json({ needed: !!challengeUrl, challengeUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/hq/qobuz/callback — the real (public, unauthenticated) callback
// the community verify page's own JS navigates the user's browser to once
// the Turnstile challenge completes. No auth here by design: the browser
// hitting this is the user's own, not an API client, and the random `state`
// token (single-use, minted per challenge) is what ties this back to the
// right pending verification.
router.get('/qobuz/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const grant = typeof req.query.grant === 'string' ? req.query.grant : '';

  if (!state || !grant) {
    res.status(400).send(renderResultPage(false, 'This verification link is missing required data — please try again from the app.'));
    return;
  }

  try {
    await completeVerification(state, grant);
    res.send(renderResultPage(true, 'You can close this window now.'));
  } catch (err) {
    console.error('[qobuz] Verification callback failed:', err instanceof Error ? err.message : String(err));
    res.status(400).send(renderResultPage(false, 'Verification failed or this link expired — please try again from the app.'));
  }
});

function renderResultPage(success: boolean, message: string): string {
  const title = success ? 'Verified' : 'Verification failed';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center;
         height: 100vh; margin: 0; background: #121212; color: #eee; }
  div { text-align: center; padding: 24px; }
  h2 { color: ${success ? '#4caf50' : '#f44336'}; }
</style></head>
<body><div><h2>${success ? '✓ Verified' : '✗ Verification failed'}</h2><p>${message}</p></div>
<script>setTimeout(function () { try { window.close(); } catch (e) {} }, 2000);</script>
</body></html>`;
}

export default router;
