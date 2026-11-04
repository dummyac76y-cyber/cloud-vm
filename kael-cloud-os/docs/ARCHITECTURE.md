# Architecture

Kael Cloud OS v0.1.0 is a local-first browser interface, not a replacement Linux OS.

- Frontend: React / Vite; responsive mobile and desktop shell.
- API: Node.js built-in HTTP server listening on 127.0.0.1:4317.
- Persistence: node:sqlite activity database in data/ (excluded from source control).
- Identity: random 32-byte local bearer key stored with mode 0600 in data/.access-key.
- Files: read-only workspace/ directory, symlink, dotfile, and traversal restrictions.
- Task console: predefined commands only; no arbitrary shell runner.
- Agents: read-only detection of existing local CLI tools and sign-in state.
- Service ownership: a normal user process, separate from Desktop Commander or rdc-keeper.

## Non-goals
Cloud hosting, remote multi-user service, arbitrary SSH/web shell, kernel modifications, replacing recovery scripts, model subscriptions, bypassing hosting provider lifecycle restrictions.

## Recovery
Application state is on disk and can be backed up independently. The VM may archive or suspend the process. No uptime guarantee is made. Existing Desktop Commander pairing and recovery remain separate.