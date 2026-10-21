import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readDatabaseFromWorkbook } from './excel-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(ROOT, 'frontend');
const DEFAULT_WORKBOOK_FILE = join(ROOT, 'backend', 'Teaching-Timetable-Data.xlsx');
const ABOUT = Object.freeze({
  title: 'Teaching Timetable Platform',
  author: 'Omar Al-Doori (BUV)',
  year: 2026,
  version: '3.0.0',
  copyright: 'Copyright 2026 Omar Al-Doori (BUV). All rights reserved.'
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function json(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Application-Author': ABOUT.author,
    ...extraHeaders
  });
  res.end(body);
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
}

function normaliseText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function normaliseId(value, fallbackPrefix) {
  const clean = String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return clean || `${fallbackPrefix}-${randomUUID().slice(0, 8)}`;
}

function validateAndNormaliseDatabase(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { errors: ['Database payload must be an object.'] };

  const rawSettings = input.settings || {};
  const settings = {
    institutionName: normaliseText(rawSettings.institutionName, 100) || 'School of Computing',
    timetableName: normaliseText(rawSettings.timetableName, 100) || 'Teaching Timetable',
    academicPeriod: normaliseText(rawSettings.academicPeriod, 100) || 'Academic period',
    termStartDate: normaliseText(rawSettings.termStartDate, 10),
    termWeeks: Number(rawSettings.termWeeks),
    highDayHours: Number(rawSettings.highDayHours),
    lastUpdated: new Date().toISOString()
  };

  if (!isDateString(settings.termStartDate)) errors.push('Teaching Week 1 start date must be a valid date.');
  if (!Number.isInteger(settings.termWeeks) || settings.termWeeks < 1 || settings.termWeeks > 60) {
    errors.push('Term weeks must be a whole number between 1 and 60.');
  }
  if (!Number.isFinite(settings.highDayHours) || settings.highDayHours < 1 || settings.highDayHours > 24) {
    errors.push('High teaching day threshold must be between 1 and 24 hours.');
  }

  const professorIds = new Set();
  const professors = Array.isArray(input.professors) ? input.professors.map((item, index) => {
    const id = normaliseId(item.id, 'professor');
    const professor = {
      id,
      name: normaliseText(item.name, 100),
      shortName: normaliseText(item.shortName, 8).toUpperCase(),
      email: normaliseText(item.email, 160),
      colour: /^#[0-9a-fA-F]{6}$/.test(item.colour || '') ? item.colour : '#2563eb',
      active: item.active !== false
    };
    if (!professor.name) errors.push(`Professor ${index + 1} needs a name.`);
    if (!professor.shortName) errors.push(`Professor ${index + 1} needs initials.`);
    if (professorIds.has(id)) errors.push(`Duplicate professor ID: ${id}.`);
    professorIds.add(id);
    return professor;
  }) : [];

  const moduleIds = new Set();
  const modules = Array.isArray(input.modules) ? input.modules.map((item, index) => {
    const id = normaliseId(item.id, 'module');
    const module = {
      id,
      code: normaliseText(item.code, 20).toUpperCase(),
      name: normaliseText(item.name, 160),
      active: item.active !== false
    };
    if (!module.code) errors.push(`Module ${index + 1} needs a code.`);
    if (!module.name) errors.push(`Module ${index + 1} needs a name.`);
    if (moduleIds.has(id)) errors.push(`Duplicate module ID: ${id}.`);
    moduleIds.add(id);
    return module;
  }) : [];

  const sessionIds = new Set();
  const sessions = Array.isArray(input.sessions) ? input.sessions.map((item, index) => {
    const id = normaliseId(item.id, 'session');
    const session = {
      id,
      professorId: normaliseText(item.professorId, 80),
      moduleId: normaliseText(item.moduleId, 80),
      weekday: Number(item.weekday),
      startTime: normaliseText(item.startTime, 5),
      endTime: normaliseText(item.endTime, 5),
      activityType: normaliseText(item.activityType, 40),
      studentSet: normaliseText(item.studentSet, 120),
      location: normaliseText(item.location, 200),
      plannedSize: Number(item.plannedSize),
      weekStart: Number(item.weekStart),
      weekEnd: Number(item.weekEnd),
      notes: normaliseText(item.notes, 500)
    };
    const label = `Session ${index + 1}`;
    if (sessionIds.has(id)) errors.push(`Duplicate session ID: ${id}.`);
    sessionIds.add(id);
    if (!professorIds.has(session.professorId)) errors.push(`${label} references an unknown professor.`);
    if (!moduleIds.has(session.moduleId)) errors.push(`${label} references an unknown module.`);
    if (!Number.isInteger(session.weekday) || session.weekday < 1 || session.weekday > 7) errors.push(`${label} has an invalid weekday.`);
    if (!isTimeString(session.startTime) || !isTimeString(session.endTime) || session.startTime >= session.endTime) {
      errors.push(`${label} must have valid start and end times.`);
    }
    if (!session.activityType) errors.push(`${label} needs an activity type.`);
    if (!Number.isFinite(session.plannedSize) || session.plannedSize < 0) errors.push(`${label} has an invalid planned size.`);
    if (!Number.isInteger(session.weekStart) || !Number.isInteger(session.weekEnd) || session.weekStart < 1 || session.weekEnd < session.weekStart || session.weekEnd > settings.termWeeks) {
      errors.push(`${label} has teaching weeks outside the configured term.`);
    }
    return session;
  }) : [];

  if (!professors.length) errors.push('At least one professor is required.');
  if (!modules.length) errors.push('At least one module is required.');

  return { errors, database: { settings, professors, modules, sessions } };
}

function addUtcDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function localDateText(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function groupsFrom(value) {
  return normaliseText(value, 500).split(',').map(item => item.trim()).filter(Boolean);
}

function buildOccurrences(database, from, to) {
  const professorMap = new Map(database.professors.map(item => [item.id, item]));
  const moduleMap = new Map(database.modules.map(item => [item.id, item]));
  const occurrences = [];
  for (const session of database.sessions) {
    const professor = professorMap.get(session.professorId);
    const module = moduleMap.get(session.moduleId);
    if (!professor || !module || professor.active === false || module.active === false) continue;
    for (let week = session.weekStart; week <= session.weekEnd; week += 1) {
      const date = addUtcDays(database.settings.termStartDate, ((week - 1) * 7) + (session.weekday - 1));
      if ((from && date < from) || (to && date > to)) continue;
      occurrences.push({
        occurrenceId: `${session.id}-${date}`,
        sessionId: session.id,
        date,
        teachingWeek: week,
        startTime: session.startTime,
        endTime: session.endTime,
        durationHours: (timeToMinutes(session.endTime) - timeToMinutes(session.startTime)) / 60,
        activityType: session.activityType,
        studentSet: session.studentSet,
        location: session.location,
        plannedSize: session.plannedSize,
        notes: session.notes,
        professor,
        module
      });
    }
  }
  return occurrences.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function overlaps(a, b) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

function buildIssues(database, occurrences) {
  const issues = [];
  const termStart = new Date(`${database.settings.termStartDate}T00:00:00Z`);
  if (termStart.getUTCDay() !== 1) {
    issues.push({ severity: 'warning', type: 'Term date', message: 'Teaching Week 1 does not start on a Monday.' });
  }

  for (const occurrence of occurrences) {
    if (!occurrence.location) {
      issues.push({
        severity: 'warning',
        type: 'Missing location',
        date: occurrence.date,
        occurrenceId: occurrence.occurrenceId,
        message: `${occurrence.module.code} has no allocated location.`
      });
    }
  }

  for (let i = 0; i < occurrences.length; i += 1) {
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const a = occurrences[i];
      const b = occurrences[j];
      if (a.date !== b.date) break;
      if (!overlaps(a, b)) continue;
      if (a.professor.id === b.professor.id) {
        issues.push({
          severity: 'critical',
          type: 'Staff clash',
          date: a.date,
          message: `${a.professor.name} is allocated to overlapping sessions at ${a.startTime}.`
        });
      }
      if (a.location && a.location.toLowerCase() === b.location.toLowerCase()) {
        issues.push({
          severity: 'critical',
          type: 'Room clash',
          date: a.date,
          message: `${a.location} is allocated to overlapping sessions.`
        });
      }
      const groupClash = groupsFrom(a.studentSet).find(group => groupsFrom(b.studentSet).includes(group));
      if (groupClash) {
        issues.push({
          severity: 'critical',
          type: 'Student group clash',
          date: a.date,
          message: `${groupClash} is allocated to overlapping sessions.`
        });
      }
    }
  }

  const daily = new Map();
  for (const occurrence of occurrences) {
    const key = `${occurrence.date}|${occurrence.professor.id}`;
    const current = daily.get(key) || { hours: 0, occurrence };
    current.hours += occurrence.durationHours;
    daily.set(key, current);
  }
  for (const { hours, occurrence } of daily.values()) {
    if (hours > database.settings.highDayHours) {
      issues.push({
        severity: 'warning',
        type: 'High teaching day',
        date: occurrence.date,
        message: `${occurrence.professor.name} has ${hours.toFixed(1)} teaching hours.`
      });
    }
  }
  return issues.sort((a, b) => `${a.severity === 'critical' ? '0' : '1'}${a.date || ''}${a.type}`.localeCompare(`${b.severity === 'critical' ? '0' : '1'}${b.date || ''}${b.type}`));
}

function buildSummary(database, occurrences, issues) {
  const today = localDateText();
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const termStart = new Date(`${database.settings.termStartDate}T00:00:00Z`);
  const todayUtc = new Date(`${today}T00:00:00Z`);
  const currentTeachingWeek = Math.floor((todayUtc - termStart) / 604800000) + 1;
  const nextSession = occurrences.find(item => item.date > today || (item.date === today && item.endTime > nowTime)) || null;
  const totalHours = occurrences.reduce((sum, item) => sum + item.durationHours, 0);
  return {
    today,
    currentTeachingWeek,
    termState: currentTeachingWeek < 1 ? 'Not started' : currentTeachingWeek > database.settings.termWeeks ? 'Completed' : 'In progress',
    sessionTemplates: database.sessions.length,
    scheduledSessions: occurrences.length,
    teachingHours: Number(totalHours.toFixed(1)),
    activeProfessors: database.professors.filter(item => item.active).length,
    activeModules: database.modules.filter(item => item.active).length,
    studentGroups: new Set(occurrences.flatMap(item => groupsFrom(item.studentSet))).size,
    plannedSeats: occurrences.reduce((sum, item) => sum + item.plannedSize, 0),
    issueCount: issues.length,
    criticalIssueCount: issues.filter(item => item.severity === 'critical').length,
    nextSession
  };
}

async function serveStatic(pathname, res) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative === 'admin' || relative === 'admin/') relative = 'admin.html';
  const filePath = resolve(FRONTEND_ROOT, relative);
  if (!filePath.startsWith(`${resolve(FRONTEND_ROOT)}${sep}`)) {
    json(res, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Application-Author': ABOUT.author,
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') json(res, 404, { error: 'Not found.' });
    else throw error;
  }
}

export async function startServer({ port = Number(process.env.PORT || 4310), host = process.env.HOST || '127.0.0.1', workbookFile = process.env.WORKBOOK_FILE || DEFAULT_WORKBOOK_FILE } = {}) {
  if (!existsSync(workbookFile)) throw new Error(`Excel backend not found: ${workbookFile}`);
  const loadedWorkbook = await readDatabaseFromWorkbook(workbookFile);
  const initial = validateAndNormaliseDatabase(loadedWorkbook.database);
  if (initial.errors.length) throw new Error(`Database validation failed:\n${initial.errors.join('\n')}`);
  let database = initial.database;
  let workbookSource = loadedWorkbook.source;
  let workbookMtimeMs = loadedWorkbook.mtimeMs;
  let syncError = null;
  const eventClients = new Set();

  function broadcast(event, value) {
    const message = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    for (const client of eventClients) client.write(message);
  }

  async function refreshWorkbook(force = false) {
    const previousError = syncError;
    try {
      const current = await stat(workbookFile);
      if (!force && current.mtimeMs === workbookMtimeMs) return false;
      const refreshed = await readDatabaseFromWorkbook(workbookFile);
      const checked = validateAndNormaliseDatabase(refreshed.database);
      if (checked.errors.length) throw new Error(checked.errors.join(' '));
      database = checked.database;
      workbookSource = refreshed.source;
      workbookMtimeMs = refreshed.mtimeMs;
      syncError = null;
      return true;
    } catch (error) {
      syncError = error.message || 'The Excel workbook could not be reloaded.';
      return previousError !== syncError;
    }
  }

  const watchTimer = setInterval(async () => {
    const changed = await refreshWorkbook();
    if (changed) broadcast('workbook', { modifiedAt: workbookSource.modifiedAt, syncError });
  }, 2000);

  const server = createHttpServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === '/api/system-time' && req.method === 'GET') {
        return json(res, 200, {
          serverTime: new Date().toISOString(),
          localTime: new Date().toString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
      }

      if (pathname === '/api/about' && req.method === 'GET') {
        return json(res, 200, ABOUT);
      }

      if (pathname === '/api/health' && req.method === 'GET') {
        await refreshWorkbook();
        return json(res, syncError ? 503 : 200, {
          status: syncError ? 'degraded' : 'ok',
          version: ABOUT.version,
          workbook: workbookSource.fileName,
          modifiedAt: workbookSource.modifiedAt,
          syncError,
          serverTime: new Date().toISOString()
        });
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ modifiedAt: workbookSource.modifiedAt, syncError })}\n\n`);
        eventClients.add(res);
        req.on('close', () => eventClients.delete(res));
        return;
      }

      if (pathname === '/api/database' && req.method === 'GET') {
        await refreshWorkbook();
        return json(res, 200, { ...database, backend: workbookSource, syncError });
      }

      if (pathname === '/api/database' && req.method === 'PUT') {
        return json(res, 409, { error: 'The Excel workbook is the single source of truth. Edit backend/Teaching-Timetable-Data.xlsx, save it, then reload the workbook.' });
      }

      if (pathname === '/api/export' && req.method === 'GET') {
        const body = `${JSON.stringify(database, null, 2)}\n`;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="teaching-timetable-${new Date().toISOString().slice(0, 10)}.json"`,
          'Content-Length': Buffer.byteLength(body),
          'Cache-Control': 'no-store'
        });
        return res.end(body);
      }

      if (pathname === '/api/backend-workbook' && req.method === 'GET') {
        const body = await readFile(workbookFile);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${workbookSource.fileName}"`,
          'Content-Length': body.length,
          'Cache-Control': 'no-store'
        });
        return res.end(body);
      }

      if (pathname === '/api/reload' && req.method === 'POST') {
        const changed = await refreshWorkbook(true);
        if (syncError) return json(res, 400, { error: syncError });
        if (changed) broadcast('workbook', { modifiedAt: workbookSource.modifiedAt, syncError });
        return json(res, 200, { success: true, backend: workbookSource, settings: database.settings });
      }

      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        await refreshWorkbook();
        const occurrences = buildOccurrences(database);
        const issues = buildIssues(database, occurrences);
        return json(res, 200, {
          ...database,
          occurrences,
          issues,
          summary: buildSummary(database, occurrences, issues),
          backend: workbookSource,
          syncError,
          system: {
            serverTime: new Date().toISOString(),
            serverLocalTime: new Date().toString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            about: ABOUT
          }
        });
      }

      if (pathname === '/api/occurrences' && req.method === 'GET') {
        await refreshWorkbook();
        const from = requestUrl.searchParams.get('from') || '';
        const to = requestUrl.searchParams.get('to') || '';
        if ((from && !isDateString(from)) || (to && !isDateString(to))) return json(res, 400, { error: 'Use YYYY-MM-DD for date filters.' });
        const occurrences = buildOccurrences(database, from, to);
        return json(res, 200, { occurrences, issues: buildIssues(database, occurrences) });
      }

      if (pathname.startsWith('/api/')) return json(res, 404, { error: 'API route not found.' });
      return await serveStatic(pathname, res);
    } catch (error) {
      console.error(error);
      return json(res, error.message?.includes('Request') ? 400 : 500, { error: error.message || 'Unexpected server error.' });
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });
  server.once('close', () => {
    clearInterval(watchTimer);
    for (const client of eventClients) client.end();
    eventClients.clear();
  });
  const address = server.address();
  return { server, port: typeof address === 'object' ? address.port : port, host };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const started = await startServer();
  console.log(`Teaching Timetable is running at http://${started.host}:${started.port}`);
  const shutdown = () => started.server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
