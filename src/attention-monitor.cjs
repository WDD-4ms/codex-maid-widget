'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { AttentionState } = require('./attention-state.cjs');
const MAX_INITIAL_BYTES = 2 * 1024 * 1024;
const INTEREST = /request_user_input|request_permissions|function_call_output|custom_tool_call_output|send_user_message_question_reply|turn_aborted|task_complete|"role"\s*:\s*"user"/;
const sessionId = file => /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(file)?.[1];

class AttentionMonitor {
  constructor({ codexHome, dataDir, listFiles, onChange, intervalMs = 500 }) {
    Object.assign(this, { codexHome, dataDir, listFiles, onChange, intervalMs });
    this.model = new AttentionState(); this.files = new Map(); this.dirty = new Set();
    this.hookDir = path.join(dataDir, 'attention'); this.watchers = [];
    this.lastScan = 0; this.lastValue = ''; this.closed = false;
  }
  async start() {
    await fsp.mkdir(this.hookDir, { recursive: true });
    try {
      const root = path.join(this.codexHome, 'sessions');
      const watcher = fs.watch(root, { recursive: true }, (_event, name) => {
        if (!name || !String(name).endsWith('.jsonl')) return;
        const file = path.resolve(root, String(name));
        if (file.startsWith(path.resolve(root) + path.sep) && sessionId(file)) this.dirty.add(file);
      });
      watcher.on('error', () => {}); this.watchers.push(watcher);
    } catch { /* Periodic discovery still works without a filesystem watcher. */ }
    await this.tick();
    if (!this.closed) this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }
  async tick() {
    if (this.closed || this.busy) return;
    this.busy = true;
    try {
      if (Date.now() - this.lastScan > 15000) {
        this.lastScan = Date.now();
        const files = await this.listFiles();
        const recent = await Promise.all(files.map(async file => {
          try { const stat = await fsp.stat(file); return { file, time: stat.mtimeMs }; } catch { return null; }
        }));
        for (const entry of recent.filter(Boolean).sort((a, b) => b.time - a.time).slice(0, 128)) this.dirty.add(entry.file);
      }
      const dirty = [...this.dirty]; this.dirty.clear();
      for (const file of dirty) await this.read(file);
      const hooks = [];
      for (const name of await fsp.readdir(this.hookDir)) {
        if (!/^[a-zA-Z0-9_-]{1,200}\.json$/.test(name)) continue;
        try { hooks.push(JSON.parse(await fsp.readFile(path.join(this.hookDir, name), 'utf8'))); } catch {}
      }
      const value = this.model.summary(hooks), key = JSON.stringify(value);
      if (!this.closed && key !== this.lastValue) { this.lastValue = key; this.onChange(value); }
    } catch { /* A disappearing/rotating local file must not interrupt the widget. */ }
    finally { this.busy = false; }
  }
  async read(file) {
    const id = sessionId(file); if (!id) return;
    let handle;
    try {
      const stat = await fsp.stat(file);
      let state = this.files.get(file);
      if (!state || stat.size < state.offset) {
        const offset = Math.max(0, stat.size - MAX_INITIAL_BYTES);
        state = { offset, decoder: new StringDecoder('utf8'), carry: '', skip: offset > 0 };
        this.files.set(file, state); this.model.pending.delete(id);
      }
      if (stat.size === state.offset) return;
      handle = await fsp.open(file, 'r');
      // Stream changed bytes; no chat text is retained or exported.
      while (state.offset < stat.size) {
        const buffer = Buffer.alloc(Math.min(128 * 1024, stat.size - state.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.offset);
        if (!bytesRead) break;
        state.offset += bytesRead;
        const lines = (state.carry + state.decoder.write(buffer.subarray(0, bytesRead))).split('\n');
        state.carry = lines.pop();
        for (const line of lines) {
          if (state.skip) { state.skip = false; continue; }
          if (!INTEREST.test(line)) continue;
          try { this.model.record(id, JSON.parse(line)); } catch {}
        }
        if (state.carry.length > 4 * 1024 * 1024) { state.carry = ''; state.skip = true; }
      }
    } catch {} finally { await handle?.close().catch(() => {}); }
  }
  close() { this.closed = true; clearInterval(this.timer); for (const watcher of this.watchers) watcher.close(); }
}
module.exports = { AttentionMonitor };
