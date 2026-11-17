# Verification — 17 November 2026

## Feature-parity audit follow-up

The subsequent [feature-by-feature audit](FEATURE_PARITY_AUDIT.md) reproduced two functional defects: road-test history survives account switching, and queued edits to an existing case are not replayed before submission. Passing checks below do not establish complete parity. The audit also records unconfigured push delivery, behavioral differences and unverified live integrations.

## Passed

- `npm run check`: TypeScript check.
- `npm test`: 24 tests across five files.
- `npm run build`: production assets plus generated service worker; 15 precached assets, including offline OCR worker/cores/language data.
- `npm run test:e2e`: 12 tests in the installed Google Chrome.
- Dependency installation audit: zero reported vulnerabilities after updating the test runner and affected transitive dependencies.

Unit tests cover GPS speed/distance, missing/out-of-order/stale GPS fixes, restored IndexedDB drafts and media, concurrent storage writes, account separation, actual binary/container upload handling, retrying interrupted submissions without creating another case, signed-in queue access, real signature SVG generation, and honest errors for failed authentication/password/transcription operations.

Browser tests cover sign-in, mobile and desktop overflow, all six main sections, the complete seven-step warranty wizard with notes/submission, offline reopening through the production service worker, camera capture into a real Blob and a saved draft with a working image preview after reload, and microphone recording with multipart upload/transcript attachment.

All 26 mobile screen components are present in `src/screens`. Their original styles, assets and business logic are reused. Browser adapters and specific fixes are contained in this PWA; the mobile application source was not edited.

## Test boundaries

The browser tests use isolated API fixtures. Camera and microphone browser tests use Chrome's synthetic media devices. They do not create real dealership accounts, cases or loan agreements. Source reuse and browser rendering were checked; a native-device pixel comparison was not performed.

The deployed backend at `https://warranty-evidence.omnisuiteai.com/api/v1/brands` returned HTTP 200 with JSON and `Access-Control-Allow-Origin: http://localhost:5173` during the live connectivity check. The PWA sends API requests directly to this backend. These integrations still require a test account and live workflow checks:

- Real login/registration, password-reset email/OTP delivery and server-side role/site authorization.
- Actual VIN decode, published manufacturer packs, evidence acceptance, review/flag/re-submit and notifications.
- Hoist inspection writes, live loan issue/sign/edit/return, and authenticated server-generated PDFs.
- The transcription service accepting the browser's audio container, and media uploads accepting the browser's video MIME types.
- Road-test telemetry on physical devices and server-side record updates.
- Data-URL loan photos/signatures and request-size limits on the actual backend.

Firebase web application configuration and a VAPID key were not supplied, so background web-push delivery could not be verified. The implementation is present and `.env.example` documents its required values. In-app notification polling uses the existing mobile endpoints.

Chrome was tested on this Windows computer. Physical Android/iPhone camera, barcode scanning, real GPS movement, Safari installation, notification permissions and physical-device signature input still need device acceptance checks. Browsers cannot guarantee GPS/timer execution while the app is hidden, locked or closed; keep live road tests in the foreground. The app requests a screen wake lock when supported.

## Local handoff

The deployable output is `dist/`. Run `npm run preview` and open `http://localhost:4173` for the installable production preview. Use `npm run dev` for development. Direct backend configuration, HTTPS deployment, Firebase configuration and browser constraints are described in `README.md` and `nginx.conf.example`.
