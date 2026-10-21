const state = {
  data: null,
  view: 'overview',
  anchorDate: new Date(),
  filters: { professorId: '', moduleId: '', activityType: '', studentSet: '' }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function localDateFromIso(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoFromLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date) {
  const day = date.getDay() || 7;
  return addDays(date, 1 - day);
}

function monthRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: startOfWeek(first), end: addDays(startOfWeek(last), 6) };
}

function periodRange() {
  if (state.view === 'day') {
    const start = new Date(state.anchorDate.getFullYear(), state.anchorDate.getMonth(), state.anchorDate.getDate());
    return { start, end: start };
  }
  if (state.view === 'week' || state.view === 'overview') {
    const start = startOfWeek(state.anchorDate);
    return { start, end: addDays(start, 6) };
  }
  return monthRange(state.anchorDate);
}

function studentGroups(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

function formatIso(value, options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  return formatDate(localDateFromIso(value), options);
}

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, hour, minute));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function groupBy(items, keySelector) {
  const groups = new Map();
  for (const item of items) {
    const key = keySelector(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function matchesFilters(item) {
    if (state.filters.professorId && item.professor.id !== state.filters.professorId) return false;
    if (state.filters.moduleId && item.module.id !== state.filters.moduleId) return false;
    if (state.filters.activityType && item.activityType !== state.filters.activityType) return false;
    if (state.filters.studentSet && !studentGroups(item.studentSet).includes(state.filters.studentSet)) return false;
    return true;
}

function filteredOccurrences({ fullTerm = false } = {}) {
  const filtered = state.data.occurrences.filter(matchesFilters);
  if (fullTerm) return filtered;
  const { start, end } = periodRange();
  const from = isoFromLocalDate(start);
  const to = isoFromLocalDate(end);
  return filtered.filter(item => item.date >= from && item.date <= to);
}

function filteredIssues(occurrences, { fullTerm = false } = {}) {
  const { start, end } = periodRange();
  const from = isoFromLocalDate(start);
  const to = isoFromLocalDate(end);
  const occurrenceIds = new Set(occurrences.map(item => item.occurrenceId));
  return state.data.issues.filter(issue => {
    if (!fullTerm && issue.date && (issue.date < from || issue.date > to)) return false;
    if (issue.occurrenceId && !occurrenceIds.has(issue.occurrenceId)) return false;
    if (state.filters.professorId && issue.message && !issue.message.includes(state.data.professors.find(p => p.id === state.filters.professorId)?.name || '')) {
      if (!issue.occurrenceId) return false;
    }
    return true;
  });
}

function updateClock() {
  const now = new Date();
  $('#liveDay').textContent = formatDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#liveTime').textContent = formatDate(now, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#liveZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
}

function populateFilters() {
  const professorSelect = $('#professorFilter');
  const moduleSelect = $('#moduleFilter');
  const activitySelect = $('#activityFilter');
  const studentSelect = $('#studentFilter');
  professorSelect.innerHTML = '<option value="">All professors</option>' + state.data.professors
    .filter(item => item.active)
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  moduleSelect.innerHTML = '<option value="">All modules</option>' + state.data.modules
    .filter(item => item.active)
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join('');
  const activities = [...new Set(state.data.sessions.map(item => item.activityType))].sort();
  activitySelect.innerHTML = '<option value="">All activities</option>' + activities
    .map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  const groups = [...new Set(state.data.sessions.flatMap(item => studentGroups(item.studentSet)))].sort();
  studentSelect.innerHTML = '<option value="">All student groups</option>' + groups
    .map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  $('#staffLegend').innerHTML = state.data.professors.filter(item => item.active).map(item => `
    <span class="legend-item"><span class="legend-dot" style="--dot:${item.colour}"></span>${escapeHtml(item.shortName)} · ${escapeHtml(item.name)}</span>
  `).join('');
  professorSelect.value = state.filters.professorId;
  moduleSelect.value = state.filters.moduleId;
  activitySelect.value = state.filters.activityType;
  studentSelect.value = state.filters.studentSet;
}

function updateSourceState() {
  const source = $('#sourceState');
  source.classList.toggle('has-error', Boolean(state.data.syncError));
  const modified = state.data.backend?.modifiedAt ? new Date(state.data.backend.modifiedAt) : null;
  $('#sourceUpdated').textContent = state.data.syncError
    ? 'Workbook needs review'
    : modified
      ? `Saved ${modified.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : 'Workbook connected';
  source.title = state.data.syncError || `${state.data.backend?.fileName || 'Excel workbook'} · automatic refresh`;
}

function updatePeriodHeading() {
  if (state.view === 'overview') {
    $('#periodTitle').textContent = 'Leadership overview';
  } else if (state.view === 'day') {
    $('#periodTitle').textContent = formatDate(state.anchorDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } else if (state.view === 'week') {
    const start = startOfWeek(state.anchorDate);
    const end = addDays(start, 6);
    $('#periodTitle').textContent = `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else if (state.view === 'month' || state.view === 'issues') {
    $('#periodTitle').textContent = formatDate(state.anchorDate, { month: 'long', year: 'numeric' });
  } else if (state.view === 'staff') {
    $('#periodTitle').textContent = 'Professor workload';
  } else {
    $('#periodTitle').textContent = 'Module journey';
  }
  const termStart = localDateFromIso(state.data.settings.termStartDate);
  const diff = Math.floor((startOfWeek(state.anchorDate) - termStart) / 86400000);
  const week = Math.floor(diff / 7) + 1;
  const fullTermView = state.view === 'staff' || state.view === 'modules';
  $('#periodSubtitle').textContent = fullTermView
    ? `${state.data.settings.academicPeriod} · ${state.data.settings.termWeeks} teaching weeks`
    : week >= 1 && week <= state.data.settings.termWeeks
    ? `${state.data.settings.academicPeriod} · Teaching Week ${week}`
    : `${state.data.settings.academicPeriod} · Outside teaching weeks`;
}

function renderOverview(occurrences, issues) {
  const now = new Date();
  const today = isoFromLocalDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const current = occurrences.find(item => item.date === today && item.startTime <= nowTime && item.endTime > nowTime);
  const next = occurrences.find(item => item.date > today || (item.date === today && item.startTime > nowTime));
  const start = startOfWeek(state.anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const dayLoads = days.map(day => {
    const iso = isoFromLocalDate(day);
    const items = occurrences.filter(item => item.date === iso);
    return { day, items, hours: items.reduce((sum, item) => sum + item.durationHours, 0) };
  });
  const maxDayHours = Math.max(1, ...dayLoads.map(item => item.hours));
  const staffLoads = state.data.professors.filter(item => item.active).map(professor => {
    const items = occurrences.filter(item => item.professor.id === professor.id);
    return { professor, sessions: items.length, hours: items.reduce((sum, item) => sum + item.durationHours, 0), modules: new Set(items.map(item => item.module.id)).size };
  }).filter(item => item.sessions).sort((a, b) => b.hours - a.hours || a.professor.name.localeCompare(b.professor.name));
  const focusCard = (label, item, empty) => item ? `
    <article class="focus-card" style="--staff-colour:${item.professor.colour}">
      <span>${label}</span><strong>${escapeHtml(item.module.code)} · ${escapeHtml(item.module.name)}</strong>
      <small>${escapeHtml(formatIso(item.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${escapeHtml(formatTime(item.startTime))}–${escapeHtml(formatTime(item.endTime))}</small>
      <small>${escapeHtml(item.professor.name)} · ${escapeHtml(item.location || 'Location required')}</small>
    </article>` : `<article class="focus-card is-empty"><span>${label}</span><strong>${escapeHtml(empty)}</strong><small>No action is required for this card.</small></article>`;
  $('#calendarContent').innerHTML = `
    <div class="overview-grid">
      <section class="overview-focus">
        ${focusCard('Running now', current, 'No session is running now')}
        ${focusCard('Next session', next, 'No later session in this week')}
      </section>
      <section class="overview-panel load-panel">
        <div class="panel-title"><div><span>Current week</span><h3>Teaching load by day</h3></div><button type="button" class="text-button" data-go-view="week">Open timetable</button></div>
        <div class="day-loads">${dayLoads.map(item => `<div class="day-load${isoFromLocalDate(item.day) === today ? ' is-today' : ''}"><span>${formatDate(item.day, { weekday: 'short' })}</span><div><i style="height:${Math.max(3, (item.hours / maxDayHours) * 100)}%"></i></div><strong>${item.hours.toFixed(1)} h</strong><small>${item.items.length} sessions</small></div>`).join('')}</div>
      </section>
      <section class="overview-panel staff-load-panel">
        <div class="panel-title"><div><span>People</span><h3>Professor workload this week</h3></div><button type="button" class="text-button" data-go-view="staff">Full journey</button></div>
        <div class="load-table"><div class="load-row load-head"><span>Professor</span><span>Sessions</span><span>Hours</span><span>Modules</span></div>${staffLoads.slice(0, 10).map(item => `<div class="load-row"><span><i style="--dot:${item.professor.colour}"></i>${escapeHtml(item.professor.name)}</span><strong>${item.sessions}</strong><strong>${item.hours.toFixed(1)}</strong><strong>${item.modules}</strong></div>`).join('')}</div>
      </section>
      <section class="overview-panel attention-panel">
        <div class="panel-title"><div><span>Control</span><h3>Issues requiring review</h3></div><button type="button" class="text-button" data-go-view="issues">Review all</button></div>
        ${issues.length ? `<div class="attention-list">${issues.slice(0, 6).map(issue => `<div class="attention-item ${issue.severity === 'critical' ? 'critical' : ''}"><span>${escapeHtml(issue.type)}</span><strong>${escapeHtml(issue.message)}</strong><small>${issue.date ? escapeHtml(formatIso(issue.date, { day: 'numeric', month: 'short' })) : 'Term setting'}</small></div>`).join('')}</div>` : emptyState('No issues in this week', 'The automated timetable checks passed for this view.')}
      </section>
    </div>`;
}

function updateKpis(occurrences, issues) {
  $('#kpiSessions').textContent = occurrences.length;
  const hours = occurrences.reduce((sum, item) => sum + item.durationHours, 0);
  $('#kpiHours').textContent = Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
  $('#kpiProfessors').textContent = new Set(occurrences.map(item => item.professor.id)).size;
  $('#kpiModules').textContent = new Set(occurrences.map(item => item.module.id)).size;
  $('#kpiGroups').textContent = new Set(occurrences.flatMap(item => studentGroups(item.studentSet))).size;
  $('#kpiIssues').textContent = issues.length;
  $('#issueBadge').textContent = issues.length;
}

function eventCard(item) {
  return `
    <button class="event-card" type="button" data-occurrence-id="${escapeHtml(item.occurrenceId)}" style="--staff-colour:${item.professor.colour}" aria-label="${escapeHtml(item.module.name)}, ${escapeHtml(item.professor.name)}, ${escapeHtml(formatTime(item.startTime))}">
      <span class="event-top"><span>${escapeHtml(formatTime(item.startTime))}–${escapeHtml(formatTime(item.endTime))}</span><span class="activity-pill">${escapeHtml(item.activityType.slice(0, 3))}</span></span>
      <span class="event-main">${escapeHtml(item.professor.shortName)} · ${escapeHtml(item.module.code)}</span>
      <span class="event-meta">${escapeHtml(item.studentSet || 'Group required')}</span>
    </button>`;
}

function renderDay(occurrences) {
  if (!occurrences.length) {
    $('#calendarContent').innerHTML = emptyState('No teaching sessions on this day', 'Choose another date or clear the filters.');
    return;
  }
  const sorted = [...occurrences].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.professor.name.localeCompare(b.professor.name));
  $('#calendarContent').innerHTML = `<div class="day-agenda">${sorted.map(item => `
    <button class="agenda-row" type="button" data-occurrence-id="${escapeHtml(item.occurrenceId)}" style="--staff-colour:${item.professor.colour}">
      <span class="agenda-time"><strong>${escapeHtml(formatTime(item.startTime))}</strong><small>${escapeHtml(formatTime(item.endTime))}</small></span>
      <span class="agenda-line"></span>
      <span class="agenda-main"><strong>${escapeHtml(item.module.code)} · ${escapeHtml(item.module.name)}</strong><small>${escapeHtml(item.activityType)} · ${escapeHtml(item.professor.name)}</small></span>
      <span class="agenda-context"><strong>${escapeHtml(item.studentSet || 'Student group required')}</strong><small>${escapeHtml(item.location || 'Location required')}</small></span>
      <span class="agenda-hours">${item.durationHours} h</span>
    </button>`).join('')}</div>`;
}

function renderMonth(occurrences) {
  const { start, end } = monthRange(state.anchorDate);
  const grouped = groupBy(occurrences, item => item.date);
  const days = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const iso = isoFromLocalDate(date);
    const events = grouped.get(iso) || [];
    const visibleEvents = events.slice(0, 5);
    const hiddenCount = events.length - visibleEvents.length;
    const outside = date.getMonth() !== state.anchorDate.getMonth();
    const today = iso === isoFromLocalDate(new Date());
    days.push(`
      <div class="month-day${outside ? ' is-outside' : ''}${today ? ' is-today' : ''}">
        <div class="day-head">
          <span class="day-number">${date.getDate()}</span>
          ${events.length ? `<span class="day-count">${events.length} session${events.length === 1 ? '' : 's'}</span>` : ''}
        </div>
        <div class="events">${visibleEvents.map(eventCard).join('')}${hiddenCount > 0 ? `<button class="day-more" type="button" data-open-day="${iso}">+${hiddenCount} more · open day</button>` : ''}</div>
      </div>`);
  }
  $('#calendarContent').innerHTML = `
    <div class="calendar-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => `<div class="weekday-name">${day}</div>`).join('')}</div>
    <div class="month-grid">${days.join('')}</div>`;
}

function renderWeek(occurrences) {
  const start = startOfWeek(state.anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const groups = groupBy(occurrences, item => `${item.date}|${Number(item.startTime.slice(0, 2))}`);
  let content = '<div class="week-scroll"><div class="week-layout"><div class="week-corner"></div>';
  for (const day of days) {
    const today = isoFromLocalDate(day) === isoFromLocalDate(new Date());
    content += `<div class="week-head${today ? ' is-today' : ''}"><strong>${formatDate(day, { weekday: 'short' })}</strong><span>${formatDate(day, { day: 'numeric', month: 'short' })}</span></div>`;
  }
  for (let hour = 8; hour <= 18; hour += 1) {
    content += `<div class="time-label">${String(hour).padStart(2, '0')}:00</div>`;
    for (const day of days) {
      const iso = isoFromLocalDate(day);
      const events = groups.get(`${iso}|${hour}`) || [];
      content += `<div class="week-cell${iso === isoFromLocalDate(new Date()) ? ' is-today' : ''}">${events.map(eventCard).join('')}</div>`;
    }
  }
  content += '</div></div>';
  $('#calendarContent').innerHTML = content;
}

function renderStaff(occurrences) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const now = new Date();
  const today = isoFromLocalDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isComplete = item => item.date < today || (item.date === today && item.endTime <= nowTime);
  const selected = state.filters.professorId
    ? state.data.professors.filter(item => item.id === state.filters.professorId)
    : state.data.professors.filter(item => item.active);
  const cards = selected.map(professor => {
    const items = occurrences.filter(item => item.professor.id === professor.id);
    const hours = items.reduce((sum, item) => sum + item.durationHours, 0);
    const completed = items.filter(isComplete).length;
    const progress = items.length ? Math.round((completed / items.length) * 100) : 0;
    const groups = new Set(items.flatMap(item => studentGroups(item.studentSet)));
    const next = items.find(item => !isComplete(item));
    const activities = [...new Set(items.map(item => item.activityType))];
    const byDay = weekdays.map((label, index) => ({
      label,
      hours: items.filter(item => localDateFromIso(item.date).getDay() === (index + 1) % 7).reduce((sum, item) => sum + item.durationHours, 0)
    }));
    const max = Math.max(1, ...byDay.map(item => item.hours));
    return `
      <article class="staff-card" style="--staff-colour:${professor.colour}">
        <div class="staff-card-head">
          <div><h3>${escapeHtml(professor.name)}</h3><p class="muted">${professor.email ? escapeHtml(professor.email) : 'Contact not yet added'}</p></div>
          <div class="staff-initials">${escapeHtml(professor.shortName)}</div>
        </div>
        <div class="metric-row metric-row-4">
          <div><strong>${items.length}</strong><span>Sessions</span></div>
          <div><strong>${Number.isInteger(hours) ? hours : hours.toFixed(1)}</strong><span>Hours</span></div>
          <div><strong>${new Set(items.map(item => item.module.id)).size}</strong><span>Modules</span></div>
          <div><strong>${groups.size}</strong><span>Groups</span></div>
        </div>
        <div class="progress-block"><span><strong>${progress}%</strong> of scheduled sessions completed</span><div class="progress-track"><div style="width:${progress}%"></div></div></div>
        <div class="chip-row">${activities.map(activity => `<span>${escapeHtml(activity)}</span>`).join('')}</div>
        <div class="bar-list">${byDay.slice(0, 5).map(item => `
          <div class="bar-row"><span>${item.label}</span><div class="bar-track"><div class="bar-fill" style="width:${(item.hours / max) * 100}%"></div></div><strong>${item.hours}</strong></div>
        `).join('')}</div>
        <div class="next-session"><span>Next session</span><strong>${next ? `${formatIso(next.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatTime(next.startTime)} · ${next.module.code}` : items.length ? 'Teaching completed' : 'No sessions scheduled'}</strong></div>
      </article>`;
  }).join('');
  $('#calendarContent').innerHTML = cards ? `<div class="staff-grid">${cards}</div>` : emptyState('No staff match the filters', 'Clear the filters to see all teaching staff.');
}

function renderModules(occurrences) {
  const now = new Date();
  const today = isoFromLocalDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isComplete = item => item.date < today || (item.date === today && item.endTime <= nowTime);
  const termStart = localDateFromIso(state.data.settings.termStartDate);
  const currentWeek = Math.floor((startOfWeek(now) - termStart) / 604800000) + 1;
  const journeyNow = currentWeek < 1 ? 'Term not started' : currentWeek > state.data.settings.termWeeks ? 'Term completed' : `Teaching Week ${currentWeek}`;
  const selectedModules = state.filters.moduleId
    ? state.data.modules.filter(item => item.id === state.filters.moduleId)
    : state.data.modules.filter(item => item.active);
  const cards = selectedModules.map(module => {
    const items = occurrences.filter(item => item.module.id === module.id);
    if (!items.length) return '';
    const hours = items.reduce((sum, item) => sum + item.durationHours, 0);
    const completed = items.filter(isComplete).length;
    const progress = items.length ? Math.round((completed / items.length) * 100) : 0;
    const staff = [...new Set(items.map(item => item.professor.name))];
    const groups = [...new Set(items.flatMap(item => studentGroups(item.studentSet)))];
    const activeWeeks = new Set(items.map(item => item.teachingWeek));
    const activities = [...new Set(items.map(item => item.activityType))];
    const weeklyHours = activeWeeks.size ? hours / activeWeeks.size : 0;
    const status = progress === 100 ? 'Completed' : completed > 0 ? 'In progress' : 'Upcoming';
    const timeline = Array.from({ length: state.data.settings.termWeeks }, (_, index) => {
      const week = index + 1;
      const active = activeWeeks.has(week);
      const classNames = ['journey-week'];
      if (active) classNames.push('is-active');
      if (week < currentWeek) classNames.push('is-complete');
      if (week === currentWeek) classNames.push('is-current');
      return `<span class="${classNames.join(' ')}" title="Teaching Week ${week}${active ? ' · scheduled' : ''}">${week}</span>`;
    }).join('');
    return `
      <article class="module-card">
        <div class="module-card-head">
          <div><span class="module-code">${escapeHtml(module.code)}</span><h3>${escapeHtml(module.name)}</h3></div>
          <span class="journey-status ${status.toLowerCase().replace(' ', '-')}">${status}</span>
        </div>
        <div class="module-metrics">
          <div><strong>${items.length}</strong><span>Sessions</span></div>
          <div><strong>${Number.isInteger(hours) ? hours : hours.toFixed(1)} h</strong><span>Total hours</span></div>
          <div><strong>${weeklyHours.toFixed(1)} h</strong><span>Weekly average</span></div>
          <div><strong>${groups.length}</strong><span>Student groups</span></div>
        </div>
        <div class="progress-block"><span><strong>${progress}%</strong> completed</span><div class="progress-track"><div style="width:${progress}%"></div></div></div>
        <div class="module-detail"><span>Professor${staff.length === 1 ? '' : 's'}</span><strong>${escapeHtml(staff.join(', '))}</strong></div>
        <div class="module-detail"><span>Delivery</span><strong>${escapeHtml(activities.join(' · '))}</strong></div>
        <div class="journey-label"><span>Teaching journey</span><small>${journeyNow}</small></div>
        <div class="journey-timeline">${timeline}</div>
      </article>`;
  }).filter(Boolean).join('');
  $('#calendarContent').innerHTML = cards ? `<div class="module-grid">${cards}</div>` : emptyState('No modules match the filters', 'Clear the filters to see the complete module journey.');
}

function renderIssues(issues) {
  if (!issues.length) {
    $('#calendarContent').innerHTML = emptyState('No issues in this period', 'The current timetable passes the automated checks for this view.');
    return;
  }
  $('#calendarContent').innerHTML = `<div class="issue-list">${issues.map(issue => `
    <article class="issue-item ${issue.severity === 'critical' ? 'critical' : ''}">
      <span class="issue-type">${escapeHtml(issue.type)}</span>
      <span>${escapeHtml(issue.message)}</span>
      <span class="issue-date">${issue.date ? escapeHtml(formatIso(issue.date, { day: 'numeric', month: 'short', year: 'numeric' })) : 'Term setting'}</span>
    </article>`).join('')}</div>`;
}

function emptyState(title, body) {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div></div>`;
}

function render() {
  updatePeriodHeading();
  const fullTerm = state.view === 'staff' || state.view === 'modules';
  const occurrences = filteredOccurrences({ fullTerm });
  const issues = filteredIssues(occurrences, { fullTerm });
  updateKpis(occurrences, issues);
  if (state.view === 'overview') renderOverview(occurrences, issues);
  if (state.view === 'day') renderDay(occurrences);
  if (state.view === 'month') renderMonth(occurrences);
  if (state.view === 'week') renderWeek(occurrences);
  if (state.view === 'staff') renderStaff(occurrences);
  if (state.view === 'modules') renderModules(occurrences);
  if (state.view === 'issues') renderIssues(issues);
  $$('.view-button').forEach(button => button.classList.toggle('is-active', button.dataset.view === state.view));
  const lockedPeriod = state.view === 'staff' || state.view === 'modules';
  $('#previousPeriod').disabled = lockedPeriod;
  $('#nextPeriod').disabled = lockedPeriod;
  $('#todayButton').disabled = lockedPeriod;
}

function openDrawer(item) {
  $('#drawerTitle').textContent = item.module.name;
  $('#drawerBody').innerHTML = `
    <div class="detail-accent" style="--staff-colour:${item.professor.colour}"></div>
    <div class="detail-grid">
      <div class="detail-field wide"><span>Professor</span><strong>${escapeHtml(item.professor.name)}</strong></div>
      <div class="detail-field"><span>Date</span><strong>${escapeHtml(formatIso(item.date))}</strong></div>
      <div class="detail-field"><span>Teaching week</span><strong>Week ${item.teachingWeek}</strong></div>
      <div class="detail-field"><span>Time</span><strong>${escapeHtml(formatTime(item.startTime))}–${escapeHtml(formatTime(item.endTime))}</strong></div>
      <div class="detail-field"><span>Activity</span><strong>${escapeHtml(item.activityType)}</strong></div>
      <div class="detail-field wide"><span>Student set</span><strong>${escapeHtml(item.studentSet || 'Not provided')}</strong></div>
      <div class="detail-field wide"><span>Location</span><strong>${escapeHtml(item.location || 'Location required')}</strong></div>
      <div class="detail-field"><span>Planned students</span><strong>${item.plannedSize}</strong></div>
      <div class="detail-field"><span>Duration</span><strong>${item.durationHours} hour${item.durationHours === 1 ? '' : 's'}</strong></div>
      ${item.notes ? `<div class="detail-field wide"><span>Notes</span><strong>${escapeHtml(item.notes)}</strong></div>` : ''}
    </div>`;
  $('#drawerBackdrop').hidden = false;
  $('#detailDrawer').classList.add('is-open');
  $('#detailDrawer').setAttribute('aria-hidden', 'false');
  $('#closeDrawer').focus();
}

function closeDrawer() {
  $('#drawerBackdrop').hidden = true;
  $('#detailDrawer').classList.remove('is-open');
  $('#detailDrawer').setAttribute('aria-hidden', 'true');
}

function bindEvents() {
  $('#previousPeriod').addEventListener('click', () => {
    if (state.view === 'day') state.anchorDate = addDays(state.anchorDate, -1);
    else if (state.view === 'week' || state.view === 'overview') state.anchorDate = addDays(state.anchorDate, -7);
    else state.anchorDate = new Date(state.anchorDate.getFullYear(), state.anchorDate.getMonth() - 1, 1);
    render();
  });
  $('#nextPeriod').addEventListener('click', () => {
    if (state.view === 'day') state.anchorDate = addDays(state.anchorDate, 1);
    else if (state.view === 'week' || state.view === 'overview') state.anchorDate = addDays(state.anchorDate, 7);
    else state.anchorDate = new Date(state.anchorDate.getFullYear(), state.anchorDate.getMonth() + 1, 1);
    render();
  });
  $('#todayButton').addEventListener('click', () => { state.anchorDate = new Date(); render(); });
  $$('.view-button').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; render(); }));
  [['#professorFilter', 'professorId'], ['#moduleFilter', 'moduleId'], ['#activityFilter', 'activityType'], ['#studentFilter', 'studentSet']].forEach(([selector, key]) => {
    $(selector).addEventListener('change', event => { state.filters[key] = event.target.value; render(); });
  });
  $('#clearFilters').addEventListener('click', () => {
    state.filters = { professorId: '', moduleId: '', activityType: '', studentSet: '' };
    $('#professorFilter').value = '';
    $('#moduleFilter').value = '';
    $('#activityFilter').value = '';
    $('#studentFilter').value = '';
    render();
  });
  $('#calendarContent').addEventListener('click', event => {
    const viewButton = event.target.closest('[data-go-view]');
    if (viewButton) {
      state.view = viewButton.dataset.goView;
      render();
      return;
    }
    const openDay = event.target.closest('[data-open-day]');
    if (openDay) {
      state.anchorDate = localDateFromIso(openDay.dataset.openDay);
      state.view = 'day';
      render();
      return;
    }
    const card = event.target.closest('[data-occurrence-id]');
    if (!card) return;
    const item = state.data.occurrences.find(occurrence => occurrence.occurrenceId === card.dataset.occurrenceId);
    if (item) openDrawer(item);
  });
  $('#closeDrawer').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
}

let refreshInProgress = false;

async function refreshData(forceRender = false) {
  if (refreshInProgress || document.hidden) return;
  refreshInProgress = true;
  try {
    const latestResponse = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (!latestResponse.ok) throw new Error('The timetable service could not be refreshed.');
    const latest = await latestResponse.json();
    const changed = forceRender || latest.backend?.modifiedAt !== state.data?.backend?.modifiedAt || latest.syncError !== state.data?.syncError;
    state.data = latest;
    updateSourceState();
    if (changed) {
      populateFilters();
      render();
      sourcePulse();
    }
  } catch {
    $('#sourceUpdated').textContent = 'Waiting for server…';
  } finally {
    refreshInProgress = false;
  }
}

async function init() {
  updateClock();
  setInterval(updateClock, 1000);
  try {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (!response.ok) throw new Error('The timetable service could not be loaded.');
    state.data = await response.json();
    $('#institutionName').textContent = state.data.settings.institutionName;
    $('#timetableName').textContent = state.data.settings.timetableName;
    document.title = `${state.data.settings.timetableName} · ${state.data.settings.academicPeriod}`;
    updateSourceState();
    populateFilters();
    bindEvents();
    render();
    const events = new EventSource('/api/events');
    events.addEventListener('workbook', () => refreshData(true));
    events.onerror = () => { $('#sourceUpdated').textContent = 'Reconnecting…'; };
    setInterval(() => refreshData(false), 15000);
  } catch (error) {
    $('#calendarContent').innerHTML = emptyState('Unable to load the timetable', error.message);
  } finally {
    $('#loadingState').hidden = true;
  }
}

function sourcePulse() {
  const source = $('#sourceState');
  source.classList.remove('is-updated');
  requestAnimationFrame(() => source.classList.add('is-updated'));
  setTimeout(() => source.classList.remove('is-updated'), 1800);
}

init();
