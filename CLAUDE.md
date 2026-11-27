@AGENTS.md

# Hinweise für Claude (zusätzlich zu AGENTS.md)

## Projekt
Angular-19-Web-App (plus optionale Electron-Hülle) zum Lesen und Schreiben von
CANopen-XDD-Dateien (CiA 311). Neuimplementierung der Oberfläche von
CANopenEditor (protronic/CANopenEditor, .NET). Import/Export anderer Formate läuft
über das CLI-Tool EDSSharp aus jenem Repo.

- Quellcode: `src/app/` (XDD-Codec und Modell unter `src/app/xdd/` bzw. `src/app/model/`)
- Electron: `electron/`, siehe `ELECTRON.md`
- Pläne/Entscheidungen: `docs/`

## Befehle
- Abhängigkeiten: `npm install` (es gibt kein Lockfile; `package-lock.json` ist ignoriert)
- Tests: `npm test` (Vitest)
- Build: `npm run build`

Einige Specs lesen Referenzdateien über `../Tests/` und `../EDSEditorGUI/Profiles/`
aus dem .NET-Repo. Im GitHub-Actions-Workflow werden diese per Symlink bereitgestellt.

Bekannt (Stand Einrichtung): `src/app/xdd/xdd-codec.spec.ts` und
`src/app/xdd/profiles.spec.ts` schlagen mit `DOMParser is not defined` fehl, weil
Vitest ohne jsdom-Umgebung läuft. Das ist ein bestehender Fehler, nicht durch deine
Änderung verursacht — außer das Issue betrifft genau das.

## Arbeiten über GitHub (@claude in Issues/PRs)
- Antworte in Issues und PRs auf Deutsch.
- Nie direkt auf `main` pushen. Änderungen nur auf dem eigenen `claude/...`-Branch;
  der Pull Request ist die Übergabe an einen Menschen, der im Browser testet und
  dann merged (das erfüllt AGENTS.md Regel 6 im CI-Kontext).
- Ist eine Anforderung unklar (AGENTS.md Regel 4), stelle die Rückfrage als Kommentar
  im Issue, statt zu raten.
- Vor dem Push: `npm test` und `npm run build` ausführen und das Ergebnis im
  Kommentar nennen. Im PR-Text kurz beschreiben, was im Browser zu prüfen ist.
- Commit-Messages im Stil des Repos: kurzer Präfix plus deutsche Beschreibung,
  z. B. `Fix: ...`, `Feature: ...`, `Docs: ...`.
- Keine neuen Abhängigkeiten und keine Änderungen an Konfigurationsdateien
  (`package.json`, `angular.json`, `tsconfig*.json`, `electron-builder.yml`,
  Workflows), außer das Issue verlangt es ausdrücklich.
