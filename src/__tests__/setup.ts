/**
 * Jest test setup file
 * This file is automatically executed before each test file
 */

// Set up test environment variables
process.env.NODE_ENV = 'test';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests (optional)
// Uncomment if you want to suppress console output during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global teardown
afterAll(async () => {
  // Add any global cleanup here
});
