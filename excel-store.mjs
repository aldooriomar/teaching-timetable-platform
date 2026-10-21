import readExcelFile from 'read-excel-file/node';
import { stat } from 'node:fs/promises';

const REQUIRED_SHEETS = ['Sessions', 'Professors', 'Modules', 'Settings'];
const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

function text(value) {
  return value == null ? '' : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value) {
  if (typeof value === 'boolean') return value;
  return !['false', 'no', '0', 'inactive', 'hidden'].includes(text(value).toLowerCase());
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? raw : parsed.toISOString().slice(0, 10);
}

function timeText(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  const match = text(value).match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text(value);
}

function rowsFrom(sheetMap, name) {
  const data = sheetMap.get(name);
  if (!data) throw new Error(`The Excel workbook is missing the '${name}' worksheet.`);
  if (!data.length) return [];
  const headers = data[0].map(text);
  return data.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

export async function readDatabaseFromWorkbook(workbookFile) {
  const fileInfo = await stat(workbookFile);
  if (fileInfo.size > MAX_WORKBOOK_BYTES) {
    throw new Error('The Excel workbook is larger than the supported 20 MB limit.');
  }
  const workbook = await readExcelFile(workbookFile);
  const sheetMap = new Map(workbook.map(item => [item.sheet, item.data]));
  const sheetNames = [...sheetMap.keys()];
  const missing = REQUIRED_SHEETS.filter(name => !sheetMap.has(name));
  if (missing.length) throw new Error(`The Excel workbook is missing required worksheets: ${missing.join(', ')}.`);

  const settingRows = rowsFrom(sheetMap, 'Settings');
  const settingMap = Object.fromEntries(settingRows.map(row => [text(row.Setting), row.Value]));
  const settings = {
    institutionName: text(settingMap.institutionName) || 'School of Computing',
    timetableName: text(settingMap.timetableName) || 'Teaching Timetable',
    academicPeriod: text(settingMap.academicPeriod) || 'Academic period',
    termStartDate: dateText(settingMap.termStartDate),
    termWeeks: number(settingMap.termWeeks, 12),
    highDayHours: number(settingMap.highDayHours, 7),
    lastUpdated: fileInfo.mtime.toISOString()
  };

  const professors = rowsFrom(sheetMap, 'Professors').filter(row => text(row['Professor ID'])).map(row => ({
    id: text(row['Professor ID']),
    name: text(row.Name),
    shortName: text(row.Initials),
    email: text(row.Email),
    colour: text(row.Colour),
    active: boolean(row.Active)
  }));

  const modules = rowsFrom(sheetMap, 'Modules').filter(row => text(row['Module ID'])).map(row => ({
    id: text(row['Module ID']),
    code: text(row.Code),
    name: text(row.Name),
    active: boolean(row.Active)
  }));

  const sessions = rowsFrom(sheetMap, 'Sessions').filter(row => text(row['Session ID'])).map(row => ({
    id: text(row['Session ID']),
    professorId: text(row['Professor ID']),
    moduleId: text(row['Module ID']),
    weekday: number(row.Weekday),
    startTime: timeText(row['Start Time']),
    endTime: timeText(row['End Time']),
    activityType: text(row['Activity Type']),
    studentSet: text(row['Student Set']),
    location: text(row.Location),
    plannedSize: number(row['Planned Size']),
    weekStart: number(row['Week Start'], 1),
    weekEnd: number(row['Week End'], settings.termWeeks),
    notes: text(row.Notes)
  }));

  return {
    database: { settings, professors, modules, sessions },
    source: {
      fileName: workbookFile.split(/[\\/]/).at(-1),
      modifiedAt: fileInfo.mtime.toISOString(),
      sizeBytes: fileInfo.size,
      worksheets: sheetNames
    },
    mtimeMs: fileInfo.mtimeMs
  };
}
