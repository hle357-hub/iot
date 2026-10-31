const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const C = require('D:/iot/sites/thuy-trac/dist/control-core.js');
const nodes = new Map(), timers = [], sent = [];
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, dataset: {}, handlers: {},
    classList: { toggle() {} }, setAttribute() {}, hasAttribute() { return false; },
    addEventListener(k, f) { this.handlers[k] = f; }, showModal() { this.open = true; }, close() { this.open = false; } });
  return nodes.get(id);
}
const port = { writable: { getWriter() { return { async write(bytes) {
  const [, id, command] = new TextDecoder().decode(bytes).match(/^!(\d+) (.+)\n$/); sent.push(command);
  if (command === 'GET') {
    const c = C.defaults();
    const rows = ['BEGIN', 'INTERVAL 1000', 'REPORT 1000', 'HEIGHT 0', 'HYSTERESIS 500', 'SMS 0', 'PHONE -', `MESSAGE ${c.message}`, 'PAUSED 0', 'PAUSELEFT 0', 'LEVELS 3', ...c.levels.map((l,i) => `LEVEL ${i+1} ${l.distance*100} ${l.name}`), 'END'];
    rows.forEach(r => s.window.waterSettings.feed(`@CONFIG ${id} ${r}`));
  }
  const detail = command === 'HELLO' ? ' HELLO 2' : command.startsWith('PAUSE ') ? ` PAUSED 1 REMAIN ${command.slice(6) === '0' ? '-1' : command.slice(6)}` : command === 'RESUME' ? ' PAUSED 0 REMAIN 0' : '';
  s.window.waterSettings.feed(`@ACK ${id} OK${detail}`);
}, releaseLock() {} }; } } };
const s = { console, Date, TextEncoder, TextDecoder, WaterControl: C, connected: true, port, controlBusy: false,
  deviceReady: false, deviceConfig: null, devicePaused: null, deviceHealth: null, healthReceivedAt: 0,
  pauseRemainingMs: null, pauseReceivedAt: 0, sensorFault: null, smsHealth: {}, localConfig: C.defaults(),
  records: [], mode: 'usb', window: {}, document: { querySelectorAll() { return []; } },
  localStorage: { getItem() { return null; }, setItem() {} }, $: node, icon: () => '', esc: x => x, tone: x => x,
  render() {}, updateSource() { s.window.waterSettings?.refreshStatus(); }, toast() {},
  setTimeout(f) { timers.push(f); return timers.length; }, clearTimeout() {} };
vm.createContext(s);
vm.runInContext(fs.readFileSync('D:/iot/sites/thuy-trac/dist/settings.js','utf8'),s);
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  s.window.waterSettings.onConnect(port); timers.shift()(); await tick();
  assert.equal(s.deviceReady, true, 'Control enabled only after HELLO 2 and a full snapshot');
  assert.equal(s.devicePaused, false);
  await node('pause-button').handlers.click(); assert.equal(node('pause-dialog').open,true);
  node('pause-duration-select').value = '5'; node('pause-confirm').handlers.click(); await tick();
  assert.equal(sent.at(-1), 'PAUSE 300000'); assert.equal(s.devicePaused,true); assert.equal(s.pauseRemainingMs,300000);
  s.pauseReceivedAt = Date.now()-400000; s.window.waterSettings.refreshStatus();
  assert.equal(s.devicePaused,true, 'Browser countdown expiry cannot infer physical auto-resume');
  s.window.waterSettings.feed('@STATE PAUSED 0 REMAIN 0');
  assert.equal(s.devicePaused,false); assert.equal(node('pause-button').disabled,false);
  const health = '@HEALTH UPTIME 5000 SENSOR NO_ECHO AGE 2000 CPIN 1 CSQ 19 CREG 0 CEREG 1 MODEMAGE 1000 RTC 1 PAUSED 0 REMAIN 0';
  s.window.waterSettings.feed(health); assert.equal(s.sensorFault,'NO_ECHO'); assert.equal(s.deviceHealth.cereg,1);
  s.window.waterSettings.feed(health.replace('NO_ECHO','OK')); assert.equal(s.sensorFault,null);
  await node('pause-button').handlers.click(); node('pause-duration-select').value='custom'; node('pause-custom-input').value='0';
  const before=sent.length; node('pause-confirm').handlers.click(); await tick();
  assert.equal(sent.length,before,'Invalid custom timer must never reach Nano');
  node('pause-custom-input').value='10'; node('pause-confirm').handlers.click(); await tick();
  assert.equal(sent.at(-1),'PAUSE 600000');
  node('pause-button').handlers.click(); await tick(); assert.equal(sent.at(-1),'RESUME'); assert.equal(s.devicePaused,false);
  s.window.waterSettings.onDisconnect(); assert.equal(s.deviceReady,false); assert.equal(s.deviceHealth,null);
  assert.equal(node('pause-button').disabled,true);
  console.log('PASS: settings + real protocol Link integration, confirmed timed pause, auto-resume frame, health recovery, invalid timer, resume, disconnect.');
})().catch(e => { console.error(e); process.exitCode=1; });
