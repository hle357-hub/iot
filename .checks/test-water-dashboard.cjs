const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const nodes = new Map();
function node(id = '') {
  if (nodes.has(id)) return nodes.get(id);
  const el = { textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, offsetWidth: 180,
    dataset: {}, style: {}, handlers: {}, classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute() {}, removeAttribute() {},
    querySelector(selector) { return node(id + selector); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, right: 800, bottom: 500 }; },
    showModal() { this.open = true; }, close() { this.open = false; }, click() { this.handlers.click?.(); }
  };
  nodes.set(id, el);
  return el;
}
node('history-filter').value = 'all';
let exportedBlob;
const storage = new Map();
const sandbox = { console, Date, Blob, TextDecoder, TextEncoder, WaterControl: require('D:/iot/sites/thuy-trac/dist/control-core.js'), setTimeout: () => 0, clearTimeout() {}, setInterval() {},
  requestAnimationFrame() {}, location: { hash: '' }, navigator: {},
  document: { getElementById: node, querySelectorAll: () => [], createElement: () => node('download-link') },
  window: { addEventListener() {}, scrollTo() {} },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  URL: { createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} }
};
vm.createContext(sandbox);
const source = fs.readFileSync('D:/iot/sites/thuy-trac/dist/app.js', 'utf8');
vm.runInContext(source + '\nglobalThis.api = { parseSerialLine, parseText, levelFor, makeDemo, renderHistory, setView, getRecords: () => records, getMode: () => mode, connect };', sandbox);
const api = sandbox.api;
assert.equal(api.getRecords().length, 120);
assert.equal(api.getMode(), 'demo');
assert.equal(api.makeDemo().at(-1).average, 25.3);
assert.equal(api.makeDemo().at(-1).distance, 24.6);
for (const [distance, previous, expected] of [[10, 0, 3], [20, 0, 2], [30, 0, 1], [33, 1, 1], [33, 0, 0], [36, 3, 0]]) assert.equal(api.levelFor(distance, previous), expected);
const line = 'Thoi gian: 11:12 30/10/2026 | KC: 5.68 cm | TB: 5.68 cm | Cap: 0';
assert.equal(api.parseSerialLine(line).level, 0, 'Keep device warm-up state rather than overriding with level 3');
assert.equal(api.parseSerialLine(line).distance, 5.68);
assert.equal(api.parseSerialLine('prefix timestamp ' + line).rtc, '11:12 30/10/2026');
assert.equal(api.parseSerialLine(line.replace('30/10', '31/02')), null);
assert.equal(api.parseSerialLine(line.replace('11:12', '25:12')), null);
assert.equal(api.parseSerialLine(line.replace('5.68', '-1')), null);
assert.equal(api.parseSerialLine('AT+CPSI? NO SERVICE'), null);
assert.equal(api.parseText('unrelated\n' + line + '\nOK').length, 1);
assert.equal(api.parseText('rtc_time,distance_cm,average_cm,alert_level\n11:12 30/10/2026,,5.68,0').length, 0);
node('log-input').value = line + '\n' + line.replace('11:12', '11:13').replace('Cap: 0', 'Cap: 3');
node('apply-import').click();
assert.equal(api.getMode(), 'log');
assert.equal(api.getRecords().length, 2);
assert.equal(node('sample-count').textContent, '2');
assert.equal(node('level-value').textContent, '03');
assert.equal(node('source-badge').innerHTML.includes('minh họa'), false);
api.setView('history');
node('history-filter').value = '3';
api.renderHistory();
assert.equal(node('pagination-label').textContent, '1–1 / 1 kết quả');
node('history-search').value = 'does not exist';
api.renderHistory();
assert.match(node('history-body').innerHTML, /Chưa có kết quả/);
node('export-button').click();
(async () => {
  const csv = await exportedBlob.text();
  assert.equal(api.parseText(csv).length, 2, 'Exported CSV must import back without changing data');
  assert.equal(api.parseText(csv)[1].level, 3);
  await api.connect();
  assert.match(node('toast').textContent, /chưa hỗ trợ/);
  assert.equal(api.getRecords().length, 2, 'Unsupported browser must preserve readings');
  console.log('PASS: Serial parsing, invalid data, firmware thresholds, warm-up state, demo labels, import, history filters, CSV round-trip, unsupported USB.');
})().catch(error => { console.error(error); process.exitCode = 1; });
