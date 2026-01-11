import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';

// Initialize email providers
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@zta.io';
const FROM_NAME = 'Zero Trust Analytics';

// Default branding
const DEFAULT_BRANDING = {
  enabled: false,
  companyName: 'Zero Trust Analytics',
  logoUrl: null,
  primaryColor: '#3B82F6'
};

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

// Analytics Report Email Template (with branding support)
function getAnalyticsReportEmailHtml(data, branding = DEFAULT_BRANDING) {
  const b = branding.enabled ? branding : DEFAULT_BRANDING;
  const logoHtml = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="${b.companyName}" style="max-height: 40px; max-width: 200px;">`
    : `<span style="font-size: 20px; font-weight: 600;">${b.companyName}</span>`;

  const changeIcon = (value) => value >= 0 ? '↑' : '↓';
  const changeColor = (value) => value >= 0 ? '#10B981' : '#EF4444';

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
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <!-- Header with branding -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; background-color: ${b.primaryColor};">
              ${logoHtml.replace(/color: #[0-9a-fA-F]+/g, 'color: #ffffff')}
            </td>
          </tr>
          <!-- Report Title -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">${data.frequency} Analytics Report</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: #71717a;">${data.siteName} &bull; ${data.dateRange}</p>
            </td>
          </tr>
          <!-- Stats Grid -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; text-align: center; width: 33%;">
                    <p style="margin: 0; font-size: 28px; font-weight: 700; color: #18181b;">${data.visitors.toLocaleString()}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #71717a;">Visitors</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: ${changeColor(data.visitorsChange)};">
                      ${changeIcon(data.visitorsChange)} ${Math.abs(data.visitorsChange)}%
                    </p>
                  </td>
                  <td style="width: 12px;"></td>
                  <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; text-align: center; width: 33%;">
                    <p style="margin: 0; font-size: 28px; font-weight: 700; color: #18181b;">${data.pageviews.toLocaleString()}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #71717a;">Page Views</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: ${changeColor(data.pageviewsChange)};">
                      ${changeIcon(data.pageviewsChange)} ${Math.abs(data.pageviewsChange)}%
                    </p>
                  </td>
                  <td style="width: 12px;"></td>
                  <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; text-align: center; width: 33%;">
                    <p style="margin: 0; font-size: 28px; font-weight: 700; color: #18181b;">${data.bounceRate}%</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #71717a;">Bounce Rate</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: ${changeColor(-data.bounceRateChange)};">
                      ${changeIcon(-data.bounceRateChange)} ${Math.abs(data.bounceRateChange)}%
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Top Pages -->
          ${data.topPages && data.topPages.length > 0 ? `
          <tr>
            <td style="padding: 0 32px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #18181b;">Top Pages</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;">
                ${data.topPages.slice(0, 5).map((page, i) => `
                <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                  <td style="padding: 12px 16px; font-size: 14px; color: #18181b;">${page.path}</td>
                  <td style="padding: 12px 16px; font-size: 14px; color: #71717a; text-align: right;">${page.views.toLocaleString()} views</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ''}
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${data.dashboardUrl}" style="display: inline-block; padding: 12px 32px; font-size: 14px; font-weight: 600; color: #ffffff; background-color: ${b.primaryColor}; text-decoration: none; border-radius: 6px;">View Full Dashboard</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; border-top: 1px solid #e4e4e7; background-color: #fafafa;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                Powered by ${b.companyName}
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #a1a1aa;">
                <a href="${data.unsubscribeUrl}" style="color: #a1a1aa;">Unsubscribe</a> from these reports
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

function getAnalyticsReportEmailText(data, branding = DEFAULT_BRANDING) {
  const b = branding.enabled ? branding : DEFAULT_BRANDING;
  const changeIcon = (value) => value >= 0 ? '+' : '';

  return `
${data.frequency} Analytics Report - ${b.companyName}
${data.siteName} | ${data.dateRange}

SUMMARY
-------
Visitors: ${data.visitors.toLocaleString()} (${changeIcon(data.visitorsChange)}${data.visitorsChange}%)
Page Views: ${data.pageviews.toLocaleString()} (${changeIcon(data.pageviewsChange)}${data.pageviewsChange}%)
Bounce Rate: ${data.bounceRate}% (${changeIcon(-data.bounceRateChange)}${-data.bounceRateChange}%)

${data.topPages && data.topPages.length > 0 ? `TOP PAGES
---------
${data.topPages.slice(0, 5).map(p => `${p.path}: ${p.views.toLocaleString()} views`).join('\n')}
` : ''}
View full dashboard: ${data.dashboardUrl}

---
Powered by ${b.companyName}
Unsubscribe: ${data.unsubscribeUrl}
  `.trim();
}

// Send analytics report email with branding
export async function sendAnalyticsReportEmail(email, data, branding = DEFAULT_BRANDING) {
  const b = branding.enabled ? branding : DEFAULT_BRANDING;
  const subject = `${data.frequency} Analytics Report - ${data.siteName}`;
  const html = getAnalyticsReportEmailHtml(data, branding);
  const text = getAnalyticsReportEmailText(data, branding);

  // Use custom from name if branding enabled
  const fromName = b.enabled ? b.companyName : FROM_NAME;

  // Try Resend first
  if (resend) {
    try {
      const { data: result, error } = await resend.emails.send({
        from: `${fromName} <${FROM_EMAIL}>`,
        to: [email],
        subject,
        html,
        text
      });

      if (error) throw new Error(error.message);
      return { provider: 'resend', id: result.id };
    } catch (error) {
      // Resend failed, will try SendGrid
    }
  }

  // Fallback to SendGrid
  if (process.env.SENDGRID_API_KEY) {
    try {
      const msg = {
        to: email,
        from: { email: FROM_EMAIL, name: fromName },
        subject,
        text,
        html
      };
      const response = await sgMail.send(msg);
      return { provider: 'sendgrid', statusCode: response[0].statusCode };
    } catch (error) {
      throw new Error('All email providers failed');
    }
  }

  throw new Error('No email provider configured');
}
