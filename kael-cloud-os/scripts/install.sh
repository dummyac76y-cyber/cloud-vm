#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then echo "Run as a normal user, not root."; exit 1; fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Requires Node.js 22+ and npm."; exit 1
fi
node -e 'if(+process.versions.node.split(".")[0]<22)process.exit(1)' || { echo "Requires Node.js 22 or later"; exit 1; }
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run build
echo "Kael Cloud OS installed. Start: npm start"
echo "Open locally: http://127.0.0.1:4317"
echo "Retrieve private access key from a second terminal: node scripts/access-key.mjs"