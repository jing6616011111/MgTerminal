const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryRoot = path.resolve(__dirname, '..');
const legacyBrand = ['net', 'catty'].join('');
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'release']);

function listFiles(directory, relativeDirectory = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name)
        ? []
        : listFiles(absolutePath, relativePath);
    }

    return entry.isFile() ? [relativePath] : [];
  });
}

test('tracked files use the MagiesTerminal brand', () => {
  const trackedFiles = listFiles(repositoryRoot);

  const legacyPaths = trackedFiles.filter((file) =>
    file.toLowerCase().includes(legacyBrand),
  );
  const legacyContent = [];

  for (const file of trackedFiles) {
    const content = fs.readFileSync(path.join(repositoryRoot, file));
    if (content.includes(0)) continue;

    if (content.toString('utf8').toLowerCase().includes(legacyBrand)) {
      legacyContent.push(file);
    }
  }

  assert.deepEqual(legacyPaths, [], `legacy brand remains in paths:\n${legacyPaths.join('\n')}`);
  assert.deepEqual(legacyContent, [], `legacy brand remains in files:\n${legacyContent.join('\n')}`);
});
