const path2 = require('path');
const createSnapshotResolver = require('./_createRootedSnapshotResolver');
module.exports = createSnapshotResolver.createSnapshotResolver(
  path2.resolve('./build/test'),
  path2.resolve('./')
);

// jest config
//     snapshotResolver: '<rootDir>/_setup/_rootedSnapshotResolver.js'
