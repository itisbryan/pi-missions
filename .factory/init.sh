#!/bin/bash
# Idempotent environment setup for pi-mission
set -e
cd "$(dirname "$0")/.."

# Install typescript for type checking (dev dependency)
if ! npx tsc --version &>/dev/null; then
  npm install --save-dev typescript @types/node 2>/dev/null || true
fi

echo "Environment ready."
