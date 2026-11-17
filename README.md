# Booran Warranty Capture PWA

The browser port of the React Native application in `../warranty-app`. All mobile screens, theme values, assets, navigation callbacks, business rules and API modules were copied into this directory. The mobile project was left unchanged. Browser adapters replace native-only integrations; the mobile UI has not been redesigned.

## Run locally

Requires Node.js 22.20 or newer.

```powershell
cd D:\warranty-app-pwa\pwa
npm ci
npm run dev
```

Open http://localhost:5173. API requests go directly to **https://warranty-evidence.omnisuiteai.com/api/v1**, with each endpoint appended to that base URL. To override the backend, set `VITE_API_HOST` in `.env.local` to its URL without `/api/v1`, then restart Vite (or rebuild for production). The backend must allow the PWA origin in CORS. The existing login-screen server settings remain available; changes persist in this browser. Saved frontend and retired LAN addresses are automatically replaced by the configured backend. `.env.example` documents configuration overrides.

For installation and offline use, run the production build:

```powershell
npm run build
npm run preview
```

Open http://localhost:4173. Choose **Install app** on the login screen or in **Profile & settings**. Chrome/Edge use the browser installation prompt when available; otherwise the button explains the browser's menu action. On iPhone/iPad, open the deployed HTTPS site in Safari and use Share → Add to Home Screen. The button is hidden in the installed app. Branded Booran icons include dedicated maskable and Apple Home Screen assets. The development server deliberately does not register a service worker.

## Included workflows

| Area | Implementation |
| --- | --- |
| Authentication | PIN activation screens, sign-in, registration, password recovery, OTP dialogs, profile and site selection |
| Warranty | Case list/detail, seven-step wizard, VIN decode, concern and part serials, manufacturer packs, evidence, notes, submission receipts, flags and reviewer actions |
| Inspections | Rooftop vehicle lists, manufacturer-specific requirements, evidence capture/removal, local progress and completion |
| Road tests | Original live/demo screens, GPS, geofencing, route display, history, notes and manual trip operations |
| Hoists | Bay overview, checklist, faults, lockout/tagout, compliance and history |
| Loan vehicles | Issue wizard, licence/vehicle photos, drawn customer signatures, consent, edit, return, settlement calculations and PDF download |
| Notifications | Existing in-app case polling/history plus configurable Firebase web push |

Camera capture uses a live browser viewfinder, microphone recording uses MediaRecorder, barcode scanning uses ZXing, and VIN/odometer OCR uses locally bundled Tesseract assets. Uploads contain actual binary files and their actual MIME types. Loan photo payloads and signatures use data URLs; authenticated PDFs are downloaded with the active bearer token.

## Offline behavior

The service worker precaches the application and OCR assets. IndexedDB stores drafts, inspection progress and media. Draft/queue maps are separated by technician. Previously fetched GET responses are cached by server URL and account, and are reused on connection failure. Captured object URLs are restored when the app reloads. Browser sessions survive reload; a new browser session requires sign-in.

Warranty submissions retain evidence in a durable retry queue. Interrupted uploads reuse the case ID already created on the server. Reconnection retries queued cases and inspection evidence/notes. The production service worker can also replay them after every app window closes on browsers supporting Background Sync; other browsers retry on reopening. Logout removes background authorization. Active drives restore their saved state and elapsed time after reload. An offline receipt says **Pending Upload**, rather than claiming server submission. Loan issue/sign/edit/return/delete, hoist inspection/update and road-test mutations also use a durable account/backend-scoped outbox. Offline confirmations state that changes are pending synchronization. The explicit road-test demo mode remains available; empty loan results are not replaced with fabricated agreements.

## Hosting and device requirements

Set `VITE_API_HOST` to the deployed HTTPS backend host before building, configure backend CORS for the PWA origin, and deploy `dist/` on HTTPS. Requests and relative upload URLs use that backend directly. `nginx.conf.example` supplies a frontend hosting template; its API proxy locations are optional for other clients. Never expose an HTTP API from an HTTPS page. Camera, microphone, GPS, service workers and installation require a secure context; `localhost` is suitable for testing. A phone opening this computer's plain HTTP LAN address will have restricted device features.

For web push, register a **web app** in the existing Firebase project, set the public `VITE_FIREBASE_*` values in `.env.local`, and rebuild. The backend must accept `platform: "web"` device registrations and send notifications to those FCM tokens. Without those settings, in-app polling continues; background push is unavailable. The native mobile Firebase files cannot supply a web app ID or VAPID key.

Browsers can suspend GPS and timers when hidden, locked or closed. Live road tests should remain open in the foreground. The app requests a screen wake lock when supported and continues tracking across its own screens. Browser permission dialogs, date controls, camera controls and font rendering can differ from native OS rendering.

The backend must accept the browser's recorded containers (for example WebM/Opus as well as MP4/M4A) and permit sufficiently large photo/data-URL payloads. Backend source was not present here, so these server contracts require live integration verification.

## Checks

```powershell
npm run check
npm test
npm run build
npm run test:e2e
```

Browser tests use the installed Google Chrome and isolated API fixtures. No real accounts or dealership records are created by the tests. See `IMPLEMENTATION_STATUS.md` and `VERIFICATION.md` for current completion status, tested coverage and device/live boundaries.

## Optional production push bridge

Firebase activation is currently deferred as requested. The implementation is ready in `server/push-topics.mjs`. It validates the backend bearer token through `/auth/me` and derives the same native topics from the verified user, using the server-only Firebase Admin SDK. Configure `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` on the server, set the public web/VAPID configuration before building, then run `npm run serve` behind HTTPS. Do not place Admin credentials in a `VITE_` variable or the public directory. `VITE_PUSH_BRIDGE_URL` can point to a separately hosted bridge; default is `/pwa-api/push/topics`. The bridge can also be integrated with an existing Node backend.

On this Windows machine C: is full; verification uses the project `.tmp` directory on D: for temporary/browser files. The browser test runner sets this automatically.
