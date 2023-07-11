// https://github.com/microsoft/react-native-windows/tree/main/packages/%40rnw-scripts/jest-out-of-snapshot-resolver
// https://brunoscheufler.com/blog/2020-03-08-configuring-jest-snapshot-resolvers

// This resolves tests in the merged build output to the snapshot in their
// source tree. This ensures we update the correct snapshot.
exports.createSnapshotResolver = (
  sourcePath,
  rootPath,
  includeSnapExtension = false
) => {
  const path = require('path');
  return {
    //C:\\Data\\Git\\release-please-plus
    //C:\\Data\\Git\\release-please-plus\\build\\test\\strategies\\dotnet-yoshi.js'
    resolveSnapshotPath: (testPath, snapshotExtension) => {
      const testDir = path.dirname(testPath);

      let testSrcDir = testDir;

      if (testDir.startsWith(sourcePath)) {
        testSrcDir = testDir.replace(sourcePath, '');
      }
      const testFile = path.basename(testPath);

      return (
        path.join(rootPath, '__snapshots__', testSrcDir, testFile) +
        (includeSnapExtension ? snapshotExtension : '')
      );
    },

    resolveTestPath: (snapshotFilePath, snapshotExtension) => {
      let relative = snapshotFilePath
        .replace(rootPath + path.sep, '')
        .replace('__snapshots__' + path.sep, '');

      if (includeSnapExtension) {
        relative = relative.slice(0, -snapshotExtension.length);
      }

      return path.join(sourcePath, relative);
    },
    testPathForConsistencyCheck:
      'C:\\Data\\Git\\release-please-plus\\build\\test\\strategies\\dotnet-yoshi.js',

    // testPathForConsistencyCheck: path.join(
    //   'Libraries',
    //   'Lists',
    //   '__tests__',
    //   'FlatList-test.js'
    // ),
  };
};
