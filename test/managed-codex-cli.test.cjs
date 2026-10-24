'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveCodexExecutable, managedCodexExecutable } = require('../src/codex-cli.cjs');
const local = 'D:\\Example User\\AppData\\Local';
const root = path.win32.join(local, 'OpenAI', 'Codex', 'bin');
const old = path.win32.join(root, '1111111111111111', 'codex.exe');
const current = path.win32.join(root, '2222222222222222', 'codex.exe');
function options(files) {
  return { platform: 'win32', env: { LocalAppData: local, PATH: '' },
    fileSystem: {
      readdirSync(directory) { assert.equal(directory, root); return ['1111111111111111', '2222222222222222', '3333333333333333', 'unrelated']; },
      statSync(file) { if (!files.has(file)) throw Error('absent'); return { isFile: () => true, mtimeMs: files.get(file) }; },
    },
    find(value) { if (value) return value; throw Object.assign(Error('missing'), { code: 'CLI_MISSING' }); },
    queryDesktop() { throw Error('managed discovery should not query desktop'); },
  };
}
test('Explorer without CLI on PATH resolves the latest complete managed Windows runtime', async () => {
  const opts = options(new Map([[old, 1], [current, 2]]));
  assert.equal(await resolveCodexExecutable(null, opts), current);
});
test('an obsolete managed CLI override recovers after desktop runtime replacement', async () => {
  assert.equal(await resolveCodexExecutable(old, options(new Map([[current, 2]]))), current);
});
test('an existing pinned CLI and ordinary custom overrides remain authoritative', async () => {
  const opts = options(new Map([[old, 1], [current, 2]]));
  assert.equal(await resolveCodexExecutable(old, opts), old);
  assert.equal(await resolveCodexExecutable('E:\\Custom\\codex.exe', opts), 'E:\\Custom\\codex.exe');
});
test('managed lookup ignores incomplete directories and stays inside its declared layout', () => {
  assert.equal(managedCodexExecutable(options(new Map())), null);
  assert.equal(managedCodexExecutable({ ...options(new Map([[current, 2]])), platform: 'darwin' }), null);
});
