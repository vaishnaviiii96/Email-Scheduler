import { Resend } from 'resend';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Mailer — uses Resend HTTP API (no SMTP, works on all cloud providers)
//
// Resend sends emails via HTTPS, bypassing SMTP port blocks on Render/Railway etc.
// Free tier: 3,000 emails/month.
//
// Set RESEND_API_KEY in environment variables.
// ─────────────────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = (config as any).RESEND_API_KEY;

  // ── Inject blockquote inline styles ──────────────────────────────────────────
  let finalHtml = options.html.replace(
    /<blockquote/g,
    '<blockquote style="background-color:#FFF9E6;border-left:4px solid #FFCC00;padding:12px 16px;margin:16px 0;color:#1A1A1A;"'
  );

  // ── Inline images as <img src="cid:..."> attachments ─────────────────────────
  const resendAttachments: { filename: string; content: Buffer }[] = [];

  if (options.attachments) {
    options.attachments.forEach((a, i) => {
      const isImage = a.contentType.startsWith('image/');
      const buf = Buffer.from(a.content, 'base64');

      if (isImage) {
        const cid = `image-${i}@emailscheduler`;
        finalHtml += `<br/><br/><img src="cid:${cid}" style="max-width:100%;border-radius:8px;" alt="${a.filename}" />`;
      }

      resendAttachments.push({ filename: a.filename, content: buf });
    });
  }

  if (!apiKey || apiKey === '') {
    // ── Simulation mode (no API key configured) ─────────────────────────────
    console.log('[mailer] No RESEND_API_KEY set — simulating email send');
    console.log(`[mailer]   From: ${options.from}`);
    console.log(`[mailer]   To:   ${options.to}`);
    console.log(`[mailer]   Subject: ${options.subject}`);
    return {
      messageId: `sim-${Date.now()}@emailscheduler`,
      previewUrl: false,
    };
  }

  const resend = new Resend(apiKey);

  // Resend requires the "from" address to use a verified domain.
  // Use a fixed onboarding address for demo purposes, and set replyTo = sender.
  const fromAddress = `Email Scheduler <onboarding@resend.dev>`;

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: [options.to],
    reply_to: options.from,
    subject: options.subject,
    html: finalHtml,
    attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  console.log(`[mailer] Resend ✓ messageId=${data?.id}`);

  return {
    messageId: data?.id || 'unknown',
    previewUrl: false, // Resend doesn't provide a preview URL
  };
}

// Kept for backward compatibility (no-op now)
export function getCachedCredentials() {
  return null;
}
