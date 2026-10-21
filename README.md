# Teaching Timetable Platform

**ABOUT: Omar Al-Doori (BUV) 2026**  
Version 3.0.0

This is a simple local timetable dashboard for Windows. It helps a Programme
Leader or lecturer see who is teaching, what they are teaching, when it starts
and finishes, where it happens, and how much teaching is planned.

The platform runs on one computer. It does not need a cloud database.

## The simple idea

The Excel workbook is the **backend**. It holds the timetable data.

The web dashboard is the **frontend**. It reads the workbook and presents the
same data as calendars, totals, progress views and warnings.

```text
Excel workbook -> local server -> browser dashboard
```

The live workbook is:

```text
backend\Teaching-Timetable-Data.xlsx
```

When the workbook is saved, the dashboard normally updates within a few
seconds. There is no need to type the same information into the browser.

### Important data rule

Whatever is written in the backend workbook is what the frontend uses.

If the Excel data is correct, the dashboard should be correct. If the Excel
data is wrong, missing or inconsistent, the dashboard can also show a wrong
result.

**Short example:** If a class is entered as 9:00 am to 12:00 pm, the dashboard
shows three hours. If the end time is accidentally entered as 10:00 pm, the
dashboard may show thirteen hours and a workload warning.

## What the dashboard provides

- A live overview of today's teaching and the next session.
- Day, week and month timetable views.
- Start time, end time, activity, room, professor and student group.
- Individual professor workload and teaching journey.
- Individual module journey across the teaching weeks.
- Total sessions, teaching hours, modules, groups and planned student places.
- Filters for professor, module, activity and student group.
- The computer's current date, time, timezone and teaching week.
- An Issues view for checking timetable problems.

## What the Issues tab means

The Issues tab is a checking tool. An issue means the system found something
that should be reviewed. It does not always mean the timetable is definitely
wrong.

| Issue | Simple meaning | Common reason |
|---|---|---|
| Staff clash | One professor appears in two sessions at the same time. | Duplicate session, wrong professor, date or time. |
| Room clash | Two sessions use the same room at the same time. | Wrong room, copied row or overlapping booking. |
| Student-group clash | The same student group appears in two sessions at the same time. | Wrong group, duplicate row or overlapping session. |
| Missing location | A session has no room or location. | The room was not entered or is not confirmed yet. |
| High teaching day | A professor has more hours than the warning limit for one day. | A long teaching day, duplicate session or wrong end time. |
| Date or term issue | A session or teaching week falls outside the configured term. | Wrong Week 1 date, term length or teaching-week value. |

**Short example:** If Professor A is entered in Room 201 and Room 305 from
9:00 am to 11:00 am on the same day, the system reports a staff clash. Check
the Excel rows and correct the wrong one.

## Windows installation

Requirements:

- Windows 10 or Windows 11.
- Windows PowerShell 5.1 or newer.
- Internet access during the first setup.
- Microsoft Excel or another compatible `.xlsx` editor for changing data.

Installation:

1. Download the release ZIP.
2. Right-click the ZIP and select **Extract All**.
3. Open the extracted folder.
4. If it is in OneDrive, select **Always keep on this device**.
5. Double-click `INSTALL-AND-START.bat`.

Or run this from PowerShell inside the extracted folder:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\INSTALL-AND-START.bat
```

The batch file checks the package, prepares a portable Node.js runtime when
needed, installs the locked dependency, tests the system, starts it and opens
the browser. The portable runtime stays inside the application folder and does
not require administrator rights or change the computer-wide PATH.

## Open the platform

- Dashboard: <http://127.0.0.1:4310>
- Excel control page: <http://127.0.0.1:4310/admin>
- Health check: <http://127.0.0.1:4310/api/health>

The service listens only on `127.0.0.1`, so it is available on the local
computer and is not published to the internet.

## Change the timetable data

1. Open `backend\Teaching-Timetable-Data.xlsx`.
2. Edit the yellow input cells.
3. Keep the worksheet names and column headings unchanged.
4. Save the workbook.
5. Return to the dashboard. The saved change should appear automatically.

Main workbook sheets:

- `Sessions`: professor, module, day, times, activity, group, room, class size
  and teaching weeks.
- `Professors`: professor details, initials and display colour.
- `Modules`: module code, name and active status.
- `Settings`: academic period, Week 1 date, term length and workload warning.
- `Read Me`: workbook instructions.

Before a large change, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Backup.ps1
```

## Useful commands

```powershell
# Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start.ps1

# Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test.ps1

# Open the workbook
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Edit-Data.ps1

# Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Stop.ps1
```

## Folder map

```text
Teaching-Timetable-Windows\
|-- INSTALL-AND-START.bat       One-file setup and start
|-- backend\
|   |-- Teaching-Timetable-Data.xlsx
|   `-- backups\
|-- frontend\                  Dashboard pages and styling
|-- scripts\                   Windows setup and support scripts
|-- tests\                     Automated system test
|-- server.mjs                 Local web service and issue checks
|-- excel-store.mjs            Excel reader
|-- package.json               Application information
`-- package-lock.json          Locked dependency versions
```

## GitHub download and releases

The safest way to distribute a tested version is a GitHub Release. Attach the
tested `Teaching-Timetable-Windows-v3.0.0.zip` file to the release. A user can
then download that exact ZIP from the repository's **Releases** page.

GitHub's **Code > Download ZIP** option also downloads the source files, but a
release asset is clearer because it preserves the exact tested package.

See [docs/GITHUB-UPLOAD-GUIDE.md](docs/GITHUB-UPLOAD-GUIDE.md) for the complete
upload procedure.

## Privacy before making the repository public

The included workbook may contain professor names, emails, rooms, groups and
timetable details. Review it before using a public GitHub repository. Use a
private repository unless BUV has approved public release of the data. For a
public demonstration, replace real records with safe sample data.

Do not commit `.runtime`, `node_modules`, logs, temporary Excel files or backup
workbooks. The included `.gitignore` excludes them.

## Data and date check

Teaching Week 1 is currently configured as Monday, 21 September 2026. Change
the `Settings` sheet when using the platform for another academic period.

## Licence

Copyright (c) 2026 Omar Al-Doori (BUV).

The source code is provided under the MIT Licence. See [LICENSE](LICENSE).
