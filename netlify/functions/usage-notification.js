/**
 * Usage Notification Endpoint
 *
 * Triggers email notifications when users hit 80% or 100% usage thresholds.
 * Email sending is optional - silently succeeds if email is not configured.
 *
 * POST /api/usage-notification
 * Body: { threshold: "80" | "100" }
 */

import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser, updateUser } from './lib/storage.js';
// import { sendEmail } from './lib/email.js'; // Uncomment when email is configured

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed(origin);
  }

  try {
    // Authenticate request
    const auth = await authenticateRequest(Object.fromEntries(req.headers));
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: getSecurityHeaders(origin)
      });
    }

    const userId = auth.user.id;
    const userEmail = auth.user.email;

    const body = await req.json();
    const { threshold } = body;

    if (!threshold || !['80', '100'].includes(threshold)) {
      return Errors.badRequest('Invalid threshold. Must be "80" or "100"', origin);
    }

    // Get user details
    const user = await getUser(userEmail);
    if (!user) {
      return Errors.notFound('User', origin);
    }

    // Check if we've already sent this notification this month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const notificationKey = `usage_notification_${threshold}_${currentMonth}`;

    if (user[notificationKey]) {
      // Already sent this month
      return successResponse({
        success: true,
        message: 'Notification already sent this month',
        alreadySent: true
      }, 200, origin);
    }

    // Mark notification as sent
    await updateUser(userEmail, {
      [notificationKey]: new Date().toISOString()
    });

    // Prepare email content
    const planName = user.plan || 'Free';
    const subject = threshold === '100'
      ? `[Zero Trust Analytics] Your ${planName} plan limit has been reached`
      : `[Zero Trust Analytics] You've used ${threshold}% of your monthly pageviews`;

    const emailBody = threshold === '100'
      ? `Hi,

Your ${planName} plan pageview limit has been reached for this month.

Your analytics data is still being collected, but it will remain hidden until you upgrade your plan. When you upgrade, you'll have full access to all your historical data.

Upgrade now to continue with full access:
https://app.ztas.io/dashboard/billing

Best,
Zero Trust Analytics Team`
      : `Hi,

You've used ${threshold}% of your monthly pageviews on your ${planName} plan.

Consider upgrading your plan to avoid any interruption to your analytics access.

View your usage: https://app.ztas.io/dashboard/billing

Best,
Zero Trust Analytics Team`;

    // TODO: Send email when email service is configured
    // try {
    //   await sendEmail({
    //     to: userEmail,
    //     subject,
    //     text: emailBody,
    //     html: emailBody.replace(/\n/g, '<br>')
    //   });
    // } catch (emailErr) {
    //   console.error('Failed to send usage notification email:', emailErr);
    //   // Don't fail the request - email is optional
    // }

    console.log(`Usage notification triggered: ${threshold}% for user ${userId} (email not configured)`);

    return successResponse({
      success: true,
      message: `Usage notification recorded for ${threshold}% threshold`,
      emailPending: true, // Email will be sent when configured
      threshold,
      month: currentMonth
    }, 200, origin);

  } catch (err) {
    console.error('Usage notification error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to process notification',
      details: err.message
    }), {
      status: 500,
      headers: getSecurityHeaders(origin)
    });
  }
}

export const config = {
  path: '/api/usage-notification'
};
