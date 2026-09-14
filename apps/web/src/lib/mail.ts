import { Resend } from "resend";

const DEFAULT_FROM = "Opportunity Engine <noreply@billity.ai>";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
}

export function mailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
}

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(args: { preheader: string; heading: string; bodyHtml: string; actionLabel?: string; actionUrl?: string }) {
  const button = args.actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
        <tr>
          <td align="center" bgcolor="#0050BC" style="border-radius:6px; background-color:#0050BC;">
            <a href="${escapeHtml(args.actionUrl)}" style="display:inline-block; padding:12px 22px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#ffffff; text-decoration:none; font-weight:bold;">${escapeHtml(args.actionLabel || "Continue")}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(args.heading)}</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F5F6;">
  <div style="display:none; max-height:0; overflow:hidden;">${escapeHtml(args.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F4F5F6;">
    <tr>
      <td align="center" style="padding-top:32px; padding-bottom:32px; padding-left:16px; padding-right:16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden;">
          <tr>
            <td bgcolor="#002857" style="background-color:#002857; padding-top:22px; padding-bottom:22px; padding-left:28px; padding-right:28px;">
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:22px; color:#ffffff; font-weight:bold;">Opportunity Engine</p>
              <p style="margin:4px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:16px; color:#96E0FF; letter-spacing:0.16em; text-transform:uppercase; font-weight:bold;">Command Center</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px; padding-bottom:32px; padding-left:28px; padding-right:28px;">
              <h1 style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:28px; color:#121212;">${escapeHtml(args.heading)}</h1>
              ${args.bodyHtml}
              ${button}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:16px; color:#6B6E71;">Databillity · Authorized operators only</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function send(args: { to: string; subject: string; text: string; html: string; tag: string }) {
  const resend = client();
  if (!resend) throw new Error("RESEND_API_KEY is not set");
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: [args.to],
    subject: args.subject,
    text: args.text,
    html: args.html,
    tags: [{ name: "category", value: args.tag }],
  });
  if (error) throw new Error(error.message);
}

export async function sendPasswordResetEmail(args: { to: string; token: string }) {
  const resetUrl = `${appUrl()}/login/reset?token=${encodeURIComponent(args.token)}`;
  const subject = "Set your Opportunity Engine password";
  const text = [
    "Set a password for the Opportunity Engine command center.",
    "",
    `Open this link to continue: ${resetUrl}`,
    "",
    "This link expires in 60 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");
  const html = layout({
    preheader: "Use this link to set your Opportunity Engine password.",
    heading: "Set your password",
    actionLabel: "Set password",
    actionUrl: resetUrl,
    bodyHtml: `<p style="margin:16px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#3D3F41;">Use the button below to choose a password for <strong>${escapeHtml(args.to)}</strong>. The link expires in 60 minutes.</p>
      <p style="margin:16px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6B6E71;">If you did not request this, you can ignore this email. Your current sign-in will stay the same.</p>
      <p style="margin:20px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6B6E71;">If the button does not work, copy and paste this URL:<br>${escapeHtml(resetUrl)}</p>`,
  });
  await send({ to: args.to, subject, text, html, tag: "password-reset" });
}

export async function sendPasswordUpdatedEmail(args: { to: string }) {
  const signInUrl = `${appUrl()}/login`;
  const subject = "Your Opportunity Engine password was updated";
  const text = [
    "Your Opportunity Engine password was updated.",
    "",
    `Sign in here: ${signInUrl}`,
    "",
    "If you did not make this change, contact a Databillity administrator immediately.",
  ].join("\n");
  const html = layout({
    preheader: "Your Opportunity Engine password was updated.",
    heading: "Password updated",
    actionLabel: "Sign in",
    actionUrl: signInUrl,
    bodyHtml: `<p style="margin:16px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#3D3F41;">The password for <strong>${escapeHtml(args.to)}</strong> on the Opportunity Engine command center was just set. You can sign in with that password from now on.</p>
      <p style="margin:16px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6B6E71;">If you did not make this change, contact a Databillity administrator immediately.</p>`,
  });
  await send({ to: args.to, subject, text, html, tag: "password-updated" });
}
