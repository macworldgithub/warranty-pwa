# Mobile application / PWA feature parity audit

> Superseded status: this is the original audit. The two reproduced defects and implementation gaps have since been addressed; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and [VERIFICATION.md](VERIFICATION.md) for current status. Firebase activation was explicitly deferred by the user.

Audited 17 November 2026 against the mobile source in `../warranty-app`.

**Verdict: No. The PWA contains the mobile application's screens and API call paths, but it is not yet a fully verified, functionally equivalent clone. Two functional defects were reproduced, web push is not configured, some behavior differs intentionally, and live backend/device workflows remain unverified.**

This audit did not change application behavior. It added the inventory, this report, and separate regression checks documenting the defects.

## What was compared

- `App.tsx` and all files under `src`: **110 files**, **72 unchanged**, **38 changed**, **0 missing**. Code comparison normalized line endings.
- **26 screen/modal component files**, all present in the PWA. This is a source inventory, not 26 independently tested navigation routes.
- **50 direct HTTP call signatures** in each application's API source, with no missing signatures. This establishes source coverage, not successful server integration or equivalent request/response handling.
- Browser adapters, storage, synchronization, notifications, service worker, installation files, and existing automated tests.
- Native Android/iOS project code was not included in the shared-source count. There was no native-device screenshot comparison or physical-device acceptance run.

Machine-readable inventory: [audit/source-inventory.json](audit/source-inventory.json).

## Confirmed defects

### 1. Previous technician's road-test history remains after account switching

**Reproduced in Chrome.** Technician A sees a trip, logs out, and technician B signs in at the same site with an empty server history. A's trip remains visible to B.

`src/context/RoadTestContext.tsx:254-271` retains `tripRecords` when the user changes, merges cached history into the retained state, and can write that state into the next user's cache. The server-history effect at approximately lines 318-360 does not depend directly on the user ID and does not reliably clear the previous history for an empty response. The provider survives logout.

The mobile code already retained provider state; the PWA's persistent history merging adds a further risk of saving those records under the next account. The existing storage-isolation unit tests do not exercise this provider lifecycle.

Regression: [audit/account-switch.spec.ts](audit/account-switch.spec.ts). It is deliberately marked as an **expected failure** to document the current defect; this is not a fixed or passing isolation behavior.

### 2. Offline changes to an existing server case are not replayed before submission

**Reproduced with an isolated synchronization check.** An existing case is queued with an edited concern and a new technician note. Synchronization calls submission without replaying those changed fields/notes.

`src/context/CaseWizardContext.tsx` queues the changed case after an unsuccessful online update. In `src/services/syncManager.ts:59`, the DTO containing text fields and voice notes is sent only when creating a new local case. An existing server ID skips this branch, uploads evidence, submits the case, and removes the queue entry. No `updateCase` call applies its edited fields. The separate manufacturer-inspection voice-note loop does not repair an existing warranty case's queued edits.

This gap is inherited from the mobile synchronization design and remains unfixed in the PWA. New-case creation and retrying after a successful create are different paths and have passing tests.

Regression: [audit/known-gaps.test.ts](audit/known-gaps.test.ts). It uses `it.fails` and records an **expected failure**, not a successful replay.

## Status key for the feature comparison

- **Tested**: relevant behavior ran in automated tests, within the stated fixture/device boundaries.
- **Present**: implementation and corresponding mobile source path are present; complete runtime behavior has not been verified.
- **Adapted**: a web implementation exists in place of a native API; exact native behavior/UI is not established.
- **Changed**: a known behavioral difference from the mobile source.
- **Gap**: a reproduced defect or missing execution capability.
- **Unconfigured**: code exists but required configuration is absent.

“Present” does **not** mean “fully working.” A row can contain both an implemented path and a gap.

## Feature-by-feature comparison

### Authentication, access and navigation

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Sign-in form, password visibility, validation and navigation | Tested | Chrome sign-in with API fixtures; actual backend credentials unverified. |
| First-login activation / technician registration | Present / Changed | Forms and calls retained; fabricated local registration success was removed. Real server flow unverified. |
| Registration OTP request and verification | Present / Changed | API paths retained; simulated OTP success removed. Email delivery and verification untested live. |
| Forgot-password OTP and password reset | Present / Changed | API paths retained; failures surface honestly. Actual delivery/reset unverified. |
| Authenticated API requests / current-user lookup | Present | Session token used; live token expiration and server authorization unverified. |
| Session restoration and logout | Tested in part | Browser session restoration/navigation exercised. Road-history state isolation fails as described above. |
| Role-specific UI and site/brand restrictions | Present | Same role branches; administrator/clerk workflows and backend enforcement not tested end to end. |
| Technician home and six primary sections | Tested | All six open in Chrome with fixtures. Counts and real server data unverified. |
| Home/back navigation and shared header | Tested in part | Main navigation exercised; exhaustive navigation permutations not tested. |
| Profile information and site selection | Present | Same source UI and data paths. |

### Warranty capture and review

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Case lists, status tabs, search/filter and detail view | Present / Tested in part | Main screens open; full server-backed filtering/status lifecycle unverified. |
| Step 0: site, authorized brand, repair order, claim number | Tested | Seven-step wizard runs against fixtures. |
| Step 1: manual VIN, decode, odometer, vehicle details | Tested in part | Manual fields exercised; real VIN decoding unverified. |
| VIN barcode scan | Adapted / Changed | ZXing camera/manual entry path; scan no longer creates a fabricated photo evidence URI. Physical scanning unverified. |
| VIN, odometer and front-vehicle photos | Adapted / Tested in part | Browser camera produces real Blob data; one capture/reload path tested with synthetic camera. |
| Step 2: concern, fault category, replaced-part/noise/diagnostics flags, repair stage | Tested in part | Wizard input flow exercised; every rule combination not tested. |
| Old/new serial entry, barcode capture, collision check | Present / Adapted | Source validation retained; actual barcode recognition not tested with physical parts. |
| Step 3: manufacturer rules and guided evidence | Present | Same pack/rule paths; published live packs and all rule permutations unverified. |
| Step 4: Tier 2 / component evidence | Present | Same conditional rule handling; no exhaustive manufacturer acceptance run. |
| Step 5: manual notes, edit/delete and dictation | Tested in part | Manual note and recorded audio/transcript fixture paths exercised. |
| Step 6: review, local draft and submission receipt | Tested in part | New-case fixture submission exercised. Actual server acceptance unverified. |
| Reopen an existing case and change fields/evidence | Present / Gap | Online path present; offline edited-field/note replay defect confirmed. |
| Clerk/admin approval, claim reference and review notes | Present | Same API/UI paths; not exercised with live reviewer accounts. |
| Reject/flag reasons, comments and technician resolution | Present | Same controls and navigation; full flag/resubmit lifecycle unverified. |
| Evidence preview/lightbox and video opening | Adapted | Browser media URI resolution added; complete image/video variants not tested. |
| OEM filenames and evidence metadata | Present | Naming logic retained; backend storage acceptance unverified. |
| Image quality gates | Present, limited in mobile too | File-size/resolution checks; no real blur/darkness/glare analysis. Do not treat this as complete image-quality inspection. |
| Warranty submission readiness | Present, limited in mobile too | Existing `qualityGates` returns ready despite missing photos; evidence remains optional in this path. |

### Camera, audio and manufacturer inspections

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Photo capture, retake and cancellation | Adapted / Tested in part | `getUserMedia`/browser capture; synthetic-device capture and restored preview tested. |
| Video recording and evidence upload | Adapted / Present | Real browser recording and MIME-aware upload helpers exist; server acceptance and physical devices unverified. |
| Microphone recording and multipart upload | Adapted / Tested | Synthetic microphone produces real recorded bytes; transcript response supplied by fixture. |
| Server transcription and editable notes | Present / Changed | Fake fallback transcript removed. Real transcription service/container support unverified. |
| OCR extraction | Adapted / Present | Tesseract worker, cores and English data bundled for offline use; accuracy on real VIN/serial images unverified. |
| Manufacturer selection and rooftop vehicle selection | Present | Shared source; real site inventory unverified. |
| Published manufacturer pack/version and bulletins | Present | Correct-brand/published-pack checks retained; actual pack contents unverified. |
| Required/optional capture cards and progress | Present | Pack-driven UI retained. |
| Manufacturer inspection save and required-evidence gate | Present | Local save and evidence existence gate implemented; distinct from permissive warranty wizard gate. |
| Manufacturer inspection voice notes | Present, improved | PWA now persists and synchronizes them; mobile callback was a no-op. Live upload unverified. |
| Manufacturer inspection evidence retry | Present | Queued local media handled by sync manager; all interruption/server cases unverified. |

### Vehicles and road tests

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Rooftop vehicle list/search and inspection entry | Present | Same source/service paths; real inventory unverified. |
| Road-test vehicle/registration/repair-order setup | Present | Screen opens in Chrome; full drive not executed with real GPS. |
| Start/stop drive and outcome recording | Present | Local and server call paths retained; live lifecycle unverified. |
| GPS speed, distance, elapsed time and stale-fix handling | Adapted / Tested in part | Calculation unit tests pass; real movement/accuracy unverified. |
| Geofence/site checks | Adapted / Present | Browser geolocation implementation; real dealership boundary checks unverified. |
| Continue tracking while navigating inside the app | Adapted / Present | Shared provider/bridge exists; sustained physical-device run unverified. |
| Screen wake lock | Adapted / Present | Requested when supported; device behavior unverified. |
| GPS tracking while app is closed | Gap | No closed-app GPS tracking implementation. Foreground page APIs are used. |
| Road history, trip detail and manual history changes | Present / Gap | Local persistence added; account switching exposes previous history. |
| Offline road telemetry/start/completion retry | Gap | API failures are logged; no durable replay queue for these road-test mutations was found. Local history is not proof of server synchronization. |
| Simulated/demo road-test paths and seeded history | Present | Inherited mobile behavior; displayed sample trips do not establish a live integration. |

### Hoist inspections

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Hoist overview, summaries, filters and bay details | Present / Tested in part | Overview opens; source can use seeded data. Real server read behavior unverified. |
| Checklist PASS / FAULT / N/A and quick-pass | Present | Same controls/checklist logic. |
| Fault description, severity and lockout handling | Present | Same conditional UI; live state transition unverified. |
| Technician sign-off and inspection submit | Present / Changed | PWA requires server success instead of silently succeeding locally. Backend write unverified. |
| Inspection history and compliance status | Present | Same source/API paths; live history/compliance updates unverified. |
| Hoist update | Present / Changed | Server confirmation required; mobile local-success fallback removed. |

### Courtesy vehicles / loan agreements

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Loan dashboard, KPI/status filters and vehicle/agreement detail | Present / Tested in part | Main screen opens; inherited sample fallback remains on read paths. Real KPIs unverified. |
| Issue wizard: vehicle, customer and driver details | Present | Same form/data path; no complete live issue run. |
| Driver-licence photos and vehicle-condition photo slots | Adapted / Present | Browser camera/media serialization; actual backend payload-size/schema acceptance unverified. |
| Return date/time, odometer/fuel and agreement terms | Present / Adapted | Native date control replaced with browser input UI. |
| Share/open legal terms and documents | Adapted / Present | Browser share/download/open equivalents; physical-device behavior unverified. |
| Draw, clear and save customer signature | Adapted / Tested in part | Actual SVG generation/empty-signature validation unit tested; real touch input not acceptance tested. |
| “Tap to Auto-Certify Signature” shortcut | Changed: removed | Mobile can generate a sample signature path; PWA requires a drawn signature. Exact UI/behavior therefore differs. |
| Issue/sign/activate agreement | Present / Changed | Server calls retained; fabricated successful offline agreement removed. Live signing and generated agreement unverified. |
| Edit agreement | Present / Changed | Server confirmation required; fake local-success fallback removed. |
| Return vehicle/agreement | Present / Changed | Server confirmation required; fake local-success fallback removed. |
| Delete agreement | Present / Changed | Failed server delete surfaces an error; no pretend deletion success. |
| Agreement PDF preview/download/share | Adapted / Present | Authenticated browser download implemented; actual server PDF generation and content unverified. |

### Administration and notifications

| Mobile feature | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Administrator user list/search/role filters | Present | Same profile management UI; no full admin browser/live run. |
| Create/edit/delete user and site/role assignments | Present | HTTP call paths retained; server validation/authorization unverified. |
| In-app notification polling/history/banner | Present | Existing endpoints and handlers retained; actual events unverified. |
| Notification routing to case, evidence step or flag resolution | Present | Same navigation branches; live push-to-case lifecycle unverified. |
| Browser push token registration and foreground/background delivery | Unconfigured | Firebase web app configuration and VAPID key absent; delivery not operationally verified. |
| Native topic subscriptions and token-refresh lifecycle | Gap / partial adapter | Web adapter does not implement native `subscribeToTopic`/`onTokenRefresh` hooks. Equivalent topic routing/token lifecycle requires implementation and server integration. |

### Offline operation, PWA installation and appearance

| Mobile feature / PWA requirement | PWA status | Evidence / remaining boundary |
| --- | --- | --- |
| Durable warranty drafts and captured media across reloads | Tested | IndexedDB persistence/restoration exercised, including photo preview. |
| Per-user persistent maps and GET cache | Tested in part | Storage-level isolation tests pass; road-provider account isolation separately fails. |
| New-case offline queue and interrupted-create retry | Tested in part | Unit tests cover preserving created IDs to avoid another create after submit failure. Existing-case field replay is defective. |
| Automatic retries while signed in and app open | Present | Foreground retry mechanism exists; full live recovery unverified. |
| Queue replay when app is closed | Gap | Service-worker sync handler only messages existing windows; no headless queue replay or background-sync registration found. |
| Offline app-shell reopening | Tested | Production service-worker precache/reopen checked in Chrome. Offline shell does not mean every server feature works offline. |
| Manifest, standalone mode, icons and installable production assets | Present / Tested in part | Manifest/assets and service worker present; installed Android/iOS acceptance not performed. |
| Same configured mobile backend | Present | Development proxy defaults to `http://192.168.100.33:4000`; production requires configured deployment/proxy. Latest live check timed out. |
| Shared layouts, colors, components and assets | Present / Tested in part | Mobile source reused; Chrome mobile/desktop overflow checks pass. No native pixel comparison. |
| Exactly identical native camera/date/share/permission UI | Changed / unverified | Browser equivalents are used; exact native control appearance is not achieved or demonstrated. |
| Android, iPhone/Safari and physical-device parity | Unverified | This audit exercised Windows Chrome, not physical mobile devices. |

## Complete screen-file inventory

All these mobile files exist under the matching PWA `src/screens` paths:

| Area | Screen/modal files |
| --- | --- |
| Authentication (1) | `auth/LoginScreen.tsx` |
| Cases (2) | `cases/CaseListScreen.tsx`, `cases/CaseDetailScreen.tsx` |
| Home (1) | `home/TechnicianHomeScreen.tsx` |
| Manufacturer inspection (2) | `inspection/GuidedZoneCaptureScreen.tsx`, `inspection/ManufacturerInspectionScreen.tsx` |
| Loaners (6) | `loaners/LoanVehiclesScreen.tsx`, `IssueLoanerWizardScreen.tsx`, `EditLoanerModal.tsx`, `ReturnLoanerModal.tsx`, `LoanVehicleDetailsModal.tsx`, `LoanAgreementPdfModal.tsx` |
| Profile (1) | `profile/ProfileScreen.tsx` |
| Road test (1) | `roadtest/RoadTestScreen.tsx` |
| Vehicles (1) | `vehicles/VehicleListScreen.tsx` |
| Hoists (3) | `hoist/HoistOverviewScreen.tsx`, `HoistInspectionScreen.tsx`, `HoistHistoryScreen.tsx` |
| Warranty wizard (8) | `wizard/Step0_StartTicket.tsx` through `Step6_ReviewSubmit.tsx`, plus `FlagResolutionScreen.tsx` |

Both apps currently route the manufacturer inspection flow to `ManufacturerInspectionScreen`, imported with the alias `GuidedZoneCaptureScreen`. Copying the legacy file is not proof that both variants are separate reachable features.

## Executed checks and their limits

Fresh audit runs:

- `npm run check`: passed.
- `npm test`: **24 passed**, five files.
- `npm run test:e2e`: **12 passed** in Chrome.
- Separate audit regression checks: **2 expected failures reproduced**. These are deliberately outside the normal suite and are not included in the passing counts above.
- Live backend request to `/api/v1/brands`: **timed out**. Actual authentication and business writes could not be verified.

Production build passed during the preceding implementation verification; application source has not changed during this audit.

The 12 browser tests cover sign-in, six main screens, desktop overflow, the seven-step warranty wizard with a note/submission, offline app-shell reopening, photo Blob capture/draft preview restoration, and microphone recording/upload/transcript attachment. **API responses are fixtures. Camera and microphone inputs are synthetic Chrome devices.** Neither those tests nor the source inventory establish successful production workflows.

Run the defect reproductions separately from the PWA directory:

```powershell
node node_modules/vitest/vitest.mjs run --config audit/vitest.config.ts
node scripts/run-e2e.mjs --config audit/playwright.config.ts
```

The test frameworks may summarize expected failures as a successful test run. The assertions intentionally reproduce incorrect current application behavior; they do not certify a fix.

## What prevents a full-parity sign-off

1. Fix account-switch road-history isolation and existing-case offline replay; convert both expected failures into ordinary passing regressions.
2. Configure and complete Firebase web push, including the native topic/token lifecycle equivalents required by the backend.
3. Decide the required behavior for closed-app tracking/retries and server-failed hoist/loan operations; the current PWA differs from native behavior or lacks durable replay.
4. Run real backend workflows for every role: activation/reset, complete warranty approval/flag/resubmit, manufacturer capture, loan issue/sign/edit/return/PDF, hoist writes/history, user administration and notifications.
5. Validate barcode/OCR accuracy, GPS movement, camera/audio/video uploads, installation, signature input and appearance on physical Android and iPhone devices.

No defensible “100% implemented” or exact visual-parity claim can be made from the current evidence.
