'use strict';
// Explicit, opt-in Windows hook installation. Importing this file changes nothing.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const EVENTS = ['PermissionRequest', 'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd', 'UserPromptSubmit'];

function mergeHooks(config, command) {
  const next = structuredClone(config);
  next.hooks ||= {};
  for (const event of EVENTS) {
    const groups = next.hooks[event] || [];
    const kept = groups.map(group => ({ ...group, hooks: group.hooks.filter(hook => hook.command !== command) }))
      .filter(group => group.hooks.length);
    const group = { hooks: [{ type: 'command', command, timeout: ['Interrupt', 'SessionEnd'].includes(event) ? 3 : 5 }] };
    if (['PermissionRequest', 'PostToolUse'].includes(event)) group.matcher = '.*';
    next.hooks[event] = [...kept, group];
  }
  return next;
}

function install({ executable, dataDir, codexHome }) {
  if (process.platform !== 'win32') throw new Error('These hooks currently support Windows only.');
  if (!fs.statSync(executable).isFile()) throw new Error('Expected the built Codex-Maid-Widget.exe.');
  const configFile = path.join(codexHome, 'hooks.json');
  const previous = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null;
  const config = previous === null ? {} : JSON.parse(previous.replace(/^\uFEFF/, ''));
  const wrapper = path.join(dataDir, 'attention-hook.cmd');
  const command = '"' + wrapper.replaceAll('\\', '/') + '"';
  const next = mergeHooks(config, command);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  if (previous !== null) fs.writeFileSync(path.join(dataDir, 'hooks-before-attention-' + Date.now() + '.json'), previous);
  fs.copyFileSync(path.join(__dirname, '../src/attention-hook.cjs'), path.join(dataDir, 'attention-hook.cjs'));
  const cmdPath = value => value.replaceAll('%', '%%');
  fs.writeFileSync(wrapper, [
    '@echo off', 'setlocal', 'set "ELECTRON_RUN_AS_NODE=1"',
    'set "CODEX_MAID_HOME=' + cmdPath(dataDir) + '"',
    '"' + cmdPath(executable) + '" "%~dp0attention-hook.cjs"', 'exit /b 0', '',
  ].join('\r\n'));
  fs.writeFileSync(configFile, JSON.stringify(next, null, 2) + '\n');
  return { configFile, wrapper };
}

if (require.main === module) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = ({ '--executable': 'executable', '--data-dir': 'dataDir', '--codex-home': 'codexHome' })[process.argv[i]];
      if (!key || !process.argv[i + 1]) throw new Error('Usage: node scripts/install-attention-hooks.cjs --executable "path/to/Codex-Maid-Widget.exe" [--data-dir DIR] [--codex-home DIR]');
      options[key] = path.resolve(process.argv[i + 1]);
    }
    if (!options.executable) throw new Error('--executable must point to the built application.');
    options.dataDir ||= path.resolve(process.env.CODEX_MAID_HOME || path.join(os.homedir(), '.codex-maid-widget'));
    options.codexHome ||= path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
    const result = install(options);
    console.log('Installed attention hooks: ' + result.configFile);
    console.log('Review and trust this command in Codex /hooks: ' + result.wrapper);
    console.log('Restart Codex or start a new chat if the hooks have not reloaded.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { mergeHooks, install };
