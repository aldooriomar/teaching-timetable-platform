import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, copyFile, rm, rename, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readExcelFile from 'read-excel-file/node';
import { startServer } from '../server.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('Excel-backed timetable serves the platform and reloads the saved workbook', async t => {
  await Promise.all([
    'ABOUT.txt',
    'INSTALL-AND-START.bat',
    'scripts/Install-And-Start.ps1',
    'frontend/index.html',
    'backend/Teaching-Timetable-Data.xlsx'
  ].map(file => access(join(ROOT, file))));
  const temp = await mkdtemp(join(tmpdir(), 'teaching-timetable-'));
  const workbookFile = join(temp, 'Teaching-Timetable-Data.xlsx');
  await copyFile(join(ROOT, 'backend', 'Teaching-Timetable-Data.xlsx'), workbookFile);
  const workbook = await readExcelFile(workbookFile);
  assert.deepEqual(workbook.map(item => item.sheet), ['Sessions', 'Professors', 'Modules', 'Settings', 'Read Me']);
  assert.equal(workbook.find(item => item.sheet === 'Sessions').data.length, 100);
  const { server, port } = await startServer({ port: 0, host: '127.0.0.1', workbookFile });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-application-author'), 'Omar Al-Doori (BUV)');
  const homeText = await home.text();
  assert.match(homeText, /Teaching Timetable/);
  assert.match(homeText, /ABOUT: Omar Al-Doori \(BUV\) 2026/);

  const admin = await fetch(`${base}/admin`);
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /Excel Timetable Data/);

  const about = await (await fetch(`${base}/api/about`)).json();
  assert.equal(about.author, 'Omar Al-Doori (BUV)');
  assert.equal(about.year, 2026);
  assert.equal(about.version, '3.0.0');

  const healthResponse = await fetch(`${base}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.workbook, 'Teaching-Timetable-Data.xlsx');

  const bootstrapResponse = await fetch(`${base}/api/bootstrap`);
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrap.professors.length, 17);
  assert.equal(bootstrap.modules.length, 38);
  assert.equal(bootstrap.sessions.length, 99);
  assert.equal(bootstrap.summary.sessionTemplates, 99);
  assert.equal(bootstrap.summary.activeProfessors, 17);
  assert.equal(bootstrap.backend.fileName, 'Teaching-Timetable-Data.xlsx');
  assert.ok(bootstrap.occurrences.some(item => item.date === '2026-09-21' && item.professor.name === 'Chong Zeng'));
  assert.ok(bootstrap.occurrences.some(item => item.professor.name === 'Omar Al-Doori'));
  assert.ok(bootstrap.issues.some(item => item.type === 'Missing location'));

  const timeResponse = await fetch(`${base}/api/system-time`);
  const machineTime = await timeResponse.json();
  assert.ok(Math.abs(Date.now() - Date.parse(machineTime.serverTime)) < 2000);

  const blockedWrite = await fetch(`${base}/api/database`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(blockedWrite.status, 409);

  const originalModifiedAt = bootstrap.backend.modifiedAt;
  const newModifiedTime = new Date(Date.now() + 2_000);
  await utimes(workbookFile, newModifiedTime, newModifiedTime);
  const reload = await fetch(`${base}/api/reload`, { method: 'POST' });
  assert.equal(reload.status, 200);
  const refreshed = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(refreshed.settings.timetableName, bootstrap.settings.timetableName);
  assert.notEqual(refreshed.backend.modifiedAt, originalModifiedAt);

  const temporarilyMissing = `${workbookFile}.saving`;
  await rename(workbookFile, temporarilyMissing);
  const preserved = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(preserved.sessions.length, 99);
  assert.match(preserved.syncError, /no such file|cannot find/i);
  await rename(temporarilyMissing, workbookFile);
  const recovered = await (await fetch(`${base}/api/reload`, { method: 'POST' })).json();
  assert.equal(recovered.success, true);
});
