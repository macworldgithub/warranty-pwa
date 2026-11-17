# PWA completion follow-up - 17 November 2026

This document supersedes the original feature audit's defect statuses. The original audit remains a historical comparison of the earlier build.

All 26 mobile screen/modal files remain in the PWA. The original mobile project was not edited. The current source comparison is in [audit/current-source-inventory.json](audit/current-source-inventory.json); no mobile source files are missing.

## Completed implementation from the audit

| Audit finding | Implemented result |
| --- | --- |
| Road history survives account switching | Account-bound providers remount on user changes; history restoration replaces prior state; empty server histories clear the view. Late history/authentication/notification responses are guarded. |
| Existing-case offline fields and notes are skipped | Shared replay sends field/note updates before evidence and submission. Uploaded evidence and confirmed server IDs are checkpointed so later failures can resume. |
| Closed-window uploads cannot run | The production service worker now replays persisted cases, manufacturer inspections and the outbox without a window. Page/worker coordination and cross-tab locking prevent concurrent replay. Native Background Sync is registered only while work exists. |
| Road mutations are lost on connection failure | Start, telemetry, completion, manual create, update and delete are durable operations. Dependent calls resolve the server ID returned by a queued create/start. |
| Active road test is lost on reload | Vehicle, drive ID, route, distance, maximum speed and timing are restored. Elapsed time uses the start timestamp. No location or distance is invented while GPS is suspended. |
| Hoist operations fail without durable recovery | Inspection and update operations persist pending work. Local faults/lockout information overlays stale cached server reads. In-memory fallback state is isolated by account/backend. |
| Loan operations lack proper offline writes | Issue/sign/edit/return/delete operations are durable, ordered and account/backend scoped. Consent, signatures and media are preserved. Server validation errors remain errors and failed optimistic creates are rolled back. |
| Signature shortcut differs | The mobile Auto-Certify Signature control is restored, alongside drawn signatures. Both generate actual SVG signature payloads. |
| VIN scan produces no evidence photograph | A successful camera scan retains an actual captured JPEG frame as VIN evidence, instead of the mobile source's fabricated file path. |
| Fictitious loan read fallback | An empty server result now stays empty. Offline reads use saved account records rather than sample agreements. |
| PDF errors are hidden | PDF requests use the active bearer token and resolved server ID. Offline agreements explain that the server PDF requires synchronization; download errors are surfaced. |
| Pending operations are unclear | The PWA shows pending-change counts and provides a retry action. Offline issue/hoist confirmations explicitly say saved offline. |
| Notification adapter is incomplete | Token refresh/re-registration, account cleanup, cold-start/open handlers, existing in-app polling and an authenticated Firebase Admin topic bridge are implemented. Firebase activation is deferred at the user's explicit request. |
| User management can show stale data after editing | Older directory responses cannot overwrite a newer mutation. Edit/delete controls have accessible labels. |
| Home layout and installation follow-up | The original mobile home layout is retained; menu cards now keep two columns after resizing/rotation. Login/profile installation actions support browser prompts and manual installation guidance, with branded 192/512-pixel, maskable and Apple icons. Chrome reports zero installability errors. Exact comparison against the supplied screenshots is pending because both attachment paths were missing. |

Authentication failures, password/OTP failures and transcription failures continue to surface real errors. The earlier simulated successful authentication and fabricated transcript fallbacks were not restored. Their actual online forms and API paths remain available.

## Verification

**Final checks passed: TypeScript, 32 unit tests, production build and 26 Chrome browser tests.** See [VERIFICATION.md](VERIFICATION.md) for coverage and boundaries. The automated suite covers isolated business writes; the supplied live accounts were used for real authentication and read/navigation checks. No real dealership cases, loans, inspections or users were created or deleted during the live checks.

The browser suite includes all seven warranty steps; account switching; administrator create/edit/delete; reviewer approval/flagging; hoist sign-off; loan issue/sign/edit/authenticated PDF download/return; camera/audio; actual barcode decoding with retained frame; OCR with network disabled; active-drive recovery; offline reopening; and actual service-worker submission after every PWA window closes.

## Explicitly deferred or platform-dependent

- **Firebase activation: deferred by the user.** The public web configuration/VAPID key and server Admin credentials have not been configured. Push delivery is not claimed active. In-app notifications remain available.
- **Closed/hidden-app GPS: browser limitation.** The Web Geolocation API delivers updates to visible, active documents. Service workers cannot collect GPS after the PWA closes. Use the live drive in the foreground; wake lock, durable telemetry, elapsed-time recovery and drive restoration are implemented. See the [W3C Geolocation specification](https://www.w3.org/TR/geolocation/).
- **Background Sync availability:** automatic closed-window retry depends on browser support and scheduling. Where unavailable, pending work resumes when the PWA reopens. The browser may expire a session; work stays saved until that account signs in again.
- **Physical-device acceptance:** actual Android/iPhone camera, microphone/video containers, touch signatures, GPS movement, Safari installation and native-device screenshot comparison have not been performed on physical phones. Browser permission/system controls can differ from native controls.
- **Real business writes:** the live backend reads and real sign-in have been checked, but production business-write/PDF/transcription contracts have not been exercised with real dealership records. Automated business writes use isolated fixtures; camera/audio/barcode/OCR use actual browser implementations with generated media.

This is a completed implementation follow-up with these explicit limits, not a claim of unrestricted native capability or pixel-identical rendering on every device.
