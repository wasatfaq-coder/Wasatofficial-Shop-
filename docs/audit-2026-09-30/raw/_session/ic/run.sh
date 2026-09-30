set -e
S=/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad
ROOT=/home/user/Wasatofficial-Shop-
PORT=3100
bun $S/design/seed.ts
cd $ROOT
VITE_USE_EMULATORS=true bunx vite --port $PORT --strictPort --host 127.0.0.1 > $S/ic/vite.log 2>&1 &
VP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$PORT/ && break; sleep 1; done
export BASE=http://127.0.0.1:$PORT/
for spec in $SPECS; do node $S/ic/${spec%%:*}.mjs $S/ic/$TAG-${spec//:/-} ${spec##*:} || echo "$spec failed"; done
kill $VP
