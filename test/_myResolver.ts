const path2 = require('path');
const createSnapshotResolver = require('./_createRootedSnapshotResolver');
console.log('dir: ' + __dirname);
module.exports = createSnapshotResolver.createSnapshotResolver(
  __dirname,
  path2.resolve('./')
);
