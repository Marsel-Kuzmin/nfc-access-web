// Apply the saved palette before styles paint, including on a full page reload.
const themeStorageKey = 'nfc-access-theme';
try {
  document.documentElement.dataset.theme = localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
} catch { document.documentElement.dataset.theme = 'light'; }

document.addEventListener('DOMContentLoaded', () => {
const $ = id => document.getElementById(id);
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  device: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4"/><rect x="10" y="10" width="4" height="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M3 12h18M8 8h8v8H8z"/>',
  shield: '<path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6zM12 8v5m0 3h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  plug: '<path d="M9 3v5m6-5v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
function renderThemeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = dark ? 'Светлая тема' : 'Тёмная тема';
  $('theme-icon').innerHTML = icon(dark ? 'sun' : 'moon');
  $('theme-label').textContent = label;
  $('theme-toggle').setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
}
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(themeStorageKey, theme); } catch { /* Switching still works if storage is unavailable. */ }
  renderThemeToggle();
});
window.addEventListener('storage', event => {
  if (event.key !== themeStorageKey && event.key !== null) return;
  document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light';
  renderThemeToggle();
});
renderThemeToggle();
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, forms) => forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const time = value => value ? dateFormat.format(new Date(value)) : '—';
let state = null, page = 'overview', editing = null, refreshing = false, toastTimer, searchTimer, cardFilter = 'all', recentScans = [], eventsRevision = 0;
const renderCache = new Map();

async function api(path, method = 'GET', body) {
  await window.NFCCloud.ready;
  if(window.NFCCloud.enabled)return window.NFCCloud.api(path,method,body);
  const response = await fetch(path, { method, signal: AbortSignal.timeout(8000), headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-NFC-Token': state?.csrf || '' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Ошибка сервера.');
  return result;
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function showPage() {
  const pages = { overview: 'Обзор системы', cards: 'Карты доступа', events: 'Журнал событий', device: 'Устройство' };
  const requested = location.hash.slice(1) || 'overview';
  page = pages[requested] ? requested : 'overview';
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active', el.dataset.page === page); el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false'); });
  document.title = `${pages[page]} — NFC Access`;
  $('breadcrumb-page').textContent = pages[page];
  window.scrollTo(0, 0);
  if (page === 'device') loadPorts();
  if (state) refresh();
}
function empty(title, description, type = 'list', action = '') {
  return `<div class="empty-state"><h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function renderCards() {
  if (!state) return;
  const search = $('cards-search').value.toLocaleLowerCase('ru');
  const signature = JSON.stringify([state.cards, search, cardFilter]);
  if (renderCache.get('cards') === signature) return;
  renderCache.set('cards', signature);
  const cards = state.cards.filter(c => (cardFilter === 'all' || !!c.active === (cardFilter === 'active')) && `${c.name} ${c.uid} ${c.uid.replaceAll(' ', '')} ${c.note}`.toLocaleLowerCase('ru').includes(search));
  $('cards-total').textContent = `Показано: ${cards.length} из ${state.cards.length}`;
  if (!cards.length) {
    $('cards-table').innerHTML = empty(state.cards.length ? 'Карты не найдены' : 'В реестре пока нет карт', state.cards.length ? 'Измените поиск или состояние карты.' : 'Поднесите карту к PN532 или введите UID вручную.', 'card', state.cards.length ? '' : '<button class="primary" data-action="add-card">Добавить первую карту</button>'); return;
  }
  $('cards-table').innerHTML = `<div class="table-wrap"><table class="card-table" aria-label="Реестр карт"><thead><tr><th scope="col">Владелец</th><th scope="col">UID карты</th><th scope="col">Примечание</th><th scope="col">Состояние</th><th scope="col">Действия</th></tr></thead><tbody>${cards.map(c => `<tr><td><span class="card-person"><span class="card-initial" aria-hidden="true">${escape(c.name.split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase())}</span><span><strong>${escape(c.name)}</strong><small class="card-note-inline">${escape(c.note || 'Без примечания')}</small></span></span></td><td class="mono">${escape(c.uid)}</td><td class="card-note">${escape(c.note || 'Без примечания')}</td><td><span class="badge ${c.active ? 'good' : 'neutral'}">${c.active ? 'Активна' : 'Отключена'}</span></td><td><div class="card-actions"><button class="card-edit" data-edit="${c.id}" aria-label="Изменить карту ${escape(c.name)}"><span class="action-label">Изменить</span> ↗</button><button class="icon-button card-toggle" data-toggle="${c.id}" aria-label="${c.active ? 'Отключить' : 'Активировать'} карту ${escape(c.name)}" title="${c.active ? 'Отключить' : 'Активировать'}">${icon(c.active ? 'shield' : 'play')}</button><button class="icon-button card-delete" data-delete="${c.id}" aria-label="Удалить карту ${escape(c.name)}" title="Удалить карту">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function renderEvents(events, target, recent = false) {
  const signature = JSON.stringify(events);
  if (renderCache.get(target) === signature) return;
  renderCache.set(target, signature);
  if (!recent) $('events-count').textContent = `По фильтру / ${events.length}${events.length === 200 ? '+' : ''} ${plural(events.length,['событие','события','событий'])}`;
  if (!events.length) { $(target).innerHTML = empty(recent ? 'Считываний пока нет' : 'События не найдены', recent ? 'Подключите ESP32 и поднесите карту к PN532. Тесты реестра отображаются отдельно в журнале.' : 'Измените поиск или источник. Новые считывания появятся после подключения ESP32.', 'list', recent ? '<a class="text-link" href="#device">Подключить устройство →</a>' : ''); return; }
  const kinds = { scan: 'Карта считана', command: 'Команда отправлена', system: 'Система', demo_allow: 'Тест · активна', demo_deny: 'Тест · неактивна / неизвестна' };
  const rows = events.map(e => {
    const unknown = e.kind === 'scan' && !e.name;
    const title = e.source==='network'&&e.kind==='scan' ? (e.allowed?'Разрешена на ESP32':'Отклонена на ESP32') : unknown ? 'Не в реестре' : kinds[e.kind] || e.kind;
    const mark = unknown || e.allowed===false || e.source === 'demo' ? `<span class="badge ${unknown||e.allowed===false ? 'warning' : 'test'}">${escape(title)}</span>` : escape(title);
    const event = recent ? mark : `<details class="event-details"><summary>${mark}</summary><p>${escape(e.detail)}${e.device_time ? `<br>RTC: ${escape(e.device_time)} МСК` : ''}</p></details>`;
    const date = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(e.time));
    const clock = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(e.time));
    const today = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
    return `<tr class="${e.source === 'demo' ? 'event-test' : ''}"><td>${!recent || date !== today ? `<span class="event-date">${date}</span>` : ''}<span>${clock}</span></td><td>${escape(e.name || (e.uid ? 'Неизвестная карта' : '—'))}</td><td class="mono">${escape(e.uid || '—')}</td><td>${event}</td><td class="event-source">${{serial:'ESP32 / USB',network:'ESP32 / интернет',demo:'Тест на ПК',system:'Система'}[e.source] || escape(e.source)}</td></tr>`;
  }).join('');
  $(target).innerHTML = `<div class="table-wrap"><table class="event-table" aria-label="${recent ? 'Последние считывания' : 'Журнал событий'}"><thead><tr><th scope="col">Время, МСК ↓</th><th scope="col">Владелец</th><th scope="col">UID карты</th><th scope="col">Событие</th><th scope="col">Источник</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function eventQuery() { return new URLSearchParams({ search: $('events-search').value, source: $('events-source').value }).toString(); }
async function refreshEvents() {
  const revision = ++eventsRevision;
  const query = eventQuery();
  const [recent, all] = await Promise.all([api('/api/events?limit=4&kind=scan'), api(`/api/events?${query}`)]);
  if (revision !== eventsRevision) return;
  recentScans = recent;
  renderEvents(recent, 'recent-events', true); renderEvents(all, 'all-events');
  $('export').href = `/api/export?${query}`;
}
function renderState() {
  const d = state.device, s = state.stats;
  $('stat-cards').textContent = s.cards;
  $('stat-active').textContent = `Активных: ${s.active} / отключённых: ${s.cards - s.active}`; $('stat-scans').textContent = s.scans; $('stat-unknown').textContent = s.unknown;
  $('stat-unknown').classList.toggle('zero',s.unknown===0);
  $('cards-description').textContent = `${s.cards} ${plural(s.cards,['карта','карты','карт'])} / активных: ${s.active} / отключённых: ${s.cards-s.active}`;
  $('filter-all').textContent = s.cards; $('filter-active').textContent = s.active; $('filter-disabled').textContent = s.cards - s.active;
  const live = d.connected && d.fresh;
  const status = live ? 'На связи' : d.connected ? 'Нет свежих данных' : 'Нет соединения';
  for (const id of ['overview-status', 'device-page-status']) { $(id).textContent = status; $(id).className = `badge ${live ? 'good' : d.connected ? 'warning' : 'neutral'}`; }
  const reader = !live ? 'Нет свежих данных' : { ready: 'Готов к считыванию', error: 'Ошибка связи', unknown: 'Ожидание данных' }[d.reader];
  $('overview-reader').textContent = reader; $('device-reader').textContent = reader;
  $('overview-rtc').textContent = live && d.rtc ? d.rtc.slice(11) + ' МСК' : 'Нет свежих данных';
  $('device-rtc').textContent = live && d.rtc ? d.rtc + ' МСК' : 'Нет свежих данных';
  $('overview-port').textContent = d.connected ? `${d.path} / 115200` : 'Не подключён';
  $('mobile-controller-summary').textContent = live ? `${d.path} / PN532 ${d.reader === 'ready' ? 'готов' : 'ожидание'}` : 'Стенд не подключён';
  $('device-seen').textContent = time(d.lastSeen);
  $('device-wifi').textContent = live ? { connected: 'Подключён', disconnected: 'Отключён', unknown: 'Нет данных' }[d.wifi] : 'Нет свежих данных';
  $('device-servo').textContent = live ? { active: 'PWM отправлен', finished: 'Цикл завершён по логу', off: 'PWM выключен', unknown: 'Нет данных' }[d.servo] : 'Нет свежих данных';
  $('overview-servo').textContent = live ? `Серво: ${$('device-servo').textContent.toLocaleLowerCase('ru')} · положения двери нет` : 'Подключите стенд для получения состояния модулей.';
  $('overview-connect').hidden = live;
  $('device-description').textContent = d.connected ? `${d.path} / USB. Последнее сообщение: ${time(d.lastSeen)} МСК.` : 'Подключите ESP32 по USB для приёма считываний и управления.';
  $('command-help').textContent = live ? 'Команды доступны. Подтверждение выполнения проверяйте по сообщениям устройства.' : 'Подключите ESP32 и дождитесь свежих сообщений для отправки команд.';
  const last = recentScans[0];
  const card = last && state.cards.find(c=>c.uid===last.uid);
  $('last-scan-uid').textContent = last?.uid || '—'; $('last-scan-uid').classList.toggle('long-uid', (last?.uid.length || 0) > 14);
  $('last-scan-owner').textContent = last ? card?.name || last.name || 'Неизвестная карта' : 'Ожидание считывания';
  $('last-scan-time').textContent = last ? `${time(last.time)} МСК / ESP32 · USB` : 'Подключите ESP32 и поднесите карту к PN532.';
  $('last-card-status').textContent = !last ? 'Ждём карту' : !card ? 'Нет в реестре' : card.active ? 'Карта в реестре' : 'Карта отключена';
  $('register-last-card').hidden = !last || !!card;
  $('edit-last-card').hidden = !card;
  $('scan-state').textContent = !last ? 'Ожидание карты' : !card ? 'Не зарегистрирована' : card.active ? 'В реестре ПК' : 'Отключена в реестре';
  $('sidebar-server').textContent = 'Сервер доступен';
  document.body.classList.remove('server-down');
  $('overview-description').textContent = !d.connected ? 'Стенд не подключён. Реестр и история доступны на этом ПК.' : !live ? 'Соединение открыто. Ожидаем свежие сообщения от ESP32.' : !last ? 'Стенд на связи. Поднесите карту к считывателю.' : !card ? 'Стенд на связи. Последняя карта ещё не зарегистрирована.' : 'Стенд на связи. Последняя карта найдена в локальном реестре.';
  $('connect').disabled = d.connected || d.connecting;
  $('disconnect').disabled = !d.connected || d.connecting;
  $('port-select').disabled = d.connected || d.connecting;
  for (const id of ['cycle-servo', 'stop-servo', 'read-rtc']) $(id).disabled = !live;
  $('use-last-uid').disabled = !(d.lastUid || last?.uid);
  $('reader-help').textContent = d.lastUid || last?.uid ? `Последний UID: ${d.lastUid || last.uid}` : 'Считанных карт пока нет. Введите UID вручную или подключите стенд.';
  $('device-console').textContent = d.lines.length ? d.lines.map(l => `${time(l.time)}  ${l.text}`).join('\n') : 'Ожидание сообщений от устройства…';
  if(window.NFCCloud.enabled){
    $('overview-port').textContent=live?'Wi-Fi / HTTPS':'Нет связи с облаком';
    $('device-description').textContent=`${d.path} / интернет. Последнее сообщение: ${time(d.lastSeen)} МСК.`;
    $('overview-description').textContent=live?'ESP32 на связи через интернет. Реестр и журнал хранятся в облаке.':'ESP32 пока не на связи. Облачный реестр и история доступны.';
    $('sidebar-server').textContent='Облако доступно';
    $('overview-connect').textContent='Состояние подключения →';
    $('last-scan-time').textContent=last?`${time(last.time)} МСК / ${last.source==='network'?'интернет':'USB · история'}`:'Подключите ESP32 к сохранённой сети Wi-Fi.';
    $('scan-state').textContent=!last?'Ожидание карты':!card?'Нет в реестре':card.active?'Карта активна':'Карта отключена';
    $('command-help').textContent=live?'Команда передаётся при следующем обмене с ESP32, обычно в течение 30 секунд. Приём и состояние PWM проверяйте по журналу и статусу модулей.':'Команды доступны после получения свежих данных от ESP32.';
    $('overview-servo').textContent=live?`Список карт: ${d.cachedRevision===d.revision?'актуален':'ожидает синхронизации'}. Положение двери не измеряется.`:'Включите ESP32 и домашний Wi-Fi или точку доступа S25.';
    $('device-console').textContent=`Последний обмен: ${time(d.lastSeen)} МСК\nВерсия реестра в облаке: ${d.revision}\nВерсия на ESP32: ${d.cachedRevision??'нет данных'}\nСобытий в очереди ESP32: ${d.queueDepth}\nКоманд в очереди: ${d.pendingCommands}`;
    $('connect').disabled=$('disconnect').disabled=$('port-select').disabled=$('refresh-ports').disabled=true;
  }
  if (d.error) $('port-error').textContent = d.error;
  renderCards();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try { state = await api('/api/state'); await refreshEvents(); renderState(); $('server-error').hidden = true; }
  catch (error) {
    if(error.auth){$('server-error').hidden=true;return;}
    $('server-error').querySelector('p').textContent = window.NFCCloud.enabled && error.message && !/fetch|network|timeout/i.test(error.message) ? `Не удалось обновить данные: ${error.message}` : 'Связь с сервером потеряна. Данные могут быть устаревшими.';
    $('server-error').hidden = false;
    for (const id of ['cycle-servo', 'stop-servo', 'read-rtc', 'connect', 'disconnect']) $(id).disabled = true;
    for (const id of ['overview-status','device-page-status']) { $(id).textContent='Сервер недоступен'; $(id).className='badge warning'; }
    $('overview-description').textContent='Сервер недоступен. Ниже показаны последние полученные данные.';
    $('sidebar-server').textContent='Нет связи с сервером';
    document.body.classList.add('server-down');
  }
  finally { refreshing = false; $('main').setAttribute('aria-busy','false'); }
}
async function loadPorts() {
  const selected = $('port-select').value;
  try {
    const ports = await api('/api/ports');
    $('port-select').innerHTML = `<option value="">${ports.length ? 'Выберите порт' : 'Нет доступных портов'}</option>` + ports.map(p => `<option value="${escape(p.path)}">${escape(p.path)}${p.manufacturer ? ' · ' + escape(p.manufacturer) : ''}</option>`).join('');
    if (ports.some(p => p.path === selected)) $('port-select').value = selected;
    else if (ports.some(p => p.path === 'COM3')) $('port-select').value = 'COM3';
    else if (ports.length === 1) $('port-select').value = ports[0].path;
  } catch (e) { $('port-error').textContent = e.message; }
}
function openCard(card = null) {
  editing = card?.id || null;
  $('card-dialog-title').textContent = card ? 'Изменить карту' : 'Добавить карту';
  $('card-save').textContent = card ? 'Сохранить изменения' : 'Добавить карту';
  $('card-dialog-description').textContent = window.NFCCloud.enabled ? 'Изменения сохранятся в облаке. ESP32 получит их при следующей синхронизации.' : card ? 'Изменения записи в локальном реестре ПК.' : 'Новая запись в локальном реестре ПК.';
  $('card-name').value = card?.name || ''; $('card-uid').value = card?.uid || ''; $('card-note').value = card?.note || ''; $('card-active').checked = card ? !!card.active : true;
  $('card-form-error').textContent = ''; $('card-uid').removeAttribute('aria-invalid'); $('use-last-uid').disabled = !(state?.device.lastUid || recentScans[0]?.uid);
  $('delete-card').hidden = !card; $('delete-card').dataset.delete = card?.id || '';
  $('card-dialog').showModal();
}
function confirmAction(title, text, button) {
  $('confirm-title').textContent = title; $('confirm-text').textContent = text; $('confirm-ok').textContent = button;
  const dialog = $('confirm-dialog');
  dialog.returnValue = '';
  return new Promise(resolve => {
    const ok = () => dialog.close('ok');
    $('confirm-ok').addEventListener('click', ok);
    dialog.addEventListener('close', () => { $('confirm-ok').removeEventListener('click', ok); resolve(dialog.returnValue === 'ok'); }, { once: true });
    dialog.showModal();
  });
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.close) { $(button.dataset.close).close(); return; }
  if (button.dataset.action === 'add-card') { openCard(); return; }
  const id = Number(button.dataset.edit || button.dataset.toggle || button.dataset.delete);
  const card = state?.cards.find(c => c.id === id); if (!card) return;
  if (button.dataset.edit) { openCard(card); return; }
  try {
    if (button.dataset.toggle) { await api(`/api/cards/${id}`, 'PUT', { ...card, active: !card.active }); }
    if (button.dataset.delete) {
      if (!await confirmAction('Удалить карту?', `Карта «${card.name}» будет удалена из реестра. Ранее записанные события сохранятся.`, 'Удалить карту')) return;
      await api(`/api/cards/${id}`, 'DELETE'); if ($('card-dialog').open) $('card-dialog').close();
    }
    await refresh();
  } catch (e) { toast(e.message); }
});
$('card-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.submitter || $('card-save'); submit.disabled = true;
  const rawUid = $('card-uid').value.trim();
  if (!/^[0-9a-f\s:-]+$/i.test(rawUid) || ![8,14,20].includes(rawUid.replace(/[\s:-]/g,'').length)) {
    $('card-form-error').textContent = 'UID должен содержать 4, 7 или 10 байт шестнадцатеричных символов.';
    $('card-uid').setAttribute('aria-invalid','true'); $('card-uid').focus(); submit.disabled = false; return;
  }
  try {
    await api(editing ? `/api/cards/${editing}` : '/api/cards', editing ? 'PUT' : 'POST', { name: $('card-name').value, uid: $('card-uid').value, note: $('card-note').value, active: $('card-active').checked });
    $('card-dialog').close(); await refresh();
  } catch (e) { $('card-form-error').textContent = e.message; if (/UID/.test(e.message)) { $('card-uid').setAttribute('aria-invalid','true'); $('card-uid').focus(); } }
  finally { submit.disabled = false; }
});
$('use-last-uid').addEventListener('click', () => { const uid = state?.device.lastUid || recentScans[0]?.uid; if (uid) { $('card-uid').value = uid; $('card-uid').removeAttribute('aria-invalid'); $('card-form-error').textContent = ''; } });
$('register-last-card').addEventListener('click', () => { openCard(); $('card-uid').value = recentScans[0]?.uid || ''; });
$('edit-last-card').addEventListener('click',()=>{const card=state?.cards.find(c=>c.uid===recentScans[0]?.uid);if(card)openCard(card);});
$('card-uid').addEventListener('input', () => { $('card-uid').removeAttribute('aria-invalid'); $('card-form-error').textContent=''; });
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); $('main').focus(); });
document.querySelectorAll('[data-card-filter]').forEach(button => button.addEventListener('click', () => {
  cardFilter = button.dataset.cardFilter;
  document.querySelectorAll('[data-card-filter]').forEach(b=>{ b.classList.toggle('active', b===button); b.setAttribute('aria-pressed',String(b===button)); }); renderCards();
}));
$('retry-server').addEventListener('click', refresh);
$('cards-search').addEventListener('input', renderCards);
$('events-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => refreshEvents().catch(e => toast(e.message)), 250); });
$('events-source').addEventListener('change', () => refreshEvents().catch(e => toast(e.message)));
$('refresh-ports').addEventListener('click', loadPorts);
$('connect').addEventListener('click', async () => {
  if (!$('port-select').value) { $('port-error').textContent = 'Выберите порт и убедитесь, что плата подключена.'; return; }
  $('connect').disabled = true; $('port-error').textContent = '';
  try { await api('/api/device/connect', 'POST', { path: $('port-select').value }); toast('Порт открыт. Ожидаем данные от ESP32.'); }
  catch (e) { $('port-error').textContent = e.message; }
  await refresh();
});
$('disconnect').addEventListener('click', async () => { try { await api('/api/device/disconnect', 'POST'); toast('Порт освобождён.'); await refresh(); } catch (e) { toast(e.message); } });
for (const [id, command] of [['cycle-servo', 'cycle'], ['stop-servo', 'stop'], ['read-rtc', 'rtc']]) {
  $(id).addEventListener('click', async () => {
    if (command === 'cycle' && !await confirmAction('Запустить сервопривод?', 'ESP32 выполнит один цикл 1250 → 1750 → 1250 мкс. Убедитесь, что механизм может двигаться свободно.', 'Запустить цикл')) return;
    $(id).disabled = true;
    try { const result=await api('/api/device/command', 'POST', { command }); toast(result.queued?'Команда в очереди. ESP32 получит её при следующем обмене.':'Команда отправлена. Ответ появится в сообщениях устройства.'); }
    catch (e) { toast(e.message); }
    await refresh();
  });
}
$('demo-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('/api/demo', 'POST', { uid: $('demo-uid').value }); toast('Тест записан в журнал. Команда на ESP32 не отправлялась.'); await refresh(); }
  catch (e) { toast(e.message); } finally { button.disabled = false; }
});
function updateClock() { $('clock').textContent = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date()) + ' МСК'; $('journal-date').textContent = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'}).format(new Date()); }
window.addEventListener('hashchange', showPage);
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
  const route={1:'overview',2:'cards',3:'events',4:'device'}[event.key];if(route){event.preventDefault();location.hash=route;}
});
function showAuth(message=''){
  if($('auth-dialog').open)return;
  $('auth-email').value=window.NFCCloud.email;$('auth-password').value='';$('auth-error').textContent=message;$('auth-message').textContent='';$('auth-dialog').showModal();
}
window.addEventListener('nfc:authrequired',event=>showAuth(event.detail||''));
window.addEventListener('nfc:authenticated',()=>{$('auth-dialog').close();$('auth-password').value='';renderCache.clear();refresh();});
$('auth-dialog').addEventListener('cancel',event=>event.preventDefault());
async function submitAuth(register=false){
  if(!$('auth-form').reportValidity())return;
  $('auth-submit').disabled=$('auth-register').disabled=true;$('auth-error').textContent='';$('auth-message').textContent=register?'Создаём аккаунт…':'Входим…';
  try{if(register){await window.NFCCloud.signUp($('auth-email').value.trim(),$('auth-password').value);$('auth-message').textContent='Подтверди почту по письму Supabase, затем нажми «Войти». Доступ получит только администратор проекта.';}else await window.NFCCloud.signIn($('auth-email').value.trim(),$('auth-password').value);}
  catch(error){$('auth-error').textContent=error.message;$('auth-message').textContent='';}
  finally{$('auth-submit').disabled=$('auth-register').disabled=false;}
}
$('auth-form').addEventListener('submit',event=>{event.preventDefault();submitAuth();});
$('auth-register').addEventListener('click',()=>submitAuth(true));
$('export').addEventListener('click',async event=>{if(!window.NFCCloud.enabled)return;event.preventDefault();try{await window.NFCCloud.export(eventQuery());}catch(error){toast(error.message);}});
window.NFCCloud.ready.then(()=>{
  if(!window.NFCCloud.enabled)return;
  document.querySelector('.workspace>span:nth-child(2)').textContent='Облачный стенд';
  document.querySelector('.sidebar-bottom>p').textContent='Реестр и журнал в Supabase';
  document.querySelector('.session strong').textContent='Облачная сессия';
  const logout=document.createElement('button');logout.className='text-button';logout.textContent='Выйти';logout.addEventListener('click',()=>window.NFCCloud.signOut());document.querySelector('.session').append(logout);
  document.querySelector('#page-overview .notice p').textContent='ESP32 проверяет карты по сохранённому списку. При потере интернета события остаются в очереди устройства и отправляются после подключения.';
  document.querySelector('#page-cards .notice p').textContent='Изменения списка передаются ESP32 при следующем обмене. До этого устройство использует последнюю сохранённую версию.';
  document.querySelector('#page-overview .events-panel .small-note').textContent='Реальные события ESP32 / интернет и USB';
  document.querySelector('#page-cards .table-foot>span:last-child').textContent='Изменения сохраняются в облаке';
  document.querySelector('#page-events .section-heading>.small-note').textContent='Время сервера, МСК · время RTC хранится отдельно';
  document.querySelector('.app-footer>span').textContent='NFC Access · облачный реестр';
  document.querySelector('#page-device .device-grid>.panel:first-child').hidden=true;
  document.querySelector('#page-device .device-grid').style.gridTemplateColumns='1fr';
  document.querySelector('.console-panel h2').textContent='Обмен с облаком';document.querySelector('.console-panel .section-heading>.mono').textContent='HTTPS / до 30 секунд';
  document.querySelector('#card-dialog .check-field').lastChild.textContent='Активна в реестре';
  document.querySelector('#card-dialog .check-field + .small-note').textContent='Отключение вступит в силу на ESP32 после синхронизации списка.';
  const option=document.createElement('option');option.value='network';option.textContent='ESP32 · интернет';$('events-source').options[1].textContent='ESP32 · USB';$('events-source').append(option);
  refresh();
}).catch(error=>{$('server-error').hidden=false;$('server-error').querySelector('p').textContent=error.message;});
showPage(); updateClock(); refresh(); setInterval(()=>{if(!document.hidden)refresh();},5000); setInterval(updateClock,10000);
});

