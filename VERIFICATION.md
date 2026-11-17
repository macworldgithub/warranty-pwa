# Verification - 17 November 2026

Current implementation status: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The earlier [FEATURE_PARITY_AUDIT.md](FEATURE_PARITY_AUDIT.md) is historical; its two reproduced defects are fixed and covered by ordinary passing regressions.

## Final passing checks

| Check | Result |
| --- | --- |
| npm run check | TypeScript passed. |
| npm test | **32 passed** across nine files. |
| npm run build | Production build passed; service worker generated with **17 precached assets**, including local OCR assets and branded installation icons. |
| npm run test:e2e | **26 passed** in installed Google Chrome, final complete run. |
| Installation metadata | Chrome reports zero manifest/installability errors in a regular persistent browser profile. All manifest icon dimensions match their declarations. |
| Administrator workflow repeat check | Three consecutive successful create/edit/delete runs; form-readiness assertions and stale-directory response guards are included. |
| Optional production server | GET / returns app HTML with status 200; unauthenticated POST /pwa-api/push/topics returns 401. |
| Dependency installation audit | Zero reported vulnerabilities after adding Firebase Admin SDK. |
| Current source inventory | 110 mobile shared-source files compared: 69 unchanged, 41 adapted/changed, zero missing; all 26 screen/modal files present. |

## Covered behavior

Unit checks cover GPS calculations/stale fixes; IndexedDB drafts/media and account separation; upload bytes/MIME/container handling; signatures; honest auth/transcription failures; existing-case edited-field/note replay; interrupted-create recovery; durable create/dependent-ID replay; validation rejection rollback; account/backend isolation; headless case replay without window/sessionStorage; authenticated topic derivation; and offline hoist faults overlaying stale cached reads.

The 26 browser checks cover sign-in; all six main sections; mobile/desktop overflow; the seven-step warranty wizard and notes/submission; account switching; offline shell reopening; actual photo Blob capture and restored preview; microphone recording/multipart upload; real QR/VIN decoding with saved camera frame; actual OCR with network disabled; recovery of an active drive after reload; administrator user create/edit/delete; reviewer approval and flagging; hoist sign-off; loan issue/sign/edit/return and authenticated PDF download; and actual production service-worker submission after every PWA window closes. Additional checks cover the two-column home menu after resizing/rotation (320, 390, 844 and 1280 pixels), an install event arriving before React mounts, single-use/dismissed prompts, hiding installation controls after installation, iPhone installation guidance, and manifest/icon validity.

The home screen retains the original mobile source layout, colors, assets, icons and navigation. Its menu width now follows its current container instead of a module-load screen width. Current mobile/desktop renders were inspected. The two screenshot paths supplied for this follow-up were missing, so comparison against those exact screenshots remains pending their reattachment. Actual OS installation on a physical phone has not been performed.

The two original expected-failure audit reproductions were converted into normal regressions in tests/. There are no expected-failure markers in the normal suite.

## Live backend checks

The current configured backend, **https://warranty-evidence.omnisuiteai.com**, was reachable. Both supplied accounts signed in successfully with the expected TECHNICIAN and ADMIN roles.

Live authenticated reads succeeded for /auth/me, /sites, /brands, /warranty-cases, /loan-agreements, /hoists and /test-drives; the admin /auth/users read also succeeded. The actual PWA sign-in screen and all six main sections were exercised for both accounts: **12 live section checks**, with zero JavaScript runtime errors or horizontal overflow observed.

Passwords were provided through private stdin for live verification and were not saved in project source, test fixtures or configuration. No real dealership business records were created, modified or deleted by the live checks.

## Boundaries

- Automated business-write workflows use isolated API fixtures. Real server creation/approval/flag/resubmission, loan signatures/settlement/PDF generation, hoist writes, OTP delivery/password reset and transcription/media acceptance still need real-record acceptance testing.
- Photo/audio checks use generated camera or synthetic microphone input. Barcode and OCR checks decode actual generated images using the production adapters, not recognition mocks.
- Testing used Windows Chrome. Physical Android/iPhone camera/video/microphone, GPS movement, touch signatures, Safari installation and native screenshot/pixel comparison were not performed. Shared source/layout reuse is not proof of pixel equality on every device.
- Firebase activation is **explicitly deferred by the user**. Web configuration/VAPID and server Admin credentials are absent; background push is not claimed active. Token lifecycle/topic bridge code and in-app polling are present.
- A pure browser PWA cannot acquire GPS positions after closing. The live drive needs a visible active page. Wake lock, durable telemetry, wall-clock elapsed time and recovery are implemented. Background Sync is browser-dependent; unsupported browsers resume saved work when reopened. Background authorization is cleared on logout.

## Handoff

The ready production output is dist/. Run npm run preview and open http://localhost:4173, or use npm run dev for development. npm run serve adds the optional authenticated Firebase topic bridge; configure its server-only credentials when Firebase activation resumes.

C: was full during this work. Browser temporary files were moved into the ignored project .tmp directory on D:; scripts/run-e2e.mjs now does this automatically. This did not prevent the final checks from passing.
