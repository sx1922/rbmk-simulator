#!/bin/bash

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$DIR/src"
DIST="$DIR/dist"
CSS="$SRC/css/style.css"

mkdir -p "$DIST"

CSS_INLINE=$(cat "$CSS")

cat "$SRC/index.html" | sed "/<link rel=\"stylesheet\" href=\"css\/style.css\">/c\\
<style>$CSS_INLINE</style>" > "$DIST/index.html.tmp"

# Build JS in load order: config -> state -> utils/* -> physics/* -> systems/* -> ui/* -> audio/* -> main.js
JS_FILES=(
  "$SRC/js/config.js"
  "$SRC/js/state.js"
  "$SRC/js/utils/math.js"
  "$SRC/js/utils/format.js"
  "$SRC/js/utils/save.js"
  "$SRC/js/physics/neutron.js"
  "$SRC/js/physics/reactivity.js"
  "$SRC/js/physics/thermal.js"
  "$SRC/js/physics/xenon.js"
  "$SRC/js/physics/turbine.js"
  "$SRC/js/physics/az5.js"
  "$SRC/js/physics/protection.js"
  "$SRC/js/systems/economy.js"
  "$SRC/js/systems/politics.js"
  "$SRC/js/systems/personnel.js"
  "$SRC/js/systems/maintenance.js"
  "$SRC/js/systems/events.js"
  "$SRC/js/systems/mission.js"
  "$SRC/js/ui/instruments.js"
  "$SRC/js/ui/charts.js"
  "$SRC/js/ui/dialogs.js"
  "$SRC/js/ui/panels.js"
  "$SRC/js/ui/render.js"
  "$SRC/js/audio/audio.js"
  "$SRC/js/main.js"
)

JS_BUNDLE=""
for f in "${JS_FILES[@]}"; do
  if [ -f "$f" ]; then
    JS_BUNDLE+="$(cat "$f")"$'\n'
  fi
done

# Remove all <script src="..."> and insert inline bundle in one step
# Replace the last </body> line: inject script tag before </body>
BODY_TAG=$(grep -n '</body>' "$DIST/index.html.tmp" | head -1 | cut -d: -f1)
sed -i "s|<script src=\"js/[^\"]*\\.js\"><\\/script>||g" "$DIST/index.html.tmp"

# Inject bundled JS just before </body>
sed -i "s|</body>|<script>$JS_BUNDLE</script></body>|" "$DIST/index.html.tmp"

mv "$DIST/index.html.tmp" "$DIST/index.html"
echo "Build complete: $DIST/index.html"
