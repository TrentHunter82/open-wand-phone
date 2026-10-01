#!/bin/bash
# Run with: bash start-mac.command [agent options]
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This launcher is for macOS. Use start.bat on Windows."
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Install Python 3.11 or newer from python.org, then run this launcher again."
  exit 1
fi
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "Python 3.11 or newer is required.")'
if [[ ! -x .venv-mac/bin/python ]]; then
  python3 -m venv .venv-mac
fi
if ! .venv-mac/bin/python -c 'import aiohttp, qrcode, cryptography, Quartz' >/dev/null 2>&1; then
  .venv-mac/bin/python -m pip install -r requirements.txt
fi
echo "Keep this Terminal window open. Press Control+C to stop OPEN WAND."
exec .venv-mac/bin/python agent.py "$@"
