/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-undef */
const chai = require('chai');

const {jestSnapshotPlugin} = require('mocha-chai-jest-snapshot');
chai.use(
  jestSnapshotPlugin({
    moduleFileExtensions: ['js'],
    snapshotResolver: '<rootDir>/test/_myResolver.js',
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },
  })
);
