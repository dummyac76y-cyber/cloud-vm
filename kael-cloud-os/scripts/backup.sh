#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tar -czf "backups/kael-cloud-os-$stamp.tar.gz" --exclude='./node_modules' --exclude='./dist' --exclude='./backups' --exclude='./data/.access-key' --exclude='./.git' --exclude='./*.log' .
echo "Backup saved: backups/kael-cloud-os-$stamp.tar.gz"