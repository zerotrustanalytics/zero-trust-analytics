# Finish This Jason

## Stripe (Payments)

Get all of these from https://dashboard.stripe.com

### 1. Secret Key
- **Variable name:** `STRIPE_SECRET_KEY`
- **Where:** Developers → API keys → Secret key
- Starts with `sk_test_` (test) or `sk_live_` (production)

### 2. Webhook Secret
- **Variable name:** `STRIPE_WEBHOOK_SECRET`
- **Where:** Developers → Webhooks → Add endpoint
- Set endpoint URL to `https://yourdomain.com/api/stripe/webhook`
- Starts with `whsec_`

### 3. Price ID
- **Variable name:** `STRIPE_PRICE_ID`
- **Where:** Products → Create a product → Add a price ($10/month recurring)
- Starts with `price_`

---

## Email (Password Reset)

### 1. Resend (Primary)
- **Get it from:** https://resend.com
- **Variable name:** `RESEND_API_KEY`
- Free tier: 100 emails/day

### 2. SendGrid (Fallback)
- **Get it from:** https://sendgrid.com
- **Variable name:** `SENDGRID_API_KEY`
- Free tier: 100 emails/day

### 3. From Email (Optional)
- **Variable name:** `FROM_EMAIL`
- Set this to your verified sending domain (e.g., `noreply@zta.io`)
- Defaults to `noreply@zta.io` if not set

---

## Other Required Secrets

### 1. Hash Secret
- **Variable name:** `HASH_SECRET`
- Generate a random string (used for hashing visitor IDs)

### 2. JWT Secret
- **Variable name:** `JWT_SECRET`
- Generate a random string (used for auth tokens)

---

## How to Add in Netlify
1. Go to your Netlify dashboard
2. Site settings → Environment variables
3. Add each key above
