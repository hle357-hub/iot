const assert = require('assert/strict');
const C = require('D:/iot/sites/thuy-trac/dist/control-core.js');
const clone = x => JSON.parse(JSON.stringify(x));
const defaults = C.defaults();
assert.equal(C.validate(defaults).intervalMs, 1000);
for (const seconds of [5, 10, 30, .1, 3600]) assert.equal(C.validate({ ...defaults, intervalMs: seconds * 1000, reportIntervalMs: Math.max(seconds, 1) * 1000 }).intervalMs, seconds * 1000);
for (const intervalMs of [0, 99, 3600001, NaN, 100.5]) assert.throws(() => C.validate({ ...defaults, intervalMs }));
const six = clone(defaults); six.levels = [60, 50, 40, 30, 20, 10].map((distance, i) => ({ name: `Mức ${i + 1}`, distance }));
assert.equal(C.validate(six).levels.length, 6);
assert.equal(C.levelFor(9, 0, six), 6);
assert.equal(C.levelFor(61, 2, six), 2);
assert.equal(C.levelFor(66, 6, six), 0);
assert.throws(() => C.validate({ ...defaults, levels: [{ name: 'A', distance: 10 }, { name: 'B', distance: 20 }] }));
assert.throws(() => C.validate({ ...defaults, levels: [{ name: 'A', distance: 10 }, { name: 'B', distance: 10 }] }));
assert.throws(() => C.validate({ ...defaults, levels: [] }));
assert.throws(() => C.validate({ ...defaults, levels: new Array(3) }));
assert.throws(() => C.validate({ ...defaults, levels: [{ name: 'ắ'.repeat(9), distance: 10 }] }));
assert.throws(() => C.validate({ ...defaults, phone: '09abc12345' }));
assert.throws(() => C.validate({ ...defaults, smsEnabled: true, phone: '' }));
assert.equal(C.validate({ ...defaults, smsEnabled: true, phone: '+84901234567' }).phone, '+84901234567');
assert.throws(() => C.validate({ ...defaults, message: 'Cảnh báo' }));
assert.throws(() => C.validate({ ...defaults, message: '{unknown}' }));
assert.throws(() => C.validate({ ...defaults, message: '{thoigian}'.repeat(10) }));
assert.equal(C.formatMessage('{cap} {kc} {tb} {thoigian}', { level: 4, distance: 5.25, average: 6.1, rtc: '12:10:05 30/10/2026' }), '4 5.25 6.10 12:10:05 30/10/2026');
assert.equal(C.commandsFor(six).filter(c => c.startsWith('LEVEL ')).length, 6);
assert.equal(C.commandsFor(defaults).at(-1), 'COMMIT');

function snapshot(link, id, config = defaults, paused = false, complete = true) {
  const rows = ['BEGIN', `INTERVAL ${config.intervalMs}`, `REPORT ${config.reportIntervalMs}`, `HEIGHT ${Math.round(config.sensorHeightCm * 100)}`, `HYSTERESIS ${Math.round(config.hysteresisCm * 100)}`, `SMS ${config.smsEnabled ? 1 : 0}`, `PHONE ${config.phone || '-'}`, `MESSAGE ${config.message}`, `PAUSED ${paused ? 1 : 0}`, `PAUSELEFT ${paused ? -1 : 0}`, `LEVELS ${config.levels.length}`, ...config.levels.map((l, i) => `LEVEL ${i + 1} ${Math.round(l.distance * 100)} ${l.name}`)];
  if (complete) rows.push('END');
  for (const row of rows) link.feed(`@CONFIG ${id} ${row}`);
}
(async () => {
  const sent = []; let link;
  link = new C.Link(async line => {
    sent.push(line.trim());
    const [, id, cmd] = line.match(/^!(\d+) (.+)\n$/);
    if (cmd === 'GET') snapshot(link, id, six, true);
    link.feed(`@ACK ${id} OK${cmd === 'HELLO' ? ' HELLO 1' : cmd === 'PAUSE' ? ' PAUSED 1' : cmd === 'RESUME' ? ' PAUSED 0' : ''}`);
  });
  assert.equal(await link.command('HELLO'), 'HELLO 1');
  assert.equal(await link.command('PAUSE'), 'PAUSED 1');
  assert.equal(await link.command('RESUME'), 'PAUSED 0');
  const applied = await link.apply(six);
  assert.equal(applied.config.levels.length, 6);
  assert.equal(applied.paused, true);
  const commands = sent.map(s => s.replace(/^!\d+ /, ''));
  assert(commands.indexOf('BEGIN') < commands.indexOf('LEVELS 6'));
  assert(commands.indexOf('LEVEL 6 1000 Mức 6') < commands.indexOf('COMMIT'));
  assert.equal(commands.at(-1), 'GET');
  link.close();

  let rejected; const rejectedSent = [];
  rejected = new C.Link(async line => {
    const [, id, cmd] = line.match(/^!(\d+) (.+)\n$/); rejectedSent.push(cmd);
    rejected.feed(`@ACK ${id} ${cmd.startsWith('INTERVAL') ? 'ERR INVALID_VALUE' : 'OK'}`);
  });
  await assert.rejects(rejected.apply(defaults), /INVALID_VALUE/);
  assert.equal(rejectedSent.at(-1), 'ABORT');
  assert(!rejectedSent.includes('COMMIT'));
  rejected.close();

  const timed = new C.Link(async () => {}, { timeout: 20 });
  await assert.rejects(timed.command('PAUSE'), /chưa xác nhận/);
  assert.equal(timed.pending.size, 0);
  timed.feed('@ACK 1 OK PAUSED 1');
  assert.equal(timed.pending.size, 0, 'Late ACK cannot resolve another command');
  timed.close();

  let lostCommit;
  lostCommit = new C.Link(async line => {
    const [, id, cmd] = line.match(/^!(\d+) (.+)\n$/);
    if (cmd !== 'COMMIT') lostCommit.feed(`@ACK ${id} OK`);
  }, { timeout: 20 });
  await assert.rejects(lostCommit.apply(defaults), error => error.uncertainCommit === true);
  lostCommit.close();

  const closed = new C.Link(async () => {});
  const paused = closed.command('PAUSE'); closed.close();
  await assert.rejects(paused, /bị ngắt/);
  await assert.rejects(closed.command('GET'), /đã đóng/);

  let incomplete;
  incomplete = new C.Link(async line => {
    const [, id] = line.match(/^!(\d+) /); snapshot(incomplete, id, defaults, false, false); incomplete.feed(`@ACK ${id} OK`);
  });
  await assert.rejects(incomplete.getConfig(), /Chưa đọc đủ/); incomplete.close();
  let missing;
  missing = new C.Link(async line => {
    const [, id] = line.match(/^!(\d+) /);
    const feed = missing.feed.bind(missing);
    missing.feed = value => value.includes(' SMS ') || value.includes(' LEVEL 3 ') ? true : feed(value);
    snapshot(missing, id); feed(`@ACK ${id} OK`);
  });
  await assert.rejects(missing.getConfig(), /Chưa đọc đủ/); missing.close();
  let mismatch;
  mismatch = new C.Link(async line => {
    const [, id, cmd] = line.match(/^!(\d+) (.+)\n$/);
    if (cmd === 'GET') snapshot(mismatch, id, defaults);
    mismatch.feed(`@ACK ${id} OK`);
  });
  await assert.rejects(mismatch.apply(six), error => error.uncertainCommit === true); mismatch.close();
  let wrapped;
  wrapped = new C.Link(async line => { const [, id] = line.match(/^!(\d+) /); assert.equal(id, '1'); snapshot(wrapped, id); wrapped.feed(`@ACK ${id} OK`); });
  wrapped.sequence = 65535;
  assert.equal((await wrapped.getConfig()).config.levels.length, 3); wrapped.close();
  console.log('PASS: 1–6 levels, threshold ordering, UTF-8 limits, phone/SMS validation, sampling intervals, config transaction/readback, pause/resume ACK, rollback, timeout, late ACK, lost commit, disconnect.');
})().catch(error => { console.error(error); process.exitCode = 1; });
