#!/usr/bin/env bash
# Opens the live web app in Safari on a simulated iPhone and screenshots it.
#   tools/safari_check.sh https://iknalos.github.io/DriftAndBloom/
set -euo pipefail

URL=$1
OUT="$PWD/safari"
mkdir -p "$OUT"

# newest iOS runtime, preferring a plain "iPhone NN Pro"
read -r UDID NAME < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
devs = json.load(sys.stdin)["devices"]
def phones(k): return [d for d in devs[k] if d["name"].startswith("iPhone")]
runtimes = sorted((k for k in devs if ".iOS-" in k and phones(k)),
                  key=lambda k: [int(x) for x in re.findall(r"\d+", k)])
ps = phones(runtimes[-1])
pro = [d for d in ps if re.fullmatch(r"iPhone \d+ Pro", d["name"])]
d = (pro or ps)[0]
print(d["udid"], d["name"], "/", runtimes[-1].split(".")[-1])
')
echo "Simulator: $NAME ($UDID)"

xcrun simctl bootstatus "$UDID" -b
# Pages can take a moment to serve a fresh deploy everywhere
for _ in $(seq 30); do curl -fsS -o /dev/null "$URL" && break; sleep 5; done

# a freshly booted simulator sometimes times out launching Safari: retry
for i in 1 2 3; do xcrun simctl openurl "$UDID" "$URL" && break; echo "openurl timed out (try $i), retrying"; sleep 15; done
sleep 25
xcrun simctl io "$UDID" screenshot "$OUT/1-safari.png"
sleep 10
xcrun simctl io "$UDID" screenshot "$OUT/2-safari-later.png"
echo "Screenshots saved for $NAME"
