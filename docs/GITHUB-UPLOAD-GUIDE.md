# Upload the Teaching Timetable Platform to GitHub

This guide keeps the complete source code in GitHub and makes the tested ZIP
available for other people to download.

## 1. Decide whether the repository is private or public

Use **Private** unless the timetable workbook has been approved for public
release. The workbook can contain staff names, teaching times, rooms, student
groups or email addresses.

- **Private:** only you and invited collaborators can see or download it.
- **Public:** anyone on the internet can see the source and workbook.

For a public repository, replace real information with sample data first.

## 2. Check the folder before uploading

The repository should include:

- `backend` and its Excel workbook;
- `frontend` and all dashboard files;
- `scripts` and all PowerShell files;
- `tests`;
- `.github\workflows\verify.yml`;
- `.gitignore`, `.gitattributes`, `README.md`, `LICENSE` and `CHANGELOG.md`;
- the server, Excel reader, `package.json` and `package-lock.json`.

Do not upload generated folders such as `node_modules`, `.runtime`, `logs` or
private backup workbooks. They are recreated locally and are excluded by
`.gitignore`.

## 3. Create the empty GitHub repository

1. Sign in at <https://github.com>.
2. Select **New repository**.
3. Use a clear name such as `teaching-timetable-platform`.
4. Add a short description, for example:

   `Excel-backed teaching timetable, workload and module journey dashboard.`

5. Choose **Private** or **Public** after considering the workbook data.
6. Do not add another README, `.gitignore` or licence because this package
   already contains them.
7. Select **Create repository**.

## 4. Upload with PowerShell and Git

Open PowerShell in the extracted project folder and check Git:

```powershell
git --version
git config --global user.name
git config --global user.email
```

If the name or email result is empty, set them once. You may use the private
no-reply email shown in your GitHub email settings instead of a personal email:

```powershell
git config --global user.name "Omar Aldoori"
git config --global user.email "YOUR-GITHUB-EMAIL-OR-NOREPLY-EMAIL"
```

If Git is available, run the following commands. Replace `YOUR-GITHUB-NAME`
with the account name and replace the repository name if you chose another
name.

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Release Teaching Timetable Platform v3.0.0"
git remote add origin https://github.com/YOUR-GITHUB-NAME/teaching-timetable-platform.git
git push -u origin main
git remote -v
```

GitHub may open a browser for sign-in. Use GitHub's sign-in process. Do not put
your GitHub password or personal access token inside a script or project file.

Before `git commit`, read the `git status` result. Confirm that `.runtime`,
`node_modules`, `logs` and backup workbooks are not listed.

### If Git is not installed

Use GitHub's browser upload:

1. Open the empty repository.
2. Select **uploading an existing file** or **Add file > Upload files**.
3. Drag the project files and folders onto the page.
4. Confirm that `backend`, `frontend`, `scripts`, `tests` and `.github` appear.
5. Enter `Release Teaching Timetable Platform v3.0.0` as the commit message.
6. Select **Commit changes**.

For later updates, GitHub Desktop is another practical option if your
organisation allows it.

## 5. Create the exact downloadable ZIP release

1. Open the repository on GitHub.
2. Select **Releases** and then **Draft a new release**.
3. Create the tag `v3.0.0`.
4. Use the title `Teaching Timetable Platform v3.0.0`.
5. Add a short note explaining that it is the tested Windows release.
6. Attach `Teaching-Timetable-Windows-v3.0.0.zip` as a release asset.
7. Select **Publish release**.

Users should download the attached ZIP, extract it and run:

```powershell
.\INSTALL-AND-START.bat
```

## 6. Check GitHub after upload

Confirm all of the following:

- The README appears on the repository home page.
- The `backend` folder contains `Teaching-Timetable-Data.xlsx`.
- The `frontend`, `scripts` and `tests` folders are present.
- The **Actions** page shows the Verify Platform workflow.
- The release page contains the exact tested ZIP.
- No `.runtime`, `node_modules`, logs or unintended backups were uploaded.
- No confidential staff, student or timetable data was published by mistake.

## 7. Update the repository later

After changing code or the workbook, test first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test.ps1
git add .
git status
git commit -m "Describe the timetable update"
git push
```

Create a new version tag and release ZIP when distributing a new tested
version. Do not silently replace an older release asset because users may need
to identify exactly which version they received.
