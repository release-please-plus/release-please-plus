// https://github.com/microsoft/react-native-windows/tree/main/packages/%40rnw-scripts/jest-out-of-snapshot-resolver
// https://brunoscheufler.com/blog/2020-03-08-configuring-jest-snapshot-resolvers

// This resolves tests in the merged build output to the snapshot in their
// source tree. This ensures we update the correct snapshot.
exports.createSnapshotResolver = (
  sourcePath: string,
  rootPath: string,
  includeSnapExtension = false
) => {
  const path = require('path');
  return {
    resolveSnapshotPath: (testPath: string, snapshotExtension: string) => {
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

    resolveTestPath: (snapshotFilePath: string, snapshotExtension: string) => {
      let relative = snapshotFilePath
        .replace(rootPath + path.sep, '')
        .replace('__snapshots__' + path.sep, '');

      if (includeSnapExtension) {
        relative = relative.slice(0, -snapshotExtension.length);
      }

      return path.join(sourcePath, relative);
    },
    testPathForConsistencyCheck: path.join(
      sourcePath,
      'strategies',
      'dotnet-yoshi.js'
    ),
  };
};
