#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: require_values.sh <channel_title> <variable_name> [variable_name ...]" >&2
  exit 2
fi

channel_title="$1"
shift
output_file="${GITHUB_OUTPUT:-/dev/stdout}"

for variable_name in "$@"; do
  if [[ ! "$variable_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "invalid variable name: ${variable_name}" >&2
    exit 2
  fi
  if [ -z "${!variable_name:-}" ]; then
    echo "::notice title=${channel_title}::${variable_name} is not available, so the ${channel_title} update is skipped."
    echo "enabled=false" >>"$output_file"
    exit 0
  fi
done

echo "enabled=true" >>"$output_file"
