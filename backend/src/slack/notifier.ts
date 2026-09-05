import { WebClient } from '@slack/web-api';
import { User, Sender } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Slack Notifier — notifyRateLimit()
//
// Called from the worker processor when a sender's hourly rate limit is hit.
//
// Connection strategy (lazy, per-user):
// 1. If user.slackWebhookUrl is set → POST to incoming webhook (simplest)
// 2. Else if user.slackAccessToken is set → use Slack Web API chat.postMessage
// 3. Else → silently return (no-op)
//
// IMPORTANT: This function NEVER throws. All errors are caught and logged.
// Slack connectivity must not affect email scheduling reliability.
//
// Token storage design:
// - Tokens are stored in the DB per-user, not cached in memory.
// - This means if a user connects Slack AFTER a rate-limit event, the NEXT
//   rate-limit event will use their credentials automatically.
// - No "not-connected" state is cached anywhere that requires a redeploy.
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyRateLimit(
  user: User,
  sender: Sender,
  limit: number
): Promise<void> {
  const message = buildRateLimitMessage(sender.email, limit);

  try {
    if (user.slackWebhookUrl) {
      // Use incoming webhook — simplest, no OAuth token needed for the call
      await postToWebhook(user.slackWebhookUrl, message);
      console.log(`[slack] Rate-limit notification sent via webhook for user ${user.id}`);
      return;
    }

    if (user.slackAccessToken) {
      // Use Web API chat.postMessage
      // We need a channel — use the user's DM with themselves (preferred)
      // or fall back to a hardcoded channel. Here we use user.email as the channel
      // identifier (Slack accepts email for DM if enabled in workspace).
      const client = new WebClient(user.slackAccessToken);
      await client.chat.postMessage({
        channel: user.email, // Slack resolves email to DM if allowed
        text: message,
        unfurl_links: false,
      });
      console.log(`[slack] Rate-limit notification sent via Web API for user ${user.id}`);
      return;
    }

    // No Slack credentials stored — silently skip
    console.log(`[slack] User ${user.id} has no Slack credentials — skipping notification`);
  } catch (err) {
    // Never throw — Slack failure must not affect email scheduling
    console.warn(`[slack] notifyRateLimit failed for user ${user.id}:`, (err as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Post a message to a Slack incoming webhook URL
// ─────────────────────────────────────────────────────────────────────────────
async function postToWebhook(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      username: 'ON8 Email Scheduler',
      icon_emoji: ':email:',
    }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the rate-limit notification message
// ─────────────────────────────────────────────────────────────────────────────
function buildRateLimitMessage(senderEmail: string, limit: number): string {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);

  return (
    `⚠️ *ON8 Rate Limit Reached*\n` +
    `Sender \`${senderEmail}\` has hit the hourly limit of *${limit} emails/hour*.\n` +
    `Queued emails will resume at *${nextHour.toUTCString()}* (next UTC hour boundary).`
  );
}
