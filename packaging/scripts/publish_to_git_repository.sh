#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: publish_to_git_repository.sh <owner/repository> <commit_message> <source_path>=<destination_path> [...]" >&2
  exit 2
fi

: "${REPOSITORY_TOKEN:?REPOSITORY_TOKEN is required}"

repository="$1"
commit_message="$2"
shift 2

if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "invalid repository: ${repository}" >&2
  exit 2
fi

basic_auth="$(printf 'x-access-token:%s' "$REPOSITORY_TOKEN" | base64 | tr -d '\n')"
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::${basic_auth}"
fi

git_with_auth() {
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic_auth}" "$@"
}

work_dir="$(mktemp -d)"
git_with_auth clone --depth 1 "https://github.com/${repository}.git" "$work_dir"

for mapping in "$@"; do
  source_path="${mapping%%=*}"
  relative_destination="${mapping#*=}"
  if [ "$source_path" = "$mapping" ] || [[ "$relative_destination" == /* ]] || [[ "$relative_destination" == *..* ]]; then
    echo "invalid mapping: ${mapping}" >&2
    exit 2
  fi
  mkdir -p "$(dirname "${work_dir}/${relative_destination}")"
  cp "$source_path" "${work_dir}/${relative_destination}"
done

cd "$work_dir"
git add -A

if git diff --cached --quiet; then
  echo "${repository} is already up to date"
  exit 0
fi

git \
  -c user.name="${COMMIT_AUTHOR_NAME:-github-actions[bot]}" \
  -c user.email="${COMMIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}" \
  commit -m "$commit_message"

git_with_auth push origin HEAD
