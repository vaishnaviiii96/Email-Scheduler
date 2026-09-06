import nodemailer, { Transporter, SentMessageInfo } from 'nodemailer';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Ethereal SMTP Transport
//
// Ethereal is a fake SMTP service for testing — emails are captured and
// viewable at https://ethereal.email. No real emails are delivered.
//
// Auto-provisioning:
// - If ETHEREAL_USER / ETHEREAL_PASS are set in .env, use those credentials.
// - Otherwise, call nodemailer.createTestAccount() on first use to get a
//   fresh test account. Credentials are cached in module scope.
//
// Preview URL:
// - Every sent email produces a preview URL logged to console.
// ─────────────────────────────────────────────────────────────────────────────

interface EtherealCredentials {
  user: string;
  pass: string;
}

let cachedTransporter: Transporter | null = null;
let cachedCredentials: EtherealCredentials | null = null;

async function getTransporter(): Promise<Transporter> {
  if (cachedTransporter) return cachedTransporter;

  let credentials: EtherealCredentials;

  if (config.ETHEREAL_USER && config.ETHEREAL_PASS) {
    // Use credentials from .env
    credentials = { user: config.ETHEREAL_USER, pass: config.ETHEREAL_PASS };
    console.log(`[mailer] Using Ethereal credentials from env: ${credentials.user}`);
  } else {
    // Auto-create a test account
    const testAccount = await nodemailer.createTestAccount();
    credentials = { user: testAccount.user, pass: testAccount.pass };
    console.log('[mailer] Auto-created Ethereal test account:');
    console.log(`[mailer]   User: ${credentials.user}`);
    console.log(`[mailer]   Pass: ${credentials.pass}`);
    console.log('[mailer]   Preview emails at: https://ethereal.email');
  }

  cachedCredentials = credentials;

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: credentials.user,
      pass: credentials.pass,
    },
  });

  // Verify SMTP connection
  try {
    await cachedTransporter.verify();
    console.log('[mailer] SMTP connection verified ✓');
  } catch (err) {
    console.warn('[mailer] SMTP verify failed (non-fatal):', (err as Error).message);
  }

  return cachedTransporter;
}

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail — Send a single email via Ethereal SMTP
// Returns messageId and previewUrl for logging
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
  const transporter = await getTransporter();

  let finalHtml = options.html;
  
  // Inject inline CSS for blockquotes so they appear as yellow highlighted boxes in the email client
  finalHtml = finalHtml.replace(
    /<blockquote/g, 
    '<blockquote style="background-color: #FFF9E6; border-left: 4px solid #FFCC00; padding: 12px 16px; margin: 16px 0; color: #1A1A1A;"'
  );

  const processedAttachments = options.attachments?.map((a, i) => {
    const isImage = a.contentType.startsWith('image/');
    const cid = isImage ? `image-${i}@emailscheduler` : undefined;
    
    // If it's an image, append it to the end of the HTML body so it renders inline!
    if (isImage) {
      finalHtml += `<br/><br/><img src="cid:${cid}" style="max-width: 100%; border-radius: 8px;" alt="${a.filename}" />`;
    }

    return {
      ...a,
      encoding: 'base64',
      cid,
    };
  });

  const info: SentMessageInfo = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: finalHtml,
    text: options.html.replace(/<[^>]+>/g, ''), // plain-text fallback (without inline image tags)
    attachments: processedAttachments,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

export function getCachedCredentials(): EtherealCredentials | null {
  return cachedCredentials;
}
