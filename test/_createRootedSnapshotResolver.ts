// https://github.com/microsoft/react-native-windows/tree/main/packages/%40rnw-scripts/jest-out-of-snapshot-resolver
// https://brunoscheufler.com/blog/2020-03-08-configuring-jest-snapshot-resolvers

// This resolves tests in the merged build output to the snapshot in their
// source tree. This ensures we update the correct snapshot.
exports.createSnapshotResolver = (
  dirname: string,
  rootPath: string,
  includeSnapExtension = true
) => {
  const path = require('path');
  return {
    resolveSnapshotPath: (testPath: string, snapshotExtension: string) => {
      const testDir = path.dirname(testPath);

      let testSrcDir = testDir;

      if (testDir.startsWith(dirname)) {
        testSrcDir = testDir.replace(dirname, '');
      }
      const testFile = path.basename(testPath);

      return (
        path.join(rootPath, '__snapshots__', testSrcDir, testFile) +
        (includeSnapExtension ? snapshotExtension : '')
      );
    },

    resolveTestPath: (snapshotFilePath: string, snapshotExtension: string) => {
      let relative = snapshotFilePath
        .replace(rootPath + path.sep, '')
        .replace('__snapshots__' + path.sep, '');

      if (includeSnapExtension) {
        relative = relative.slice(0, -snapshotExtension.length);
      }

      return path.join(dirname, relative);
    },
    testPathForConsistencyCheck:
      'C:\\Data\\Git\\release-please-plus\\build\\test\\sub\\manifest.js',

    // testPathForConsistencyCheck: path.join(
    //   'Libraries',
    //   'Lists',
    //   '__tests__',
    //   'FlatList-test.js'
    // ),
  };
};
