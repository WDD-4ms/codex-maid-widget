'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AttentionState } = require('../src/attention-state.cjs');
const { AttentionMonitor } = require('../src/attention-monitor.cjs');
const { update } = require('../src/attention-hook.cjs');
const record = payload => ({ type: 'response_item', payload });
const ask = (id, async = true, count = 1) => record({ type: 'function_call', name: async ? 'request_user_input_async' : 'request_user_input',
  call_id: id, arguments: JSON.stringify({ questions: Array(count).fill({}) }) });
const result = (id, output = '{}') => record({ type: 'function_call_output', call_id: id, output });
const reply = (id, index = 0) => record({ type: 'message', role: 'user', content: [{ text:
  '<send_user_message_question_reply>\n' + JSON.stringify([{ questionItemId: JSON.stringify(['request_user_input_async', id, index]), answer: 'yes' }]) +
  '\n</send_user_message_question_reply>' }] });
test('async accepted is pending; explicit native answer clears only its question', () => {
  const state = new AttentionState(); state.record('a', ask('one', true, 2));
  state.record('a', result('one', '{"accepted":true}')); assert.equal(state.summary().questions, 1);
  state.record('a', reply('one', 0)); assert.equal(state.summary().questions, 1);
  state.record('a', reply('one', 1)); assert.equal(state.summary().count, 0);
});
test('synchronous questions, rejected requests, and permission calls resolve', () => {
  const state = new AttentionState(); state.record('a', ask('sync', false));
  assert.equal(state.summary().questions, 1); state.record('a', result('sync')); assert.equal(state.summary().count, 0);
  state.record('a', ask('bad')); state.record('a', result('bad', '{"accepted":false}')); assert.equal(state.summary().count, 0);
  state.record('a', record({ type: 'function_call', name: 'request_permissions', call_id: 'p' }));
  assert.equal(state.summary().approvals, 1); state.record('a', result('p')); assert.equal(state.summary().count, 0);
});
test('parallel sessions and async questions survive unrelated tools and turn completion', () => {
  const state = new AttentionState(); state.record('a', ask('one')); state.record('b', ask('two'));
  state.record('a', result('unrelated')); state.record('a', { type: 'event_msg', payload: { type: 'task_complete' } });
  assert.equal(state.summary().questions, 2); state.record('a', reply('one')); assert.equal(state.summary().questions, 1);
  state.record('b', { type: 'event_msg', payload: { type: 'turn_aborted' } }); assert.equal(state.summary().count, 0);
});
test('authorization hook never decides permission and unrelated tools do not clear it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maid-hook-test-'));
  try {
    const event = { session_id: 'session', turn_id: 'turn', tool_name: 'Bash' };
    assert.equal(update({ ...event, hook_event_name: 'PermissionRequest' }, dir), undefined);
    update({ ...event, tool_name: 'apply_patch', hook_event_name: 'PostToolUse' }, dir);
    assert.equal(fs.readdirSync(dir).filter(n => n.endsWith('.json')).length, 1);
    update({ ...event, tool_input: { command: 'second command' }, hook_event_name: 'PermissionRequest' }, dir);
    assert.equal(fs.readdirSync(dir).filter(n => n.endsWith('.json')).length, 2);
    update({ ...event, hook_event_name: 'PostToolUse' }, dir);
    assert.equal(fs.readdirSync(dir).filter(n => n.endsWith('.json')).length, 1);
    update({ ...event, hook_event_name: 'Interrupt' }, dir);
    assert.equal(fs.readdirSync(dir).filter(n => n.endsWith('.json')).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('incremental monitor follows actual JSONL, handles partial lines, and exports only counts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maid-monitor-test-'));
  const file = path.join(dir, 'rollout-2026-10-23-00000000-0000-0000-0000-000000000001.jsonl');
  const changes = []; fs.writeFileSync(file, JSON.stringify(ask('call')) + '\n');
  const monitor = new AttentionMonitor({ codexHome: dir, dataDir: dir, listFiles: async () => [file], onChange: v => changes.push(v) });
  try {
    await monitor.start(); assert.equal(changes.at(-1).questions, 1);
    const line = JSON.stringify(reply('call')); fs.appendFileSync(file, line.slice(0, 35)); monitor.dirty.add(file);
    await monitor.tick(); assert.equal(changes.at(-1).questions, 1);
    fs.appendFileSync(file, line.slice(35) + '\n'); monitor.dirty.add(file); await monitor.tick();
    assert.deepEqual(changes.at(-1), { questions: 0, approvals: 0, count: 0, key: '' });
    assert.equal(JSON.stringify(changes).includes('call'), false);
  } finally { monitor.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a new user message clears old async reminders in that session only', () => {
 const state = new AttentionState(); state.record('a',ask('old')); state.record('b',ask('other'));
 const key = state.summary().key;
 state.record('a',record({type:'message',role:'user',content:[{text:'continue with this task'}]}));
 assert.equal(state.summary().questions,1); assert.notEqual(state.summary().key,key);
 state.record('a',ask('new')); assert.equal(state.summary().questions,2);
});

test('dedicated code-mode permission requests wait until their custom output returns', () => {
 const state = new AttentionState();
 state.record('a',record({type:'custom_tool_call',name:'exec',call_id:'wrapped',input:'text(await tools.request_permissions({permissions:{file_system:{write:["C:/test"]}}}));'}));
 assert.equal(state.summary().approvals,1);
 state.record('a',record({type:'custom_tool_call_output',call_id:'other',output:'ok'}));
 assert.equal(state.summary().approvals,1);
 state.record('a',record({type:'custom_tool_call_output',call_id:'wrapped',output:'{"permissions":{}}'}));
 assert.equal(state.summary().count,0);
 for (const input of ['text("await tools.request_permissions({})");', 'const script = `await tools.request_permissions({})`;', 'text(await tools.exec_command({cmd:"request_permissions"}));']) {
  state.record('a',record({type:'custom_tool_call',name:'exec',call_id:'diagnostic',input}));
  assert.equal(state.summary().count,0);
 }
});
test('monitor follows wrapped permission calls and custom outputs from JSONL', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maid-wrapped-test-'));
 const file=path.join(dir,'rollout-00000000-0000-0000-0000-000000000002.jsonl');
 const changes=[];
 fs.writeFileSync(file,JSON.stringify(record({type:'custom_tool_call',name:'exec',call_id:'p',input:'text(await tools.request_permissions({}));'}))+'\n');
 const monitor=new AttentionMonitor({codexHome:dir,dataDir:dir,listFiles:async()=>[file],onChange:v=>changes.push(v)});
 try {
  await monitor.start();assert.equal(changes.at(-1).approvals,1);
  fs.appendFileSync(file,JSON.stringify(record({type:'custom_tool_call_output',call_id:'p',output:'{}'}))+'\n');
  monitor.dirty.add(file);await monitor.tick();assert.equal(changes.at(-1).count,0);
 } finally {monitor.close();fs.rmSync(dir,{recursive:true,force:true});}
});
