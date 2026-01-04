// Jest setup file - sets up environment variables for testing

// Required for hash module tests
process.env.HASH_SECRET = 'test-hash-secret-for-jest-testing';

// Required for JWT tests
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing';
