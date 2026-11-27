# devspace-sandbox

A sandbox for trying out [DevSpace](https://www.devspace.sh): a small full-stack app
(Next.js frontend + Node backend) developed live against a local
[k3d](https://k3d.io) cluster.

This experiment was planned and built through
[GitHub issues](https://github.com/GiannisSialmas/devspace-sandbox/issues?q=is%3Aissue),
one per step, each closed by a pull request.

## What is DevSpace?

DevSpace is an open-source CLI for developing, deploying and debugging apps on Kubernetes.
You describe your images, deployments and dev setup in one `devspace.yaml`, then:

- `devspace dev` builds your images and deploys the app, then switches it to dev mode:
  each pod is replaced by one that runs your app's dev server (e.g. `next dev`,
  `node --watch`), and your local files are synced into it, so the dev server reloads as soon
  as you save. It also forwards ports to localhost and streams the logs to your terminal.
- `devspace deploy` builds your images and deploys the app, without dev mode. Useful as a
  last check that your changes also work in the production images, before you push.
- `devspace purge` removes what it deployed.

In this repo DevSpace is only a development tool: production builds and releases would be a
CI/CD job, not `devspace deploy`.

It runs entirely client-side: nothing gets installed in the cluster besides your app (a
small sync helper is injected into dev containers).

| | |
|---|---|
| CNCF status | **Sandbox** project, accepted 2022-12-13 ([CNCF page](https://www.cncf.io/projects/devspace/)) |
| Created by | [Loft Labs](https://loft.sh) (also behind vCluster) |
| First commit | 2018-08-17 |
| License | Apache-2.0 |
| Repo | [devspace-sh/devspace](https://github.com/devspace-sh/devspace) (~5.2k stars) |
| Version used here | v6.3.21 (latest release as of 2026-11-19, published 2026-04-22) |
| Similar tools | Tilt, Skaffold, Garden, Okteto, Telepresence / mirrord |

## Layout

```
backend/        Express API (/api/hello, /api/visits, /api/visits/reset, /api/health)
frontend/       Next.js 16 (App Router). Server-renders data from the backend over the in-cluster Service
k8s/            Plain manifests: Deployments, Services
devspace.yaml   Images and deployments
k3d/            k3d cluster config: 1 server, 1 agent, local image registry
```

## The app

Two services, both configured through env vars and logging to stdout.

**Backend** ([`backend/server.js`](backend/server.js)): a small Express API on port `4000`.

| Endpoint | Returns |
|---|---|
| `GET /api/hello` | Greeting (`GREETING`), version (`APP_VERSION`), pod name, Node version, start time, visit count |
| `POST /api/visits` | Bumps the visit counter (in memory, so it resets on restart) |
| `POST /api/visits/reset` | Resets the counter. No authentication by default. With `ADMIN_TOKEN` set, it needs `Authorization: Bearer <token>` |
| `GET /api/health` | `{"status":"ok"}`, used by the readiness probe |

**Frontend** ([`frontend/app/`](frontend/app/)): Next.js 16 (App Router) on port `3000`.
It's the only thing the browser talks to; the backend is internal to the cluster.

- **Pages fetch server side.** [`page.js`](frontend/app/page.js) is a server component.
  On every page load it fetches `${BACKEND_URL}/api/hello` (`http://backend:4000`, set in
  [`k8s/frontend.yaml`](k8s/frontend.yaml)) straight from the frontend pod, and the browser
  receives finished HTML.
- **The browser goes through a proxy.** [`visit-button.js`](frontend/app/visit-button.js) is
  a client component that sends `POST /api/visits` to the page's own origin. The route handler
  [`app/api/[...path]/route.js`](frontend/app/api/%5B...path%5D/route.js) forwards any
  `/api/*` request to `BACKEND_URL` (method, body, status, query string).

```
page load:  browser ─► frontend (server component) ─────────────► backend Service
button:     browser ─► frontend /api/* (route handler proxy) ───► backend Service
```

## Prerequisites

- Docker and k3d.
- The DevSpace CLI, see [Install DevSpace](#install-devspace).

## Install DevSpace

DevSpace is a single static binary. This puts v6.3.21 in `~/.local/bin` (no root; make sure
it's on your `PATH`) and checks it against the release checksum:

```sh
V=v6.3.21; B=https://github.com/devspace-sh/devspace/releases/download/$V
cd "$(mktemp -d)"
curl -fsSLO "$B/devspace-linux-amd64" -fsSLO "$B/devspace-linux-amd64.sha256"
echo "$(cut -d' ' -f1 devspace-linux-amd64.sha256)  devspace-linux-amd64" | sha256sum -c
install -m 0755 devspace-linux-amd64 ~/.local/bin/devspace
devspace version
```

Use `devspace-linux-arm64` on ARM and `devspace-darwin-*` on macOS. Other options (npm,
Homebrew, Windows) are in the
[DevSpace install docs](https://www.devspace.sh/docs/getting-started/installation).
Uninstall with `rm ~/.local/bin/devspace`.

## The k3d cluster

[k3d](https://k3d.io) runs [k3s](https://k3s.io), a lightweight Kubernetes, as Docker
containers. Everything is in [`k3d/k3d-config.yaml`](k3d/k3d-config.yaml): cluster name,
node count, pinned k3s version (v1.31.1), ports and the image registry.

### Containers

| Container | What it does |
|---|---|
| `k3d-devspace-sandbox-server-0` | Control plane (API server, scheduler, etcd/SQLite). Also runs pods. |
| `k3d-devspace-sandbox-agent-0` | Worker node, runs pods. |
| `k3d-devspace-sandbox-serverlb` | Load balancer, the cluster's front door: `127.0.0.1:6444` → Kubernetes API, `:8081` → ingress (HTTP). |
| `devspace-sandbox-registry.localhost` | Image registry, `127.0.0.1:5111` on the host → `5000` in the container. |

### Images

1. DevSpace builds with the host's Docker and pushes to `localhost:5111`.
2. The nodes pull `localhost:5111/...` too. Inside a node, `localhost` is the node itself,
   so the `registries.config` block in the k3d config adds a k3s mirror that maps
   `localhost:5111` to the registry container (`devspace-sandbox-registry.localhost:5000`).

The registry name, port and mirror are set explicitly. k3d's defaults (generated name,
random host port) don't suit a config that needs a fixed image address.

### kubectl

`k3d cluster create` adds the context `k3d-devspace-sandbox` to `~/.kube/config` and makes
it the current context, pointing at `https://127.0.0.1:6444`. So kubectl works right away:

```sh
kubectl get nodes
kubectl get pods,svc,ingress
```

DevSpace uses the same `~/.kube/config`, so the app runs in the `default` namespace.

Pause and resume without losing state: `k3d cluster stop devspace-sandbox` /
`k3d cluster start devspace-sandbox`.

## Run it

```sh
k3d cluster create -c k3d/k3d-config.yaml          # cluster + registry on localhost:5111
devspace deploy                                     # build, push, deploy
kubectl port-forward svc/frontend 3001:3000         # then open http://localhost:3001
```

## Stop / clean up

```sh
devspace purge                                      # remove the app
k3d cluster delete -c k3d/k3d-config.yaml           # remove cluster + registry
```

## Notes and gotchas

- **Non-default ports** (API `6444`, HTTP `8081`) to avoid clashing with other local
  clusters on the usual `6443` / `8080`.
- **Registry is pushed to as `localhost:5111`.** The host Docker daemon doesn't use
  systemd-resolved, so it can't resolve `*.localhost` registry names. k3s gets a mirror
  entry mapping `localhost:5111` to the registry container instead (see `k3d/k3d-config.yaml`).
- **`localRegistry: enabled: false`.** Otherwise DevSpace 6.3 spins up its own registry
  inside the cluster and builds there.
- **The visit counter is in memory** on purpose: it resets on every hot reload, so you can
  see reloads happen. A real app would keep it in a backing service (Redis, Postgres).
