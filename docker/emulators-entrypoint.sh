#!/bin/sh
# Boots the Firebase Emulator Suite against the /data volume. Exports go to a
# subdirectory: the exporter recreates its target directory, which fails with
# EBUSY on the mount point itself. --import fails on a missing directory, so
# only pass it once an export exists.
set -eu
EXPORT_DIR=/data/export
mkdir -p /data
IMPORT=""
if [ -f "$EXPORT_DIR/firebase-export-metadata.json" ]; then
  IMPORT="--import $EXPORT_DIR"
fi
# shellcheck disable=SC2086
exec firebase emulators:start --project demo-learnwren $IMPORT --export-on-exit "$EXPORT_DIR"
