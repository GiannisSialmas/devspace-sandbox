#!/usr/bin/env bash
# Run via `devspace run set-admin-token`. Stores the admin token in the backend-admin Secret and
# restarts the backend. Prompts (hidden) unless ADMIN_TOKEN is set. An empty token deletes the
# Secret, so POST /api/visits/reset needs no password again. Not a DevSpace var on purpose: DevSpace
# resolves every ${VAR} in devspace.yaml on every run, so it would ask on build/deploy/purge.
set -euo pipefail
ns="${1:?namespace}"

if [ -z "${ADMIN_TOKEN+set}" ]; then
  read -rsp "Admin password (empty removes it): " ADMIN_TOKEN
  echo
fi

if [ -z "$ADMIN_TOKEN" ]; then
  kubectl -n "$ns" delete secret backend-admin --ignore-not-found
else
  printf %s "$ADMIN_TOKEN" | kubectl -n "$ns" create secret generic backend-admin \
    --from-file=token=/dev/stdin --dry-run=client -o yaml | kubectl apply -f -
fi

kubectl -n "$ns" rollout restart deployment -l app=backend
echo "Backend restarts with the new token. A dev-mode backend waits for \`devspace dev\` to sync again."
