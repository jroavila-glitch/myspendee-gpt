# Changelog

This file tracks meaningful product, architecture, and operations changes for `Moneo`.

It should not include tiny style tweaks or trivial wording changes. It should include:

- New capabilities
- Bank/parser changes
- Data-model or migration changes
- Production incidents and fixes
- Infrastructure or deployment changes

## Unreleased

- Added `Tennis Rush` income classification for exact EUR 25 Millennium/Revolut income and amount-aware Clube VII/Unitenis expense classification

- Renamed the Vercel frontend project to `moneoapp`, deployed the Moneo identity, and retired the previous production alias

- Fixed deterministic ARQ parsing so transactions continued on later PDF pages are not dropped after first-page summaries

- Established project operating docs under `docs/`
- Added team-role definitions, roadmap, runbooks, and incident log

## 2026-06

- Completed the app identity migration to `Moneo` across code and UI
- Added deterministic ARQ handling for newer `Dólares digitales` USD statements
- Added global display-currency support in the UI
- Added canonical transaction rules documentation and regression tests
