'use strict';
// Notification only: emit no decision, stdout, prompts, commands or credentials.
// Mapping adapted from lokicorvus/CrossPet (MIT); see licenses/CROSSPET-LICENSE.txt.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
function update(event, directory) {
  const id = event?.session_id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return;
  const kind = event.hook_event_name, turn = event.turn_id || '', tool = event.tool_name || '';
  // Separate files avoid concurrent approval hooks overwriting one another.
  const input = event.tool_input?.command ?? event.tool_input ?? null;
  const key = createHash('sha256').update(JSON.stringify([turn, tool, input])).digest('hex').slice(0, 24);
  const prefix = id + '__', file = path.join(directory, prefix + key + '.json');
  if (['Stop', 'Interrupt', 'SessionEnd', 'UserPromptSubmit'].includes(kind)) {
    try { for (const name of fs.readdirSync(directory)) if (name.startsWith(prefix) && name.endsWith('.json')) fs.unlinkSync(path.join(directory, name)); } catch {}
    return;
  }
  if (kind === 'PostToolUse') { try { fs.unlinkSync(file); } catch {} return; }
  if (kind !== 'PermissionRequest') return;
  fs.mkdirSync(directory, { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ pending: true, turn, tool, at: Date.now() })); fs.renameSync(temp, file);
}
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 1024 * 1024) process.exit(0); });
  process.stdin.on('end', () => {
    try { update(JSON.parse(input), path.join(process.env.CODEX_MAID_HOME || path.join(os.homedir(), '.codex-maid-widget'), 'attention')); } catch {}
  });
}
module.exports = { update };
