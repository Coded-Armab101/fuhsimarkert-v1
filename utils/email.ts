import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Transactional email (order placed, order completed, refund, payout).
 *
 * Sends through Resend's REST API with plain `fetch`, so there is no extra
 * dependency. The feature is entirely optional:
 *
 *   RESEND_API_KEY   — when missing, every send is skipped silently
 *   EMAIL_FROM       — verified sender, e.g. "FuhsiMarket <orders@fuhsimarket.com>"
 *   NEXT_PUBLIC_SITE_URL — used to build links back into the app
 *
 * Email is a side effect: `sendEmail` never throws, so a provider outage can
 * never roll back an order or a payout.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'FuhsiMarket <onboarding@resend.dev>';

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Escape untrusted text before it is interpolated into HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://fuhsimarket.com').replace(/\/$/, '');
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/** Send one email. Returns false (never throws) when email is not configured. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !message.to) return false;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[email] Resend rejected a message', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    // Never let email delivery break a paid order or a payout.
    console.warn('[email] send failed', err);
    return false;
  }
}

/** Look up the addresses behind user ids via the service-role auth admin API. */
export async function getUserEmails(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error) return;
        const email = data?.user?.email;
        if (email) result.set(id, email);
      } catch {
        /* a missing/deleted user simply gets no email */
      }
    }),
  );

  return result;
}

/** Wrap content in a small, warm, brand-consistent shell. */
export function emailLayout(options: {
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const lines = options.lines
    .map((line) => `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#4a3f38">${line}</p>`)
    .join('');
  const cta = options.cta
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(options.cta.url)}" style="display:inline-block;background:#DE6437;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">${escapeHtml(options.cta.label)}</a></p>`
    : '';
  const footnote = options.footnote
    ? `<p style="margin:18px 0 0;font-size:11px;line-height:18px;color:#9d9188">${options.footnote}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf6f2;font-family:Manrope,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #eee4dc;border-radius:20px;padding:28px">
      <p style="margin:0 0 18px;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#DE6437">FuhsiMarket</p>
      <h1 style="margin:0 0 14px;font-size:20px;line-height:28px;color:#251d18">${escapeHtml(options.heading)}</h1>
      ${lines}
      ${cta}
      ${footnote}
    </div>
    <p style="max-width:520px;margin:14px auto 0;text-align:center;font-size:10px;color:#9d9188">
      You are receiving this because you have a FuhsiMarket account.
    </p>
  </body>
</html>`;
}

/**
 * Send one templated email to every address among `userIds`.
 * Best-effort: returns how many were accepted, never throws.
 */
export async function sendEmailToUsers(
  admin: SupabaseClient,
  userIds: string[],
  content: {
    subject: string;
    heading: string;
    lines: string[];
    cta?: { label: string; url: string };
    footnote?: string;
  },
): Promise<number> {
  if (!emailConfigured()) return 0;

  const emails = await getUserEmails(admin, userIds);
  if (emails.size === 0) return 0;

  const html = emailLayout(content);
  const text = [content.heading, ...content.lines, content.cta?.url]
    .filter(Boolean)
    .join('\n\n');

  const results = await Promise.all(
    Array.from(emails.values()).map((to) =>
      sendEmail({ to, subject: content.subject, html, text }),
    ),
  );
  return results.filter(Boolean).length;
}

/** Absolute link back into the app (for CTA buttons). */
export function appLink(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
