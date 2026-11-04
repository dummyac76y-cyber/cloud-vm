# Kael Cloud OS

A clean, responsive, **local-first** web desktop for a Linux VM. Monitor system resources, inspect project files, view coding-agent states and run predefined diagnostics without exposing an unrestricted shell.

**Version:** 0.1.0 initial release. This is a web application, not a replacement Linux operating system.

## Features
- Desktop-like React UI with dark and light modes, responsive mobile navigation, restrained transitions.
- CPU, memory, storage, uptime, process list, and Desktop Commander/recovery signals.
- Protected read-only file explorer inside the app's own workspace directory. Text preview and download.
- Installed vs authenticated state for CLI agents; no paid model usage.
- Fixed allowlist of diagnostics, Git status, build and test jobs; local SQLite audit history.
- Random access key required by every API route. Server binds to localhost only.

## Requirements
Linux, non-root account, Node.js 22+, npm, Git, about 500MB free disk for dependencies. No Docker, root, paid AI subscription or cloud provider API key needed.

## Install (GitHub)

    git clone --branch kael-cloud-os-v0.1.0 --single-branch https://github.com/dummyac76y-cyber/cloud-vm.git
    cd cloud-vm/kael-cloud-os
    bash scripts/install.sh
    npm start

Open http://127.0.0.1:4317 on the VM or through an **already authenticated and separately authorized local tunnel**. Do not publicly expose this port.

In a second terminal run:

    node scripts/access-key.mjs

Paste the access key into the login page. Never share it, commit it or store it in screenshots. It lives in data/.access-key, excluded from Git.

The source is on a dedicated branch and folder of the existing public cloud-vm repository; existing default branch files remain unchanged.

## Development

    npm install
    npm run dev       # frontend on localhost:5173
    npm start         # backend in another terminal
    npm test
    npm run build
    node scripts/smoke.mjs   # server must be running

## Backup and rollback

    bash scripts/backup.sh

A compressed copy is stored privately in backups/. The app does not modify system services, other repositories, saved remote-control identity or the existing recovery keeper. Stop only the Kael Cloud OS server to roll back.

## Security

- HTTP listens on 127.0.0.1 only, never 0.0.0.0 by default.
- No external network exposure or public reverse proxy was configured.
- Only the app's workspace/ directory is browsable; symlinks, hidden paths and traversal are rejected.
- Task Console commands are fixed presets, not arbitrary shell input.
- See docs/SECURITY.md, docs/QA.md.

## License
MIT; see LICENSE.