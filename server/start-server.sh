#!/usr/bin/env bash

set -u

echo "Starting Creator's Toolkit Server..."
echo

# Change to script directory
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required but was not found in PATH."
    exit 1
fi

exec node launcher.js
