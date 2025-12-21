export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  rootDir: '..',
  testMatch: ['<rootDir>/tests/__tests__/**/*.test.js'],
  moduleDirectories: ['node_modules', '<rootDir>/netlify/functions/node_modules'],
  collectCoverageFrom: [
    '<rootDir>/netlify/functions/**/*.js',
    '!<rootDir>/netlify/functions/node_modules/**'
  ],
  coverageDirectory: '<rootDir>/tests/coverage',
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js']
};
