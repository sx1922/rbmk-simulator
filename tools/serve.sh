#!/bin/bash

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8000

echo "Starting dev server at http://localhost:$PORT"
echo "Press Ctrl+C to stop."

# Open browser automatically
case "$(uname -s)" in
  Linux*)   xdg-open "http://localhost:$PORT" 2>/dev/null &;;
  Darwin*)  open "http://localhost:$PORT" 2>/dev/null &;;
  CYGWIN*|MINGW*|MSYS*) start "http://localhost:$PORT" 2>/dev/null &;;
esac

cd "$DIR" && python3 -m http.server "$PORT"
