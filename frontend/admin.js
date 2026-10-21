const state = { data: null, table: 'sessions' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function updateClock() {
  const now = new Date();
  $('#adminClock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#adminDate').textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(value) {
  if (!value) return 'Not configured';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, error ? 6000 : 3200);
}

function renderSummary() {
  const { data } = state;
  $('#workbookName').textContent = data.backend?.fileName || 'Teaching-Timetable-Data.xlsx';
  $('#connectionStatus').textContent = data.syncError ? 'Needs review' : 'Excel live';
  $('#connectionStatus').classList.toggle('status-error', Boolean(data.syncError));
  $('#modifiedAt').textContent = data.syncError
    ? data.syncError
    : data.backend?.modifiedAt
      ? `Saved ${new Date(data.backend.modifiedAt).toLocaleString('en-GB')}`
      : 'Connected';
  $('#professorCount').textContent = data.professors.filter(item => item.active).length;
  $('#moduleCount').textContent = data.modules.filter(item => item.active).length;
  $('#sessionCount').textContent = data.sessions.length;
  $('#academicPeriod').textContent = data.settings.academicPeriod;
  $('#termStartDate').textContent = formatDate(data.settings.termStartDate);
  $('#termWeeks').textContent = `${data.settings.termWeeks} weeks`;
  $('#highDayHours').textContent = `${data.settings.highDayHours} hours per day`;
  $('#browserZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'PC local time';
}

function tableData() {
  if (state.table === 'professors') {
    return {
      headers: ['Name', 'Initials', 'Email', 'Colour', 'Active'],
      rows: state.data.professors.map(item => [item.name, item.shortName, item.email || '—', item.colour, item.active ? 'Yes' : 'No'])
    };
  }
  if (state.table === 'modules') {
    return {
      headers: ['Code', 'Module', 'Active', 'Recurring sessions'],
      rows: state.data.modules.map(item => [item.code, item.name, item.active ? 'Yes' : 'No', state.data.sessions.filter(session => session.moduleId === item.id).length])
    };
  }
  const professorMap = new Map(state.data.professors.map(item => [item.id, item.name]));
  const moduleMap = new Map(state.data.modules.map(item => [item.id, `${item.code} · ${item.name}`]));
  const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return {
    headers: ['Day and time', 'Professor', 'Module and activity', 'Student group', 'Location', 'Weeks'],
    rows: state.data.sessions.map(item => [
      `${dayNames[item.weekday]} ${item.startTime}–${item.endTime}`,
      professorMap.get(item.professorId) || item.professorId,
      `${moduleMap.get(item.moduleId) || item.moduleId} · ${item.activityType}`,
      item.studentSet || '—',
      item.location || 'Location required',
      `W${item.weekStart}–W${item.weekEnd}`
    ])
  };
}

function renderTable() {
  const data = tableData();
  const query = $('#dataSearch').value.trim().toLowerCase();
  const rows = query ? data.rows.filter(row => row.join(' ').toLowerCase().includes(query)) : data.rows;
  $('#dataTable thead').innerHTML = `<tr>${data.headers.map(value => `<th>${escapeHtml(value)}</th>`).join('')}</tr>`;
  $('#dataTable tbody').innerHTML = rows.slice(0, 300).map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
}

async function loadData(force = false) {
  const button = $('#reloadWorkbook');
  button.disabled = true;
  button.textContent = force ? 'Reloading…' : 'Loading…';
  try {
    if (force) {
      const reload = await fetch('/api/reload', { method: 'POST' });
      const result = await reload.json();
      if (!reload.ok) throw new Error(result.error || 'Workbook reload failed.');
    }
    const response = await fetch('/api/database', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not read the Excel workbook.');
    state.data = await response.json();
    renderSummary();
    renderTable();
    if (force) toast('Excel workbook reloaded successfully.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Reload Excel now';
    $('#adminLoading').hidden = true;
  }
}

function bindEvents() {
  $('#reloadWorkbook').addEventListener('click', () => loadData(true));
  $('#dataSearch').addEventListener('input', renderTable);
  $$('.data-tab').forEach(button => button.addEventListener('click', () => {
    state.table = button.dataset.table;
    $$('.data-tab').forEach(item => item.classList.toggle('is-active', item === button));
    renderTable();
  }));
}

updateClock();
setInterval(updateClock, 1000);
bindEvents();
loadData();
const events = new EventSource('/api/events');
events.addEventListener('workbook', () => loadData());
