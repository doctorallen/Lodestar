#!/bin/sh
# Static checks: every script parses, index.html and js/ agree with each
# other, and no global is declared in two files (they all share one scope, so
# the second would silently replace the first).
set -e
cd "$(dirname "$0")/.."

for f in js/*.js test/*.js; do node --check "$f"; done

grep -o 'src="js/[^"]*"' index.html | cut -d'"' -f2 | while read -r f; do
  test -f "$f" || { echo "index.html names a missing script: $f"; exit 1; }
done
for f in js/*.js; do
  grep -q "src=\"$f\"" index.html || { echo "$f is not loaded by index.html"; exit 1; }
done
for f in $(grep -o 'href="[^"]*"' index.html | cut -d'"' -f2 | grep -v '^http' | grep -v '^#'); do
  test -f "$f" || { echo "index.html links a missing file: $f"; exit 1; }
done

# the installed game (sw.js, manifest.webmanifest): the worker parses and
# keeps its stamp for the deploy, and every icon the manifest names is there
node --check sw.js
grep -q "'__BUILD__'" sw.js || { echo "sw.js lost its __BUILD__ stamp"; exit 1; }
node -e "const m = JSON.parse(require('fs').readFileSync('manifest.webmanifest', 'utf8')); for (const i of m.icons) if (!require('fs').existsSync(i.src)) { console.log('manifest.webmanifest names a missing icon: ' + i.src); process.exit(1); }"
for f in $(grep -o "'icons/[^']*'" sw.js | tr -d "'"); do test -f "$f" || { echo "sw.js caches a missing file: $f"; exit 1; }; done

dups=$(grep -hoE '^(function|const|let|var|class) [A-Za-z0-9_$]+' js/*.js | awk '{print $2}' | sort | uniq -d)
if [ -n "$dups" ]; then echo "declared in more than one file: $dups"; exit 1; fi

# floor generation may only use the seeded generator
if grep -v '^//' js/floor.js | grep -n 'Math\.random'; then echo "floor generation must use the seeded generator"; exit 1; fi
echo "check: ok"
