/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-undef */
const chai = require('chai');
// const chaiJestSnapshot = require('chai-jest-snapshot');

// chai.use(chaiJestSnapshot);

// console.log('Installing Chai-Jest-Snapshot');

// before(function () {
//   chaiJestSnapshot.resetSnapshotRegistry();
// });

// beforeEach(function () {
//   chaiJestSnapshot.configureUsingMochaContext(this);
// });
// e.g. setup.js (mocha --file setup.js)

const {jestSnapshotPlugin} = require('mocha-chai-jest-snapshot');
chai.use(
  jestSnapshotPlugin({
    moduleFileExtensions: ['js'],
    snapshotResolver: '<rootDir>/test/_myResolver.js',
  })
);
