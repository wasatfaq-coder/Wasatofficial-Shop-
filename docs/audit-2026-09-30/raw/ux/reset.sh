#!/bin/bash
# wipe emulator db and (unless EMPTY=1) seed
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/ai-studio-applet-webapp-e9574/databases/ai-studio-manstyle-2b22f2fb-6b7b-4e97-90a0-bda904528869/documents" >/dev/null
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/ai-studio-applet-webapp-e9574/accounts" >/dev/null
cd /home/user/Wasatofficial-Shop-
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=ai-studio-applet-webapp-e9574 bun /tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/design/seed.ts
