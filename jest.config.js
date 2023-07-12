/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  snapshotFormat: {
    escapeString: false,
    printBasicPrototype: false,
  },
  // silent: true,
  setupFilesAfterEnv: ['<rootDir>/test-jest/_setup.ts'],
  globalSetup: '<rootDir>/test-jest/_globalSetup.ts',
};
