#!/bin/bash
# Wrapper for launchd: loads nvm's node into PATH, cd's into backend, runs the scheduler.
set -e
export PATH="/Users/paiin/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/paiin/usdc-treasury-build/backend
exec npm run scheduler
