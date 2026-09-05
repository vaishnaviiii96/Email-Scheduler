import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { signUserToken, requireAuth, JwtPayload } from '../middleware/auth';

export const authRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Configure Passport Google OAuth2 strategy
// ─────────────────────────────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: `${config.BACKEND_URL}/auth/google/callback`,
      scope: ['profile', 'email'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from Google profile'));

        // Upsert user — creates on first login, updates on subsequent logins
        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            email,
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
            // Create a default Ethereal sender for new users
            senders: {
              create: {
                email,
                smtpConfig: {
                  host: 'smtp.ethereal.email',
                  port: 587,
                  secure: false,
                  user: '',  // filled by mailer on first use
                  pass: '',
                },
              },
            },
          },
        });

        return done(null, user as any);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

// Passport serialize/deserialize (minimal — we use JWT, not sessions)
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user as any);
  } catch (err) {
    done(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/google — Initiate Google OAuth
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/google/callback — Google OAuth callback
// On success: sign JWT, redirect to frontend with token in query param
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${config.FRONTEND_URL}/?error=auth_failed`, session: false }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    if (!user) {
      res.redirect(`${config.FRONTEND_URL}/?error=no_user`);
      return;
    }

    const token = signUserToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });

    // Redirect to frontend auth callback page with JWT
    // Frontend NextAuth will store this token in its session
    res.redirect(`${config.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/logout — Invalidate frontend redirect (JWT is stateless)
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get('/logout', (_req: Request, res: Response) => {
  // JWT is stateless — client must discard the token.
  // We redirect to frontend which clears its NextAuth session.
  res.redirect(`${config.FRONTEND_URL}/?logged_out=true`);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/slack — Initiate Slack OAuth
// Requires user to already be authenticated (pass userId via state param)
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get('/slack', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    res.status(400).json({ error: 'userId required as query param' });
    return;
  }

  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.set('client_id', config.SLACK_CLIENT_ID);
  slackAuthUrl.searchParams.set('scope', 'incoming-webhook,chat:write');
  slackAuthUrl.searchParams.set(
    'redirect_uri',
    `${config.BACKEND_URL}/auth/slack/callback`
  );
  slackAuthUrl.searchParams.set('state', userId); // pass userId through OAuth flow

  res.redirect(slackAuthUrl.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/slack/callback — Slack OAuth callback
// Exchanges code for token, stores on user row
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, state: userId, error } = req.query as Record<string, string>;

  if (error || !code || !userId) {
    console.error('[slack] OAuth error:', error);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack_error=true`);
    return;
  }

  try {
    // Exchange code for token via Slack API
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.SLACK_CLIENT_ID,
        client_secret: config.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${config.BACKEND_URL}/auth/slack/callback`,
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenData.ok) {
      console.error('[slack] Token exchange failed:', tokenData.error);
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack_error=true`);
      return;
    }

    // Store Slack credentials on the user row
    await prisma.user.update({
      where: { id: userId },
      data: {
        slackAccessToken: tokenData.access_token || tokenData.authed_user?.access_token,
        slackWebhookUrl: tokenData.incoming_webhook?.url,
        slackTeamId: tokenData.team?.id,
      },
    });

    console.log(`[slack] Connected Slack for user ${userId}`);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack_connected=true`);
  } catch (err) {
    console.error('[slack] Callback error:', err);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack_error=true`);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// GET /auth/slack/status — Returns whether current user has Slack connected
// ────────────────────────────────────────────────────────────────────────────────
authRouter.get('/slack/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  res.json({
    connected: !!(user?.slackWebhookUrl || user?.slackAccessToken),
    teamId: user?.slackTeamId || null,
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// DELETE /auth/slack/disconnect — Clears Slack credentials for current user
// ────────────────────────────────────────────────────────────────────────────────
authRouter.delete('/slack/disconnect', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  await prisma.user.update({
    where: { id: userId },
    data: { slackAccessToken: null, slackWebhookUrl: null, slackTeamId: null },
  });
  console.log(`[slack] Disconnected Slack for user ${userId}`);
  res.json({ disconnected: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me — Returns current user info from JWT
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(authHeader.slice(7), config.NEXTAUTH_SECRET);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
