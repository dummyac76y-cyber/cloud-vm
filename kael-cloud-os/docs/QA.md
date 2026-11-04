# Kael Cloud OS — QA register

Version: 0.1.0 (local-first prototype)

## Verification completed
- PASS — Production build with Vite on freestyle-vm.
- PASS — 14 Node.js unit tests for path safety, file preview, token comparison, redaction.
- PASS — 9 HTTP smoke tests: private health, authentication, origin rejection, telemetry, file scoping, forbidden task, agent listing.
- PASS — Server listener is 127.0.0.1:4317 only; not exposed externally.
- PASS — Existing Remote Desktop Commander device pairing file preserved at original path.
- PASS — Existing rdc-keeper process remains running, without replacement.
- PASS — Backend runs as a non-root user.
- PASS — Source folder isolated from existing rdc-keeper and original Git project.
- PASS — Agent sign-in requires separate authorization; no paid AI model used.

## Additional checks still needed
- NOT TESTED — Full UI interactions in a real browser (Chromium on target VM requires uninstalled system libraries). No root permissions used to install them.
- NOT TESTED — 360px Android viewport screenshots or keyboard-only navigation.
- NOT TESTED — Browser accessibility audit (WCAG AA), screen reader behavior.
- NOT TESTED — Restart after VM archive/resume; provider lifecycle cannot be bypassed.
- NOT TESTED — Remote publication / HTTPS and external authentication (separate approval required).
- NOT TESTED — Multi-user access, because this release is designed as single-user local-only.

## Security architecture
- API requires 256-bit locally generated access key; stored in ignored data/ and never committed.
- No unrestricted shell or arbitrary external filesystem paths.
- Task execution: allowlisted commands only, user-level privileges, fixed timeouts.
- SQLite activity log excludes secret-bearing stdout and stores action/result only.
- No external listener. No external deployment or paid cloud resources.

## Observed browser-test limitation
A bundled Chromium binary was found, but failed with missing libnspr4.so and other user-space shared libraries. User-level browser testing must use a compatible supported browser environment; the project must not silently install system dependencies or acquire root privileges.