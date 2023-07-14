/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  snapshotFormat: {
    escapeString: false,
    printBasicPrototype: false,
  },
  // silent: true,
  setupFilesAfterEnv: ['jest-extended/all'],
};
