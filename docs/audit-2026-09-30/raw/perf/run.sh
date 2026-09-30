set -e
DATASET=$DATASET FIRESTORE_EMULATOR_HOST=127.0.0.1:8380 bun /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/seed.ts
node /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/perf/serve.mjs /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/dist 3300 > /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/serve.log 2>&1 &
SP=$!
sleep 1
node /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/measure.mjs /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/${OUTNAME}.json ${RUNS:-3} || echo MEASURE FAILED
kill $SP
