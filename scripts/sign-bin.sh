#!/bin/bash
set -e

BIN="$1"
if [ -z "$BIN" ]; then
    echo "Usage: $0 <binary>" >&2
    exit 1
fi

# On macOS (especially Apple Silicon), AMFI kills unsigned binaries at launch
# with SIGKILL ("load code signature error 4"). `bun build --compile` embeds a
# malformed code signature that `codesign -d` treats as "not signed at all", so
# we strip it and apply a fresh ad-hoc signature.
if [ "$(uname -s)" = "Darwin" ]; then
    codesign --remove-signature "$BIN"
    codesign --sign - --force "$BIN"
fi
