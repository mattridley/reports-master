# Reports Master

Reports Master is a local-first Tauri + React desktop app for drafting end-of-year teacher reports.

Documentation site: https://mattridley.github.io/reports-master/

## Features

- Manage classes by year group, subject, and class name.
- Manage classes with one or more subjects, supporting primary and secondary school structures.
- Manage students with pronouns and effort/attainment scores per subject.
- Import classes, students, and statements from CSV.
- Generate editable drafts from score-matched statement banks.
- Expand pronoun and grammar tokens such as `{they}`, `{their}`, `{is_are}`, and `{has_have}`.
- Optionally generate all reports with a teacher-provided OpenAI API key.
- Export final reports as CSV or printable one-page-per-student PDF output.

## Development

### Windows prerequisites

This project uses Tauri, Rust, and the default Windows MSVC Rust target. On Windows, `cargo check` and `npm run tauri dev` require Microsoft `link.exe`.

Install **Build Tools for Visual Studio** with the **Desktop development with C++** workload:

https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

After installing, reopen PowerShell or your editor terminal, then check:

```bash
npm run check:windows
npm run cargo:msvc
```

If `link.exe` is still missing, launch the app from "Developer PowerShell for VS 2022" once to confirm Visual Studio has added the C++ toolchain correctly.

### App commands

```bash
npm install
npm run dev
npm run tauri dev
```

## Releases

GitHub Actions builds Windows and macOS installers and publishes them to a GitHub Release.

To publish a release, update the app version in `package.json` and `src-tauri/tauri.conf.json`, then push a matching tag:

```bash
git tag app-v0.1.0
git push origin app-v0.1.0
```

You can also run the `Release desktop apps` workflow manually from the GitHub Actions tab.

## Documentation site

The GitHub Pages site lives in `docs/` and is published by the `Publish documentation site` workflow whenever docs change on `main`.

## CSV Templates

Classes:

```csv
year_group,subject,class_name
Year 7,English,7A
```

For a primary class with multiple subjects, use `subjects`:

```csv
year_group,subjects,class_name
Year 5,"English, Maths, Science",5R
```

Students:

```csv
class,subject,first_name,last_name,pronoun_set,effort_score,attainment_score
7A,English,Ava,Patel,she-her,1,Expected
```

Statements:

```csv
year_group,subject,score_type,score_label,statement_text
Year 7,English,effort,1,{name} {has_have} shown excellent effort.
Year 7,English,attainment,Expected,{they} {is_are} working securely at the expected level.
```
