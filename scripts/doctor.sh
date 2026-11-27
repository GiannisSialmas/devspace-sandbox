#!/bin/sh
# Run via `devspace run doctor`. $1 is the HOSTS_ENTRY var from devspace.yaml (present|missing),
# $2 the APP_HOST var.
ok=true host=$2
check() { # check <label> <command...>
  label=$1; shift
  if "$@" >/dev/null 2>&1; then echo "ok    $label"; else echo "FAIL  $label"; ok=false; fi
}

check "/etc/hosts has $host" test "$1" = present
check "k3d cluster devspace-sandbox is running" sh -c 'k3d cluster list devspace-sandbox --no-headers | grep -q " 1/1 "'
check "image registry answers on localhost:5111" curl -fsS http://localhost:5111/v2/
check "ingress answers on $host:8081" curl -fsS -o /dev/null "http://$host:8081/"

$ok
