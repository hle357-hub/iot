'use strict';

const icons = {
  waves: '<path d="M3 7c3-4 6 4 9 0s6 4 9 0M3 12c3-4 6 4 9 0s6 4 9 0M3 17c3-4 6 4 9 0s6 4 9 0"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  history: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  plug: '<path d="m8 3 4 4m4-4 4 4M7 8l9 9m-9-9 5-5 9 9-5 5a5 5 0 0 1-7-7M9 15l-6 6"/>',
  ruler: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M7 7v4m5-4v6m5-6v4"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  layers: '<path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up': '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  'arrow-down': '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  sliders: '<path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v2m0 4v12M2 8h6m1 9h6m1-12h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = id => document.getElementById(id);
const levelNames = ['Bình thường', 'Cảnh giác', 'Nguy hiểm', 'Rất nguy hiểm'];
const levelActions = ['Đèn và còi đang tắt', 'Đèn cảnh báo · Theo dõi mực nước', 'Đèn và còi cảnh báo · Mức nguy hiểm', 'Đèn và còi cảnh báo nhanh · Mức rất nguy hiểm'];
const number = value => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');
const rtcTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_RECORDS = 5000;
let records = [], mode = 'demo', view = 'overview', range = '30', page = 0;
let port = null, reader = null, connected = false, lastReceived = 0, stopping = false, connectedAt = 0;
let toastTimer, drawTimer;

function levelFor(average, previous = 0) {
  if (average <= 10) return 3;
  if (average <= 20) return 2;
  if (average <= 30) return 1;
  if (average > 35) return 0;
  return previous;
}

function makeDemo() {
  const result = [];
  const lastFive = [26.3, 25.9, 25.2, 24.5, 24.6];
  for (let i = 0; i < 120; i++) {
    let distance = Math.round((43.5 - i * .145 + Math.sin(i * .18) * 1.3 + Math.sin(i * 1.91) * .32) * 100) / 100;
    if (i >= 115) distance = lastFive[i - 115];
    const samples = [...result.slice(-4).map(r => r.distance), distance];
    const average = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length * 100) / 100;
    const level = i < 4 ? 0 : levelFor(average, result.at(-1)?.level ?? 0);
    result.push({ rtc: rtcTime(new Date(2026, 9, 30, 10, 15, i * 30)), distance, average, level });
  }
  return result;
}

function validRecord(r) {
  if (!r || typeof r.rtc !== 'string' || !/^\d{1,2}:\d{2}(?::\d{2})? \d{1,2}\/\d{1,2}\/\d{4}$/.test(r.rtc)) return false;
  const [time, date] = r.rtc.split(' '), [hour, minute, second = 0] = time.split(':').map(Number);
  const [day, month, year] = date.split('/').map(Number), checked = new Date(year, month - 1, day);
  return hour < 24 && minute < 60 && second < 60 && year >= 2000 && year <= 2099 &&
    checked.getDate() === day && checked.getMonth() === month - 1 &&
    Number.isFinite(r.distance) && r.distance >= 0 && r.distance <= 100000 &&
    Number.isFinite(r.average) && r.average >= 0 && r.average <= 100000 &&
    Number.isInteger(r.level) && r.level >= 0 && r.level <= 3;
}

function parseSerialLine(line) {
  const match = line.match(/Thoi gian:\s*(\d{1,2}:\d{2}(?::\d{2})?\s+\d{1,2}\/\d{1,2}\/\d{4})\s*\|\s*KC:\s*([\d.]+)\s*cm\s*\|\s*TB:\s*([\d.]+)\s*cm\s*\|\s*Cap:\s*([0-3])\b/i);
  if (!match) return null;
  const record = { rtc: match[1].replace(/\s+/g, ' '), distance: Number(match[2]), average: Number(match[3]), level: Number(match[4]) };
  return validRecord(record) ? record : null;
}

function parseText(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), parsed = [];
  const isCsv = lines[0]?.trim() === 'rtc_time,distance_cm,average_cm,alert_level';
  for (const line of lines) {
    if (isCsv) {
      const values = line.trim().split(',');
      if (values.length !== 4 || values.some(v => !v.trim())) continue;
      const record = { rtc: values[0], distance: Number(values[1]), average: Number(values[2]), level: Number(values[3]) };
      if (validRecord(record)) parsed.push(record);
    } else {
      const record = parseSerialLine(line);
      if (record) parsed.push(record);
    }
  }
  return parsed.slice(-MAX_RECORDS);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}

function persist() {
  if (mode === 'demo') return;
  try { localStorage.setItem('thuy-trac-records-v1', JSON.stringify(records)); }
  catch { /* The dashboard continues in memory if storage is unavailable. */ }
}

function updateSource() {
  const badge = $('source-badge'), explanation = $('source-explanation');
  let name, detail, footer;
  if (mode === 'demo') {
    name = 'Dữ liệu minh họa';
    detail = 'Khám phá giao diện với dữ liệu mẫu. Chưa kết nối thiết bị.';
    footer = 'Dữ liệu minh họa · Chưa kết nối thiết bị';
  } else if (mode === 'usb') {
    const age = Date.now() - (lastReceived || connectedAt);
    name = !connected ? 'Đã ngắt kết nối USB' : !lastReceived ? 'Đang chờ dữ liệu USB' : age > 10000 ? 'Dữ liệu USB chưa cập nhật' : 'Dữ liệu trực tiếp · USB';
    detail = !connected ? 'Đang giữ các kết quả đã nhận. Kết nối lại để tiếp tục theo dõi.' : age > 10000 ? 'Chưa có mẫu mới trong 10 giây. Thiết bị có thể đang bận; hãy kiểm tra kết nối.' : 'Đọc kết quả từ Arduino Nano qua cổng USB · 9600 baud.';
    footer = lastReceived ? `Nhận gần nhất lúc ${new Date(lastReceived).toLocaleTimeString('vi-VN')}` : 'Chưa nhận được kết quả đo';
  } else {
    name = mode === 'saved' ? 'Nhật ký đã lưu' : 'Dữ liệu nhật ký';
    detail = 'Kết quả từ nhật ký đã nhập. Đây không phải luồng dữ liệu trực tiếp.';
    footer = `${records.length.toLocaleString('vi-VN')} mẫu · Nhật ký trên trình duyệt`;
  }
  badge.classList.toggle('live', mode === 'usb' && connected && lastReceived > 0 && Date.now() - lastReceived <= 10000);
  badge.innerHTML = `<i></i>${esc(name)}`;
  explanation.textContent = detail;
  $('last-update').textContent = footer;
  $('sidebar-source').textContent = name;
  $('device-connection').textContent = connected ? 'Đã mở cổng USB · 9600 baud' : 'Chưa kết nối USB';
  const button = $('connect-button');
  button.innerHTML = icon('plug') + (connected ? 'Ngắt kết nối' : 'Kết nối thiết bị');
  $('device-connect-button').innerHTML = icon('plug') + (connected ? 'Ngắt kết nối USB' : 'Kết nối qua USB');
  $('demo-button').disabled = connected;
  $('import-button').disabled = connected;
}

function setView(name) {
  view = ['overview', 'history', 'alerts', 'device'].includes(name) ? name : 'overview';
  const titles = { overview: ['Tổng quan', 'Tổng quan mực nước', 'Mọi kết quả đo, trong một góc nhìn.'], history: ['Lịch sử đo', 'Lịch sử kết quả đo', 'Tra cứu, so sánh và lưu lại những gì thiết bị ghi nhận.'], alerts: ['Cảnh báo', 'Theo dõi cảnh báo', 'Nhận biết từng thay đổi trong trạng thái mực nước.'], device: ['Thiết bị', 'Thiết bị & kết nối', 'Kết nối trạm đo và đưa dữ liệu lên giao diện.'] };
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `${view}-view`; });
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('breadcrumb-view').textContent = titles[view][0];
  $('page-title').textContent = titles[view][1];
  $('page-subtitle').textContent = titles[view][2];
  if (view === 'overview') requestAnimationFrame(drawChart);
  if (view === 'history') renderHistory();
  if (view === 'alerts') renderAlerts();
}

function tableRows(items) {
  if (!items.length) return '<tr><td colspan="4" class="empty-cell">Chưa có kết quả phù hợp.<br>Nhập nhật ký hoặc kết nối thiết bị để bắt đầu.</td></tr>';
  return items.map(record => {
    const [time, date] = record.rtc.split(' ');
    return `<tr><td><span class="time-cell">${icon('clock')}<span>${esc(time)}<small>${esc(date)}</small></span></span></td><td>${number(record.distance)} <span class="unit" style="font-size:9px">cm</span></td><td>${number(record.average)} <span class="unit" style="font-size:9px">cm</span></td><td><span class="table-pill level-${record.level}">${record.level ? `Cấp ${record.level} · ` : ''}${levelNames[record.level]}</span></td></tr>`;
  }).join('');
}

function renderHistory() {
  const query = $('history-search').value.trim().toLowerCase(), filter = $('history-filter').value;
  const items = records.filter(r => r.rtc.toLowerCase().includes(query) && (filter === 'all' || r.level === Number(filter))).reverse();
  const totalPages = Math.max(1, Math.ceil(items.length / 15));
  page = Math.max(0, Math.min(page, totalPages - 1));
  $('history-body').innerHTML = tableRows(items.slice(page * 15, page * 15 + 15));
  $('history-count').textContent = `${records.length.toLocaleString('vi-VN')} bản ghi trong dữ liệu đang xem`;
  $('pagination-label').textContent = `${items.length ? page * 15 + 1 : 0}–${Math.min(items.length, page * 15 + 15)} / ${items.length.toLocaleString('vi-VN')} kết quả`;
  $('previous-page').disabled = page === 0;
  $('next-page').disabled = page >= totalPages - 1;
  $('export-button').disabled = !records.length;
}

function renderAlerts() {
  const changes = records.filter((r, i) => i === 0 ? r.level > 0 : r.level !== records[i - 1].level).slice(-100).reverse();
  $('alert-timeline').innerHTML = changes.length ? changes.map(r => `<article class="timeline-item"><span class="timeline-icon level-${r.level}">${icon(r.level ? 'bell' : 'shield')}</span><div><h3>${r.level ? `Cấp ${r.level} · ${levelNames[r.level]}` : 'Trở về trạng thái bình thường'}</h3><p>Trung bình ${number(r.average)} cm · Đo thực tế ${number(r.distance)} cm</p></div><time>${esc(r.rtc)}</time></article>`).join('') : '<div class="empty-state">Chưa ghi nhận thay đổi cảnh báo trong dữ liệu đang xem.</div>';
}

function render() {
  const last = records.at(-1);
  $('current-value').textContent = last ? number(last.distance) : '—';
  $('average-value').textContent = last ? number(last.average) : '—';
  $('level-value').textContent = last ? `0${last.level}` : '—';
  $('level-pill').textContent = last ? levelNames[last.level] : 'Chưa có dữ liệu';
  $('level-pill').className = `level-pill${last ? ` level-${last.level}` : ''}`;
  $('level-caption').textContent = last ? (last.distance === 0 ? 'Khoảng cách bằng 0 · Cần kiểm tra cảm biến' : levelActions[last.level]) : 'Theo trạng thái do thiết bị ghi nhận';
  document.querySelectorAll('[data-threshold]').forEach(el => el.classList.toggle('is-current', !!last && Number(el.dataset.threshold) === last.level));
  let minimum = Infinity, maximum = -Infinity;
  records.forEach(r => { minimum = Math.min(minimum, r.distance); maximum = Math.max(maximum, r.distance); });
  $('minimum-value').textContent = last ? number(minimum) : '—';
  $('maximum-value').textContent = last ? number(maximum) : '—';
  $('sample-count').textContent = records.length.toLocaleString('vi-VN');
  $('nav-count').textContent = records.length.toLocaleString('vi-VN');
  $('recent-body').innerHTML = tableRows(records.slice(-6).reverse());
  updateSource();
  if (view === 'overview') drawChart();
  if (view === 'history') renderHistory();
  if (view === 'alerts') renderAlerts();
}

function drawChart() {
  const svg = $('trend-chart'), items = range === 'all' ? records : records.slice(-Number(range));
  if (!items.length) { svg.innerHTML = '<text x="400" y="145" text-anchor="middle" fill="#94a5bd" font-size="14">Chưa có dữ liệu để vẽ biểu đồ</text>'; return; }
  const width = Math.max(320, Math.min(800, Math.round(svg.getBoundingClientRect().width || 800)));
  const height = width < 500 ? 230 : 290, left = 35, right = 29, top = 20, bottom = 37;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.aspectRatio = `${width} / ${height}`;
  const chartW = width - left - right, chartH = height - top - bottom;
  let maximum = 40;
  items.forEach(r => { maximum = Math.max(maximum, r.distance * 1.1, r.average * 1.1); });
  maximum = Math.ceil(maximum / 10) * 10;
  const x = index => left + (items.length === 1 ? chartW / 2 : index / (items.length - 1) * chartW);
  const y = value => top + chartH - value / maximum * chartH;
  let markup = '<defs><linearGradient id="water-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4a8aff" stop-opacity=".15"/><stop offset="100%" stop-color="#4a8aff" stop-opacity=".01"/></linearGradient></defs>';
  for (let i = 0; i <= 4; i++) {
    const value = maximum * i / 4, yy = y(value);
    markup += `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" stroke="#f0f3f8"/><text x="${left - 12}" y="${yy + 4}" text-anchor="end" fill="#a5b3c7" font-size="10">${Math.round(value)}</text>`;
  }
  for (const threshold of [10, 20, 30]) {
    markup += `<line x1="${left}" x2="${width - right}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#e9cfa1" stroke-opacity=".65" stroke-dasharray="4 6"/><text x="${width - right + 6}" y="${y(threshold) + 3}" fill="#c0ae91" font-size="9">${threshold}</text>`;
  }
  const pathFor = key => items.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(r[key]).toFixed(2)}`).join(' ');
  const actual = pathFor('distance'), average = pathFor('average');
  markup += `<path d="${actual} L${x(items.length - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#water-fill)"/><path d="${actual}" fill="none" stroke="#2775f6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><path d="${average}" fill="none" stroke="#8db3ed" stroke-width="1.7" stroke-dasharray="5 5" stroke-linecap="round"/>`;
  const labelCount = Math.min(items.length, width < 500 ? 4 : 6);
  for (let i = 0; i < labelCount; i++) {
    const index = labelCount === 1 ? 0 : Math.round(i / (labelCount - 1) * (items.length - 1));
    markup += `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" fill="#a5b3c7" font-size="10">${esc(items[index].rtc.split(' ')[0])}</text>`;
  }
  const lastIndex = items.length - 1;
  markup += `<circle cx="${x(lastIndex)}" cy="${y(items[lastIndex].distance)}" r="5" fill="#fff" stroke="#2775f6" stroke-width="2"/><line id="chart-crosshair" class="chart-crosshair" x1="0" x2="0" y1="${top}" y2="${top + chartH}" visibility="hidden"/><rect class="chart-hit" x="${left}" y="${top}" width="${chartW}" height="${chartH}"/>`;
  svg.innerHTML = markup;
  const hit = svg.querySelector('.chart-hit');
  hit.addEventListener('pointermove', event => {
    const bounds = svg.getBoundingClientRect();
    const local = (event.clientX - bounds.left) / bounds.width * width;
    const index = Math.min(lastIndex, Math.max(0, Math.round((local - left) / chartW * lastIndex)));
    const r = items[index], tooltip = $('chart-tooltip'), containerBounds = $('chart-container').getBoundingClientRect();
    tooltip.innerHTML = `${esc(r.rtc)}<br><strong>${number(r.distance)} cm</strong> · TB ${number(r.average)} cm`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(0, Math.min(event.clientX - containerBounds.left + 12, containerBounds.width - tooltip.offsetWidth - 6))}px`;
    tooltip.style.top = '8px';
    const cross = $('chart-crosshair');
    cross.setAttribute('x1', x(index)); cross.setAttribute('x2', x(index)); cross.setAttribute('visibility', 'visible');
  });
  hit.addEventListener('pointerleave', () => { $('chart-tooltip').hidden = true; $('chart-crosshair').setAttribute('visibility', 'hidden'); });
}

async function disconnect() {
  stopping = true;
  try { if (reader) await reader.cancel(); } catch { /* Already disconnected. */ }
  if (port && !reader) { try { await port.close(); } catch { /* Already closed. */ } port = null; }
  connected = false;
  updateSource();
}

async function connect() {
  if (connected) { await disconnect(); return; }
  if (!('serial' in navigator)) { toast('Trình duyệt này chưa hỗ trợ kết nối USB. Hãy mở bằng Chrome/Edge trên máy tính hoặc nhập nhật ký.'); return; }
  $('connect-button').disabled = true;
  $('device-connect-button').disabled = true;
  let selectedPort = null;
  try {
    selectedPort = await navigator.serial.requestPort();
    await selectedPort.open({ baudRate: 9600 });
  } catch (error) {
    if (error.name !== 'NotFoundError') toast('Chưa mở được cổng USB. Hãy đóng Serial Monitor của Arduino, kiểm tra dây và thử lại.');
    $('connect-button').disabled = false;
    $('device-connect-button').disabled = false;
    return;
  }
  port = selectedPort;
  connected = true;
  stopping = false;
  connectedAt = Date.now();
  lastReceived = 0;
  records = [];
  mode = 'usb';
  page = 0;
  render();
  $('connect-button').disabled = false;
  $('device-connect-button').disabled = false;
  toast('Đã mở cổng USB. Đang chờ kết quả đo từ Arduino.');
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    reader = selectedPort.readable.getReader();
    while (!stopping) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop().slice(-8192);
      let received = false;
      for (const line of lines) {
        const record = parseSerialLine(line);
        if (!record) continue;
        records.push(record);
        lastReceived = Date.now();
        received = true;
      }
      if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
      if (received) { render(); persist(); }
    }
  } catch {
    if (!stopping) toast('Kết nối USB bị gián đoạn. Các kết quả đã nhận vẫn được giữ lại.');
  } finally {
    if (reader) { reader.releaseLock(); reader = null; }
    try { await selectedPort.close(); } catch { /* Device may have been unplugged. */ }
    if (port === selectedPort) { port = null; connected = false; stopping = false; }
    updateSource();
  }
}

function openImport() {
  $('import-feedback').textContent = '';
  $('import-dialog').showModal();
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => setView(el.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.goto; setView(el.dataset.goto); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
document.querySelectorAll('[data-range]').forEach(el => el.addEventListener('click', () => {
  range = el.dataset.range;
  document.querySelectorAll('[data-range]').forEach(button => { const selected = button === el; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  drawChart();
}));
$('history-search').addEventListener('input', () => { page = 0; renderHistory(); });
$('history-filter').addEventListener('change', () => { page = 0; renderHistory(); });
$('previous-page').addEventListener('click', () => { page--; renderHistory(); });
$('next-page').addEventListener('click', () => { page++; renderHistory(); });
$('connect-button').addEventListener('click', connect);
$('device-connect-button').addEventListener('click', connect);
$('import-button').addEventListener('click', openImport);
$('close-dialog').addEventListener('click', () => $('import-dialog').close());
$('cancel-import').addEventListener('click', () => $('import-dialog').close());
$('import-dialog').addEventListener('click', event => { if (event.target === $('import-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { $('import-feedback').textContent = 'Tệp quá lớn. Vui lòng chọn tệp dưới 10 MB.'; return; }
  try { $('log-input').value = await file.text(); $('import-feedback').textContent = `Đã đọc tệp ${file.name}. Bấm Hiển thị kết quả để nhập.`; }
  catch { $('import-feedback').textContent = 'Không đọc được tệp. Vui lòng thử lại hoặc dán nội dung nhật ký.'; }
});
$('apply-import').addEventListener('click', () => {
  const parsed = parseText($('log-input').value);
  if (!parsed.length) { $('import-feedback').textContent = 'Chưa tìm thấy kết quả đo hợp lệ. Cần dòng Thoi gian / KC / TB / Cap hoặc CSV xuất từ giao diện này.'; return; }
  records = parsed;
  mode = 'log';
  page = 0;
  persist();
  render();
  $('import-dialog').close();
  toast(`Đã nhập ${records.length.toLocaleString('vi-VN')} kết quả đo. Các dòng thông báo khác được bỏ qua.`);
});
$('demo-button').addEventListener('click', () => { if (connected) return; records = makeDemo(); mode = 'demo'; page = 0; render(); toast('Đang xem dữ liệu minh họa, không phải kết quả trực tiếp từ thiết bị.'); });
$('export-button').addEventListener('click', () => {
  const csv = '\uFEFFrtc_time,distance_cm,average_cm,alert_level\r\n' + records.map(r => `${r.rtc},${r.distance.toFixed(2)},${r.average.toFixed(2)},${r.level}`).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `thuy-trac-${mode === 'demo' ? 'minh-hoa-' : ''}${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Đã xuất ${records.length.toLocaleString('vi-VN')} bản ghi${mode === 'demo' ? ' minh họa' : ''}.`);
});
window.addEventListener('resize', () => { clearTimeout(drawTimer); drawTimer = setTimeout(() => { if (view === 'overview') drawChart(); }, 100); });
setInterval(updateSource, 1000);

try {
  const saved = JSON.parse(localStorage.getItem('thuy-trac-records-v1'));
  if (Array.isArray(saved) && saved.length && saved.every(validRecord)) { records = saved.slice(-MAX_RECORDS); mode = 'saved'; }
} catch { /* Start with clearly marked demonstration data. */ }
if (!records.length) records = makeDemo();
setView(location.hash.slice(1));
render();
