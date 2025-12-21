import { beforeAll, afterAll, afterEach } from 'vitest'

// Setup environment variables for API tests
beforeAll(() => {
  process.env.DATABASE_URL = 'libsql://test.turso.io'
  process.env.DATABASE_AUTH_TOKEN = 'test_token'
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing'
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.HASH_SECRET = 'test_hash_secret'
})

afterEach(() => {
  // Reset any mocks between tests
})

afterAll(() => {
  // Cleanup
})
