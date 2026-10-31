// Jest setup file - sets up environment variables for testing

// Required for hash module tests
process.env.HASH_SECRET = 'test-hash-secret-for-jest-testing';

// Required for JWT tests
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing';

// Stripe: one price per paid plan (lib/config.js reads these when it loads).
process.env.STRIPE_PRICE_STARTER = 'price_test_starter';
process.env.STRIPE_PRICE_GROWTH = 'price_test_growth';
process.env.STRIPE_PRICE_BUSINESS = 'price_test_business';
process.env.STRIPE_PRICE_SCALE = 'price_test_scale';
