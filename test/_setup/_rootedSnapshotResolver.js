const path2 = require('path');
const createSnapshotResolver = require('./_createRootedSnapshotResolver');
console.log('dir: ' + __dirname);
module.exports = createSnapshotResolver.createSnapshotResolver(
  path2.resolve('./build/test'),
  path2.resolve('./')
);

// jest config
//     snapshotResolver: '<rootDir>/test/_setup/_myResolver.js'
