#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: render_template.sh <template> <output> [KEY=value ...]" >&2
  exit 2
fi

template_path="$1"
output_path="$2"
shift 2

shopt -u patsub_replacement 2>/dev/null || true

content="$(cat "$template_path")"

for pair in "$@"; do
  key="${pair%%=*}"
  value="${pair#*=}"
  if [[ ! "$key" =~ ^[A-Z0-9_]+$ ]] || [ "$key" = "$pair" ]; then
    echo "invalid substitution: ${pair}" >&2
    exit 2
  fi
  pattern="@${key}@"
  content="${content//"$pattern"/$value}"
done

if unresolved="$(grep -oE '@[A-Z0-9_]+@' <<<"$content")"; then
  echo "unresolved placeholders in ${template_path}:" >&2
  sort -u <<<"$unresolved" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_path")"
printf '%s\n' "$content" >"$output_path"
