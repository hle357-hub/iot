(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterControl = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const defaults = () => ({ intervalMs: 1000, hysteresisCm: 5, smsEnabled: false, phone: '', message: 'CANH BAO LU cap {cap}. Khoang cach {kc} cm, trung binh {tb} cm luc {thoigian}.', levels: [{ name: 'Cảnh giác', distance: 30 }, { name: 'Nguy hiểm', distance: 20 }, { name: 'Rất nguy hiểm', distance: 10 }] });
  const bytes = value => new TextEncoder().encode(value).length;
  function validate(raw) {
    if (!raw || !Array.isArray(raw.levels) || raw.levels.length < 1 || raw.levels.length > 6) throw Error('Cần từ 1 đến 6 mức cảnh báo.');
    const config = { intervalMs: Number(raw.intervalMs), hysteresisCm: Number(raw.hysteresisCm), smsEnabled: !!raw.smsEnabled, phone: String(raw.phone ?? '').trim(), message: String(raw.message ?? '').trim(), levels: Array.from(raw.levels, l => ({ name: String(l?.name ?? '').trim(), distance: Number(l?.distance) })) };
    if (!Number.isInteger(config.intervalMs) || config.intervalMs < 100 || config.intervalMs > 3600000) throw Error('Chu kỳ đo phải từ 0,1 đến 3.600 giây.');
    if (!Number.isFinite(config.hysteresisCm) || config.hysteresisCm < 0 || config.hysteresisCm > 100 || Math.abs(config.hysteresisCm * 100 - Math.round(config.hysteresisCm * 100)) > 1e-6) throw Error('Độ trễ tắt cảnh báo phải từ 0 đến 100 cm, tối đa 2 chữ số thập phân.');
    config.levels.forEach((l, i) => {
      if (!l.name || bytes(l.name) > 23 || /[\x00-\x1f\x7f|]/.test(l.name)) throw Error(`Tên cấp ${i + 1} cần từ 1 đến 23 byte UTF-8, không có ký tự xuống dòng hoặc dấu |.`);
      if (!Number.isFinite(l.distance) || l.distance < .1 || l.distance > 500 || Math.abs(l.distance * 100 - Math.round(l.distance * 100)) > 1e-6) throw Error(`Khoảng cách cấp ${i + 1} phải từ 0,1 đến 500 cm, tối đa 2 chữ số thập phân.`);
      if (i && l.distance >= config.levels[i - 1].distance) throw Error('Khoảng cách phải giảm dần khi cấp cảnh báo tăng; các ngưỡng không được trùng nhau.');
    });
    if (config.phone && !/^\+?\d{8,15}$/.test(config.phone)) throw Error('Số điện thoại cần 8–15 chữ số, có thể bắt đầu bằng +.');
    if (config.smsEnabled && !config.phone) throw Error('Nhập số điện thoại trước khi bật gửi SMS.');
    if (!/^[\x20-\x7e]{1,120}$/.test(config.message)) throw Error('Mẫu SMS cần 1–120 ký tự không dấu, trên một dòng.');
    const tokens = config.message.match(/\{[^{}]*\}/g) || [];
    if (tokens.some(t => !['{cap}', '{kc}', '{tb}', '{thoigian}'].includes(t)) || /[{}]/.test(config.message.replace(/\{(?:cap|kc|tb|thoigian)\}/g, ''))) throw Error('SMS chỉ hỗ trợ {cap}, {kc}, {tb}, {thoigian}.');
    const longest = formatMessage(config.message, { level: 6, distance: 500, average: 500, rtc: '23:59:59 31/12/2099' });
    if (longest.length > 160) throw Error('SMS sau khi thay số liệu có thể vượt 160 ký tự. Hãy rút gọn mẫu hoặc bớt biến.');
    return config;
  }
  function formatMessage(template, record = {}) {
    const data = { cap: record.level ?? 1, kc: Number(record.distance ?? 24.6).toFixed(2), tb: Number(record.average ?? 25.3).toFixed(2), thoigian: record.rtc || '11:12:00 30/10/2026' };
    return template.replace(/\{(cap|kc|tb|thoigian)\}/g, (_, key) => String(data[key]));
  }
  function commandsFor(raw) {
    const c = validate(raw);
    return ['BEGIN', `INTERVAL ${c.intervalMs}`, `HYSTERESIS ${Math.round(c.hysteresisCm * 100)}`, `PHONE ${c.phone || '-'}`, `MESSAGE ${c.message}`, `SMS ${c.smsEnabled ? 1 : 0}`, `LEVELS ${c.levels.length}`, ...c.levels.map((l, i) => `LEVEL ${i + 1} ${Math.round(l.distance * 100)} ${l.name}`), 'COMMIT'];
  }
  function levelFor(average, previous, c) {
    let level = 0;
    c.levels.forEach((l, i) => { if (average <= l.distance) level = i + 1; });
    if (!level && average <= c.levels[0].distance + c.hysteresisCm) level = Math.min(previous, c.levels.length);
    return level;
  }
  class Link {
    constructor(write, options = {}) { this.write = write; this.timeout = options.timeout || 4000; this.sequence = 0; this.pending = new Map(); this.snapshots = new Map(); this.closed = false; }
    command(command) {
      if (this.closed) return Promise.reject(Error('Kết nối USB đã đóng.'));
      if (this.pending.size) return Promise.reject(Error('Thiết bị đang xử lý một lệnh khác.'));
      const id = this.sequence = this.sequence % 65535 + 1;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); this.snapshots.delete(id); reject(Error('Nano chưa xác nhận lệnh. Kiểm tra kết nối và bản chương trình đã nạp.')); }, this.timeout);
        this.pending.set(id, { resolve, reject, timer, command });
        Promise.resolve().then(() => this.write(`!${id} ${command}\n`)).catch(error => { clearTimeout(timer); this.pending.delete(id); this.snapshots.delete(id); reject(error); });
      });
    }
    feed(line) {
      const ack = line.match(/^@ACK (\d+) (OK|ERR)(?: (.*))?$/);
      if (ack) {
        const id = Number(ack[1]), pending = this.pending.get(id);
        if (!pending) return true;
        clearTimeout(pending.timer); this.pending.delete(id);
        if (ack[2] === 'ERR') { this.snapshots.delete(id); pending.reject(Error(`Nano từ chối lệnh: ${ack[3] || 'không hợp lệ'}.`)); }
        else pending.resolve(ack[3] || '');
        return true;
      }
      const meta = line.match(/^@CONFIG (\d+) (\S+)(?: (.*))?$/);
      if (!meta) return false;
      const id = Number(meta[1]), key = meta[2], value = meta[3] || '';
      if (this.pending.get(id)?.command !== 'GET') return true;
      if (key === 'BEGIN') this.snapshots.set(id, { levels: [], paused: null, complete: false, invalid: false, seen: new Set() });
      const c = this.snapshots.get(id); if (!c) return true;
      c.seen.add(key);
      if (key === 'INTERVAL') c.intervalMs = Number(value);
      if (key === 'HYSTERESIS') c.hysteresisCm = Number(value) / 100;
      if (key === 'PHONE') c.phone = value === '-' ? '' : value;
      if (key === 'MESSAGE') c.message = value;
      if (key === 'SMS') { c.smsEnabled = value === '1'; if (!['0', '1'].includes(value)) c.invalid = true; }
      if (key === 'PAUSED') { c.paused = value === '1'; if (!['0', '1'].includes(value)) c.invalid = true; }
      if (key === 'LEVELS') c.expectedCount = Number(value);
      if (key === 'LEVEL') {
        const m = value.match(/^(\d+) (\d+) (.+)$/);
        if (!m || Number(m[1]) < 1 || Number(m[1]) > 6 || c.levels[Number(m[1]) - 1]) c.invalid = true;
        else c.levels[Number(m[1]) - 1] = { distance: Number(m[2]) / 100, name: m[3] };
      }
      if (key === 'END') c.complete = true;
      return true;
    }
    async getConfig() {
      const id = this.sequence % 65535 + 1;
      await this.command('GET');
      const snapshot = this.snapshots.get(id); this.snapshots.delete(id);
      const required = ['INTERVAL', 'HYSTERESIS', 'SMS', 'PHONE', 'MESSAGE', 'PAUSED', 'LEVELS'];
      if (!snapshot?.complete || snapshot.invalid || required.some(key => !snapshot.seen.has(key)) || snapshot.levels.length !== snapshot.expectedCount || Array.from(snapshot.levels).some(l => !l)) throw Error('Chưa đọc đủ cấu hình từ Nano.');
      return { config: validate(snapshot), paused: snapshot.paused };
    }
    async apply(raw) {
      const commands = commandsFor(raw);
      let commitSent = false;
      try {
        for (const command of commands) { if (command === 'COMMIT') commitSent = true; await this.command(command); }
        const snapshot = await this.getConfig();
        if (JSON.stringify(snapshot.config) !== JSON.stringify(validate(raw))) throw Error('Cấu hình đọc lại không khớp bản đã gửi.');
        return snapshot;
      } catch (error) {
        if (!commitSent && !this.closed) { try { await this.command('ABORT'); } catch { /* Device also expires an unfinished transaction. */ } }
        if (commitSent) { const uncertain = Error('Chưa xác nhận được cấu hình sau khi lưu. Đọc lại từ Nano trước khi áp dụng lần nữa.'); uncertain.uncertainCommit = true; throw uncertain; }
        throw error;
      }
    }
    close() {
      this.closed = true;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(Error('Kết nối USB đã bị ngắt.')); }
      this.pending.clear(); this.snapshots.clear();
    }
  }
  return { defaults, validate, formatMessage, commandsFor, levelFor, Link, bytes };
});
