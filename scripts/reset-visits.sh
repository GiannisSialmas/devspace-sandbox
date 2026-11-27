#!/usr/bin/env bash
# Run via `devspace run reset-visits`. With no admin token set (no backend-admin Secret) the reset
# needs nothing. Once one is set with `devspace run set-admin-token`, this asks for it (hidden),
# unless ADMIN_TOKEN is set in the environment. It only checks that the Secret exists; it never
# reads the token, so the backend is what checks the password.
set -euo pipefail
ns="${1:?namespace}" url="${2:?app url}"

auth=()
if kubectl -n "$ns" get secret backend-admin >/dev/null 2>&1; then
  if [ -z "${ADMIN_TOKEN+set}" ]; then
    read -rsp "Admin password: " ADMIN_TOKEN
    echo
  fi
  auth=(-H "Authorization: Bearer $ADMIN_TOKEN")
fi

curl -fsS -X POST "${auth[@]}" "$url/api/visits/reset"
echo
