<div align="center">

# Finora

**Your money, clearly managed.**

A local-first personal finance app for Android and the web — accounts, payroll, loans,
budgets, bills, documents and insights in one calm, offline workspace.

![Version](https://img.shields.io/badge/version-1.3.0-0f766e?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Android%20%C2%B7%20Web-0f766e?style=flat-square)
![React](https://img.shields.io/badge/React-18.3-149eca?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646cff?style=flat-square&logo=vite&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-8-119eff?style=flat-square&logo=capacitor&logoColor=white)
![Tests](https://img.shields.io/badge/unit%20tests-35%20passing-2ea043?style=flat-square)
![License](https://img.shields.io/badge/license-not%20specified-6b7280?style=flat-square)

[Overview](#-overview) · [Features](#-features) · [Screens](#-screens) · [Architecture](#-architecture) · [Data model](#-data-model--money-math) · [Privacy](#-privacy--security) · [Getting started](#-getting-started) · [Android](#-android-build) · [Testing](#-testing) · [History](#-version-history)

</div>

---

## ✦ Overview

Finora is a single-user finance workspace with **no backend and no account system**. Every
record — accounts, transactions, payroll periods, loan schedules, uploaded documents — lives
in an IndexedDB document on the device, and the whole app runs offline. The interface follows
mobile conventions (bottom tabs, sheets, hardware Back, edge-swipe) and ships as a Capacitor
Android application plus an installable PWA.

The design goal is *clarity over cleverness*: money is never stored as a floating point
number, every generated record is traceable to the module that created it, and anything that
can corrupt a balance is guarded in the store rather than in the UI.

| Property         | Value                                                             |
| :--------------- | :---------------------------------------------------------------- |
| Application ID   | `com.finora.app`                                                  |
| Version          | `1.3.0` (version code `7`)                                        |
| Runtime          | React 18 · TypeScript 5.6 · Vite 5.4 · Capacitor 8                |
| Persistence      | IndexedDB (`finora-db` → `kv` → `state`), single atomic document   |
| Network          | None required — no API calls, no telemetry, no remote accounts    |
| Android target   | `minSdk 24` · `targetSdk 36` · `compileSdk 36`                    |
| Test suites      | 35 Vitest unit tests · 1 Playwright end-to-end specification       |

---

## ✦ Features

| Area                  | What it does                                                                                                              |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **Accounts**          | Bank, cash, wallet, credit card and "other" accounts with holder, branch, card, credit-limit and reference details.        |
| **Transactions**      | Income, expense and transfer entries with categories, merchants, notes and attachments. Automatic balance reconciliation.   |
| **Payroll**           | Multiple jobs with monthly, fixed-weekly, allocation and contract salary types; overtime, bonuses, leave, tax and advances. |
| **Payroll deduction** | A salary record can repay a loan; the deduction posts the correct EMI principal/interest split idempotently.                |
| **Loans**             | Bank, personal, vehicle, home, business, education, gold-pawn and friend loans with full amortisation schedules.            |
| **Loan actions**      | Pay an EMI partially, extra-pay principal or interest, or settle the entire outstanding schedule and close the loan.        |
| **Budgets**           | Monthly, weekly or custom spending limits across categories, with rollover and threshold alerts.                            |
| **Savings goals**     | Targets with dated contributions, progress rings and per-goal account routing.                                              |
| **Investments**       | Holdings with quantity, cost basis, current value and supporting documents.                                                 |
| **Bills**             | Recurring and one-off obligations with per-bill reminder lead times and a payment history keyed by due date.                |
| **Calendar**          | One month view combining salary dates, EMI due dates, bills and reminders.                                                  |
| **Reminders**         | Bill, card, loan, subscription, insurance, rent, savings and custom alerts with in-app or device notifications.             |
| **Vault**             | Documents stored as real bytes with categories, favourites and typed links back to the records they belong to.              |
| **PDF viewer**        | In-app `pdfjs-dist` rendering so statements and agreements never leave the app.                                             |
| **Insights**          | Cash-flow series, category breakdowns, spending trends and budget burn-down charts.                                         |
| **Reports**           | Period statements, registers and summaries with CSV export and a print-friendly layout.                                     |
| **Net worth**         | Assets against liabilities, split by currency and by account.                                                               |
| **Bank messages**     | On-device SMS parsing that drafts transactions for review — nothing is saved until you confirm it.                           |
| **Backup & restore**  | ZIP archives with a manifest, per-file SHA-256 checksums and a verified, non-destructive restore preview.                    |
| **App lock**          | Optional lock with PIN/biometric unlock, idle timeout, and lock-on-background behaviour.                                     |
| **Home widget**       | Native Android widget showing net worth and the next obligation, refreshed from the store.                                  |

---

## ✦ Screens

Five primary tabs, with everything else reachable from **More**.

| Tab        | Icon      | Routes                                                                                      |
| :--------- | :-------- | :------------------------------------------------------------------------------------------ |
| **Home**   | `home`    | Dashboard sections, quick actions FAB, notifications, search                                |
| **Money**  | `wallet`  | Accounts, account detail/editor, transaction form/detail, full history                      |
| **Salary** | `briefcase` | Jobs, salary record per period, payments, payroll-loan deductions                          |
| **Loans**  | `landmark`| Loan list by category, loan detail, EMI schedule, payment sheet                             |
| **More**   | `grid`    | Vault, budgets, savings, investments, bills, calendar, reminders, insights, reports, net worth, bank messages, notifications, settings, profile, permissions, backup, help |

Secondary screens: **Onboarding** (three skippable first-run steps), **Search** (accounts,
transactions and documents in one result set), **App lock** overlay and **Splash**.

Navigation is a purpose-built hash-aware router in `src/lib/hooks.ts` rather than a routing
library: `navigate()`, `goBack()` and `useRoute()` keep URLs shareable on the web while giving
Android a single, predictable Back stack.

---

## ✦ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI          src/screens/* · src/components/*                           │
│              React 18 function components, sheets, charts, toasts        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  useApp() · actions.*
┌───────────────────────────────▼─────────────────────────────────────────┐
│  STATE       src/lib/store.ts                                           │
│              One AppState document · debounced 250 ms saves · migrations │
└──────┬────────────────┬────────────────┬─────────────────┬──────────────┘
       │                │                │                 │
┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼───────────┐
│ calc.ts     │  │ storage.ts  │  │ backup.ts   │  │ native bridges    │
│ pure finance│  │ IndexedDB   │  │ ZIP+SHA-256 │  │ Capacitor + JS    │
│ engine      │  │ persistence │  │ verify      │  │ interfaces        │
└─────────────┘  └─────────────┘  └─────────────┘  └───────┬───────────┘
                                                           │
                                       ┌───────────────────▼───────────┐
                                       │ android/ (Kotlin-free Java)   │
                                       │ SMS · notifications · widget  │
                                       │ biometrics · insets · Back     │
                                       └───────────────────────────────┘
```

**Layering rules.** UI components never mutate state directly. They call action methods on
`store.ts`, which validate inputs, apply an updater to the immutable state tree, emit to
subscribers and schedule one debounced write. `calc.ts` has no imports from the store, which
is why it can be unit-tested as pure functions.

**Derived data.** Balances, outstanding loan principal, budget spend, net worth and
notifications are computed on demand from the state (`accountBalances`, `financialSummary`,
`budgetSpent`, `buildNotifications`) instead of being cached. A single writer means derived
values can never drift from their source records.

### Repository layout

```
FinoraApp/
├── src/
│   ├── App.tsx                 route switch, splash, tabs, FAB, exit sheet
│   ├── components/             UI primitives and feature components
│   │   ├── ui.tsx              Screen, Card, Sheet, Btn, Field, Toaster …
│   │   ├── bits.tsx            small presentational pieces
│   │   ├── charts.tsx          SVG donuts, bars and sparklines
│   │   ├── AppLock.tsx         PIN / biometric lock overlay
│   │   ├── AccountCarousel.tsx swipeable account cards
│   │   ├── PdfViewer.tsx       pdfjs-dist document canvas
│   │   └── RecordAttachments.tsx  attach files to any record
│   ├── lib/
│   │   ├── calc.ts             money engine: schedules, balances, totals
│   │   ├── money.ts            minor units, currency table, formatting
│   │   ├── store.ts            state container, actions, migrations
│   │   ├── storage.ts          IndexedDB read / write
│   │   ├── backup.ts           ZIP export, checksum verification, restore
│   │   ├── select.ts           notifications, global search, report rows
│   │   ├── sms.ts              bank-message parser and fingerprints
│   │   ├── files.ts            validation, compression, SHA-256, sharing
│   │   ├── types.ts            the complete domain model
│   │   ├── hooks.ts            route, theme, scroll memory, live store hook
│   │   └── …                   appLock, biometric, reminders, widget, toast
│   └── screens/                24 screen files behind the router
├── android/                    Capacitor Android host (Java sources)
├── tests/finora.spec.ts        Playwright end-to-end walkthrough
├── public/                     PWA manifest and icons
├── dist/                       production web build served to Capacitor
└── *.apk / *.aab               signed release artefacts per version
```

---

## ✦ Data model & money math

All amounts are **integer minor units** (cents, or whole yen for JPY). A currency's minor-unit
exponent lives in `money.ts`, so arithmetic never touches `float` rounding error and
`formatMoney()` is the only place numbers become text.

| Concept          | Type          | Notes                                                                 |
| :--------------- | :------------ | :-------------------------------------------------------------------- |
| `Account`        | `kind`        | `bank` · `cash` · `wallet` · `credit` · `other`                       |
| `Txn`            | `kind`        | `income` · `expense` · `transfer` — transfers are a single record      |
| `Job`            | `salaryType`  | `monthly` · `weekly-fixed` · `weekly-allocation` · `contract`          |
| `Loan`           | `interestMode`| `reducing` · `flat` · `interest-only` · `none`                        |
| `Loan`           | `frequency`   | `monthly` · `quarterly` · `annual` · `end-of-term`                    |
| `EmiPayment`     | `split`       | principal + interest + fees, allocated per payment                    |
| `SalaryRecord`   | `periodKey`   | `YYYY-MM` monthly, `YYYY-MM-DD` weekly — uniqueness enforced per job  |
| `VaultDoc`       | `links[]`     | typed back-references to accounts, loans, bills, goals, investments    |

**Amortisation.** `generateSchedule(loan)` produces the full EMI table up front:

| Mode             | Instalment                                                                        |
| :--------------- | :-------------------------------------------------------------------------------- |
| Reducing balance | `EMI = P · r · (1 + r)ⁿ / ((1 + r)ⁿ − 1)`, then per-month interest on the balance |
| Flat rate        | `EMI = (P + P · annualRate · years) / n`                                          |
| Interest only    | Interest paid per period, principal due at the end of term                        |
| None             | Equal principal instalments with no interest                                      |

**Payments.** `splitEmiPayment()` allows a payment to be allocated automatically, to principal
only, or to interest only, and rejects amounts that would exceed what the instalment still
owes. `loanSettlementRows()` computes the full payoff figure for early settlement, and
`settleLoan()` posts one auditable payment per remaining EMI before closing the loan.

**Payroll.** `salaryNet()` = base + commission + overtime + allowances + bonus − unpaid leave
− half days − hourly deductions − loan deduction − advance − tax − other. A payroll loan
deduction is posted through `syncSalaryLoanPosting()`, which removes and rebuilds that record's
EMI postings so editing a salary period can never double-count repayment.

**Guards.** Structural loan terms are frozen once a payment exists; an account with history
must be archived rather than deleted; generated transactions are corrected in the module that
owns them; salary payments cannot exceed the remaining net.

---

## ✦ Privacy & security

- **Local-first.** Records and uploaded files never leave the device. There is no sync server,
  no analytics SDK and no third-party network call at runtime.
- **Verified backups.** `createBackup()` writes a ZIP containing `manifest.json`,
  `data/finora.json`, real media bytes and real document bytes. Each file is recorded with its
  size and SHA-256 digest; `readBackup()` refuses archives with a missing file, wrong size,
  bad checksum, foreign app id or newer schema version *before* touching stored data.
- **Non-destructive restore.** Restoring is a two-step flow: verify and preview the counts,
  then apply. **Clear data** keeps the profile and avatar and removes only financial records.
- **Permissions are requested narrowly and used on demand.** SMS reading is opt-in and feeds a
  review queue; the contacts bridge uses the system picker instead of bulk address-book access;
  camera and photos are used for statement capture only.
- **App lock.** A PIN or the device's own biometric/PIN prompt gates the app, with configurable
  idle timeout (`0 s` to `15 min`) and optional lock-on-background. The native Back handler
  refuses to dismiss it.

| Android permission      | Why                                                                  |
| :---------------------- | :------------------------------------------------------------------- |
| `READ_SMS`, `RECEIVE_SMS` | Detect bank transaction messages for the review queue              |
| `POST_NOTIFICATIONS`    | Bill, EMI, salary and reminder alerts                                |
| `READ_CONTACTS`         | Pick a contact for a friend/family loan                              |
| `CALL_PHONE`            | Call a lender from a loan detail screen                              |
| `CAMERA`, `READ_MEDIA_IMAGES` | Capture or attach receipts and statements into the Vault        |
| `READ_PHONE_STATE`      | Device context for notification and widget behaviour                 |

---

## ✦ Getting started

```bash
# 1 — install dependencies
npm install

# 2 — start the development server (http://localhost:5173)
npm run dev

# 3 — type-check and build the production bundle into dist/
npm run build
```

| Script             | Command              | Purpose                                              |
| :----------------- | :------------------- | :--------------------------------------------------- |
| `dev`              | `vite`               | Hot-reloading web app                                |
| `build`            | `tsc --noEmit && vite build` | Strict type-check, then production bundle     |
| `preview`          | `vite preview`       | Serve the built bundle locally                       |
| `typecheck`        | `tsc --noEmit`       | Types only                                           |
| `test`             | `vitest run`         | Unit tests for the finance engine and reminders      |
| `test:e2e`         | `playwright test`    | End-to-end walkthrough against a running build       |

---

## ✦ Android build

The Android project is a standard Capacitor host. The web bundle in `dist/` is what ships
inside it, so always build before syncing.

```bash
npm run build                     # compile the web app
npx cap sync android              # copy dist/ + plugins into android/
cd android
./gradlew assembleRelease         # → app/build/outputs/apk/release/*.apk
./gradlew bundleRelease           # → app/build/outputs/bundle/release/*.aab
```

Release artefacts kept in the repository root, one pair per version:

| Version | APK                            | AAB                            |
| :-----: | :----------------------------- | :----------------------------- |
| 1.0.2   | `Finora-1.0.2-release.apk`     | —                              |
| 1.0.3   | `Finora-1.0.3-release.apk`     | —                              |
| 1.1.0   | `Finora-1.1.0-release.apk`     | `Finora-1.1.0-release.aab`     |
| 1.2.0   | `Finora-1.2.0-release.apk`     | `Finora-1.2.0-release.aab`     |
| 1.3.0   | `Finora-1.3.0-release.apk`     | `Finora-1.3.0-release.aab`     |

Native modules live in `android/app/src/main/java/com/finora/app/`:

| Class                        | Responsibility                                                       |
| :--------------------------- | :------------------------------------------------------------------- |
| `MainActivity`               | Bridges, insets, system-bar theming, Back dispatch, contact picker    |
| `FinoraNotificationReceiver` | Channel setup, immediate posts and `AlarmManager` scheduling          |
| `FinoraWidgetProvider`       | Remote-views widget rendering the latest net-worth snapshot            |
| `FinoraBiometricPlugin`      | `BiometricPrompt` availability and unlock result                      |

---

## ✦ Testing

```bash
npm run typecheck     # strict TypeScript, no emit
npm test              # Vitest — 35 passing
npm run test:e2e      # Playwright — full walkthrough
```

| Suite                    | Covers                                                                     |
| :----------------------- | :------------------------------------------------------------------------- |
| `src/lib/finance.test.ts`| Money parsing/formatting, balances, budgets, bills, reports, splits         |
| `src/lib/loans.test.ts`  | Reducing/flat schedules, EMI status, allocation, settlement, outstanding    |
| `src/lib/reminders.test.ts` | Occurrence generation, repeat rules, month windows                      |
| `tests/finora.spec.ts`   | Onboarding, accounts, transactions, salary, loans, Vault uploads, backups   |

---

## ✦ Design system

- One stylesheet (`src/index.css`) built on CSS custom properties, with `data-theme="light"` /
  `data-theme="dark"` applied on `<html>`; the system preference is honoured by default.
- A fixed type and spacing scale, card-and-sheet surfaces, and generous hit targets tuned for
  one-handed phone use.
- `lucide-react` icons only, at two stroke weights for active and inactive states.
- Motion is short and purposeful — and is skipped entirely when
  `prefers-reduced-motion: reduce` is set, including the cold-start splash.
- Charts are hand-rolled SVG (`charts.tsx`), so there is no charting dependency and nothing
  to fetch at runtime.

---

## ✦ Version history

| Version | Date       | Highlights                                                                    |
| :-----: | :--------- | :---------------------------------------------------------------------------- |
| 1.3.0   | Nov 2026   | Reminders module, loan coverage tests, account carousel, PDF viewer, attachments |
| 1.2.0   | Nov 2026   | Loan categories and interest modes, settlement flow, home widget               |
| 1.1.0   | Nov 2026   | Salary module rewrite, payroll loan deductions, verified ZIP backups            |
| 1.0.3   | Nov 2026   | App lock, permissions screen, Android Back and inset handling                  |
| 1.0.2   | Nov 2026   | First signed release: accounts, transactions, budgets, bills, Vault            |

---

## ✦ License

No license file is included in this repository. All rights reserved by the author unless a
license is added.
