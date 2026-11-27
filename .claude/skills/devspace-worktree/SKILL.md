---
name: devspace-worktree
description: Start or tear down an isolated copy of the sandbox app in its own git worktree, Kubernetes namespace, Ingress host and local ports, so several agents (or people) can run `devspace dev` side by side on the same k3d cluster. Use when asked to work on this repo in a separate worktree, in parallel with other work, or to clean one up.
---

# DevSpace in a git worktree

Each copy gets its own worktree, namespace, Ingress host and local ports. Everything else
(cluster, registry, images) is shared and safe to share: image tags are per build hash and
`.devspace/` (cache) is gitignored, so it's per worktree.

## Pick a name and a slot

- `<name>`: lowercase letters, digits and `-` only, e.g. `feat-login`. It becomes the branch,
  the namespace (`sandbox-<name>`) and the host (`<name>.devspace.test`).
- `<n>`: a slot from 1 to 9 that no other copy uses. It picks the local ports:

| Var | Main checkout | Slot `<n>` |
|---|---|---|
| `FRONTEND_LOCAL_PORT` | 3001 | `310<n>` |
| `BACKEND_LOCAL_PORT` | 4000 | `410<n>` |
| `DEBUG_LOCAL_PORT` (only with `-p debug`) | 9229 | `930<n>` |

Check the ports are free first: `ss -ltn | grep -E ':(310<n>|410<n>|930<n>) '` should print nothing.
`git worktree list` and `kubectl get ns` show which names are taken.

## Start

From the main checkout:

```sh
git worktree add ../devspace-sandbox-<name> -b <name>
cd ../devspace-sandbox-<name>
APP_HOST=<name>.devspace.test FRONTEND_LOCAL_PORT=310<n> BACKEND_LOCAL_PORT=410<n> \
  devspace dev -n sandbox-<name>
```

- Always pass `-n sandbox-<name>`. Never run `devspace use namespace`: it changes the
  kube context that every checkout shares.
- `devspace dev` blocks until stopped. Run it as a background task you can stop later, not
  with `nohup` or `&` in a shell you lose track of. It's ready when it prints
  `Ready: http://<name>.devspace.test:8081`.
- `GREETING` is a question var. With no terminal attached, DevSpace uses its default; set
  `GREETING=...` to choose one.

## Reach the app

- Port-forwards, no setup: `http://localhost:310<n>` (frontend), `http://localhost:410<n>/api/hello` (backend).
- Through the Ingress without DNS: `curl -H 'Host: <name>.devspace.test' http://127.0.0.1:8081/`
- In a browser: `/etc/hosts` needs `127.0.0.1 <name>.devspace.test`. That needs `sudo`, so ask
  the user to add it; don't edit `/etc/hosts` yourself.

`devspace run <command>` in the worktree needs the same env vars (at least `APP_HOST`) and the
namespace flag **before** `run` (after the command name it's passed to the command instead):
`APP_HOST=<name>.devspace.test devspace -n sandbox-<name> run reset-visits`.

## Tear down

From the worktree, after stopping `devspace dev`:

```sh
devspace purge -n sandbox-<name>
kubectl delete namespace sandbox-<name>
cd ../devspace-sandbox
git worktree remove ../devspace-sandbox-<name>   # refuses if there are uncommitted changes
```

Delete the branch (`git branch -d <name>`) only once its work is merged or the user says so.
If the user added an `/etc/hosts` line, tell them it can go.
