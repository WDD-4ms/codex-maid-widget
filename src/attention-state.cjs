'use strict';
// Local adaptation of CrossPet's asking/PermissionRequest mapping. Unlike an
// animation state, each pending request lives until that request is resolved.
const { createHash } = require('node:crypto');
const ASK_TOOLS = new Set(['request_user_input', 'request_user_input_async']);
const PERMISSION_TOOLS = new Set(['request_permissions']);
// Dedicated code-mode permission calls are recorded as custom exec calls.
// Anchor to executable input so mentions inside strings or diagnostics do not count.
const wrappedPermission = item => item.type === 'custom_tool_call' && toolName(item.name) === 'exec' &&
  /^\s*(?:\/\/[^\n]*\n\s*)*(?:text\s*\(\s*)?await\s+tools\.request_permissions\s*\(/.test(item.input || '');
const toolName = value => String(value || '').split(/[.:]/).pop().toLowerCase();

class AttentionState {
  constructor() { this.pending = new Map(); }
  session(id) {
    if (!this.pending.has(id)) this.pending.set(id, new Map());
    return this.pending.get(id);
  }
  record(sessionId, record) {
    const item = record?.payload;
    if (!item || !sessionId) return;
    const pending = this.session(sessionId);
    if (record.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(item.type)) {
      const name = wrappedPermission(item) ? 'request_permissions' : toolName(item.name), call = item.call_id;
      if (typeof call !== 'string' || (!ASK_TOOLS.has(name) && !PERMISSION_TOOLS.has(name))) return;
      let count = 1;
      if (name === 'request_user_input_async') {
        try { count = Math.max(1, JSON.parse(item.arguments).questions?.length || 1); } catch {}
      }
      pending.set(call, { kind: PERMISSION_TOOLS.has(name) ? 'approval' : 'question',
        async: name === 'request_user_input_async', items: new Set(Array.from({ length: Math.min(count, 20) }, (_, i) => i)) });
    } else if (record.type === 'response_item' && ['function_call_output', 'custom_tool_call_output'].includes(item.type)) {
      const entry = pending.get(item.call_id);
      if (!entry) return;
      // An asynchronous question returns accepted:true immediately; that is not
      // the user's answer. Synchronous input/permission calls return after it.
      let accepted = false;
      try { accepted = JSON.parse(item.output)?.accepted === true; } catch {}
      if (!entry.async || !accepted) pending.delete(item.call_id);
    } else if (record.type === 'response_item' && item.type === 'message' && item.role === 'user') {
      const parts = item.content || [];
      const structured = parts.some(part => typeof part.text === 'string' && part.text.startsWith('<send_user_message_question_reply>'));
      if (!structured) for (const [id, entry] of pending) if (entry.async) pending.delete(id);
      for (const part of parts) {
        const text = part.text;
        if (typeof text !== 'string' || !text.startsWith('<send_user_message_question_reply>')) continue;
        try {
          const body = text.slice(text.indexOf('>') + 1, text.lastIndexOf('</'));
          for (const reply of JSON.parse(body)) {
            const [, call, index] = JSON.parse(reply.questionItemId);
            const entry = pending.get(call);
            if (!entry) continue;
            entry.items.delete(index);
            if (!entry.items.size) pending.delete(call);
          }
        } catch { /* A partial/non-structured message does not resolve a request. */ }
      }
    } else if (record.type === 'event_msg' && ['turn_aborted', 'task_complete'].includes(item.type)) {
      // Pending asynchronous questions can outlive a completed assistant turn.
      for (const [id, entry] of pending) if (!entry.async || item.type === 'turn_aborted') pending.delete(id);
    }
  }
  summary(hooks = []) {
    let questions = 0, approvals = 0;
    for (const pending of this.pending.values()) for (const value of pending.values()) {
      if (value.kind === 'approval') approvals++; else questions++;
    }
    for (const hook of hooks) if (hook?.pending === true) approvals++;
    const ids = [...this.pending].flatMap(([session, entries]) => [...entries.keys()].map(id => session + ':' + id));
    ids.push(...hooks.filter(h => h?.pending === true).map(h => JSON.stringify(h)));
    const key = ids.length ? createHash('sha256').update(ids.sort().join('\n')).digest('hex').slice(0, 16) : '';
    return { questions, approvals, count: questions + approvals, key };
  }
}
module.exports = { AttentionState, toolName };
