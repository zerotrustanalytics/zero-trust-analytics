import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';

// Initialize email providers
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@zta.io';
const FROM_NAME = 'Zero Trust Analytics';

// Password reset email template
function getPasswordResetEmailHtml(resetUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">Zero Trust Analytics</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">Reset your password</h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                We received a request to reset your password. Click the button below to choose a new password.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 0 0 24px;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #2563eb; text-decoration: none; border-radius: 6px;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #71717a;">
                This link will expire in <strong>1 hour</strong>.
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 22px; color: #71717a;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; border-top: 1px solid #e4e4e7; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                Zero Trust Analytics &bull; Privacy-first web analytics
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getPasswordResetEmailText(resetUrl) {
  return `
Reset your password

We received a request to reset your password for Zero Trust Analytics.

Click the link below to choose a new password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
Zero Trust Analytics - Privacy-first web analytics
  `.trim();
}

// Send email via Resend
async function sendViaResend(to, subject, html, text) {
  if (!resend) {
    throw new Error('Resend not configured');
  }

  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject,
    html,
    text
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return { provider: 'resend', id: data.id };
}

// Send email via SendGrid
async function sendViaSendGrid(to, subject, html, text) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid not configured');
  }

  const msg = {
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    text,
    html
  };

  const response = await sgMail.send(msg);
  return { provider: 'sendgrid', statusCode: response[0].statusCode };
}

// Send password reset email with fallback
export async function sendPasswordResetEmail(email, resetUrl) {
  const subject = 'Reset your password - Zero Trust Analytics';
  const html = getPasswordResetEmailHtml(resetUrl);
  const text = getPasswordResetEmailText(resetUrl);

  // Try Resend first
  if (resend) {
    try {
      const result = await sendViaResend(email, subject, html, text);
      return result;
    } catch (error) {
      // Resend failed, will try SendGrid
    }
  }

  // Fallback to SendGrid
  if (process.env.SENDGRID_API_KEY) {
    try {
      const result = await sendViaSendGrid(email, subject, html, text);
      return result;
    } catch (error) {
      throw new Error('All email providers failed');
    }
  }

  throw new Error('No email provider configured');
}
