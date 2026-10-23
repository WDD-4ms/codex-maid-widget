'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeHooks, install } = require('../scripts/install-attention-hooks.cjs');

test('attention hook setup preserves unrelated hooks, is idempotent, and respects timeout limits', () => {
  const command = '"C:/Example/attention-hook.cmd"';
  const config = { description: 'example', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other-hook' }] }] } };
  const merged = mergeHooks(config, command);
  assert.deepEqual(mergeHooks(merged, command), merged);
  assert.equal(config.hooks.Stop.length, 1);
  assert.equal(merged.hooks.Stop[0].hooks[0].command, 'other-hook');
  for (const event of ['Interrupt', 'SessionEnd']) assert.equal(merged.hooks[event][0].hooks[0].timeout, 3);
  assert.equal(merged.hooks.PermissionRequest[0].matcher, '.*');
});

test('Windows attention hook installation uses explicit isolated homes and keeps a config backup', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maid-hook-install-'));
  try {
    const codexHome = path.join(root, 'codex'), dataDir = path.join(root, 'maid');
    fs.mkdirSync(codexHome);
    fs.writeFileSync(path.join(codexHome, 'hooks.json'), '{"hooks":{}}');
    const result = install({ executable: process.execPath, dataDir, codexHome });
    assert.equal(result.configFile, path.join(codexHome, 'hooks.json'));
    assert.ok(fs.readdirSync(dataDir).some(name => name.startsWith('hooks-before-attention-')));
    assert.match(fs.readFileSync(result.wrapper, 'utf8'), /ELECTRON_RUN_AS_NODE=1/);
    assert.ok(fs.readFileSync(result.wrapper, 'utf8').includes(dataDir));
    assert.ok(fs.existsSync(path.join(dataDir, 'attention-hook.cjs')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
