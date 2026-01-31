#!/bin/sh
set -e

echo "Syncing static files to shared volume..."
# Copy all files from /app/dist (built-in) to /usr/share/caddy (volume mount)
cp -ru /app/dist/. /usr/share/caddy/

echo "Static files synced. Keeping container alive..."
exec sleep infinity
