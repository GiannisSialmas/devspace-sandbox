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
charts/backend/ Helm chart for the backend: Deployment, Service
k8s/            Plain manifests for the frontend: Deployment, Service
devspace.yaml   Vars, images, deployments, dev containers, hooks, pipelines, commands, profiles
pipelines/      Pipeline scripts, sourced from devspace.yaml
scripts/        Helpers for `devspace run` commands
k3d/            k3d cluster config: 1 server, 1 agent, local image registry
```

## The app

Two services, both configured through env vars and logging to stdout.

**Backend** ([`backend/server.js`](backend/server.js)): a small Express API on port `4000`.

| Endpoint | Returns |
|---|---|
| `GET /api/hello` | Greeting (`GREETING`), version (`APP_VERSION`), pod name, Node version, start time, visit count |
| `POST /api/visits` | Bumps the visit counter (in memory, so it resets on restart) |
| `POST /api/visits/reset` | Resets the counter. No authentication by default. Once an admin password is set (`backend-admin` Secret → `ADMIN_TOKEN` env), it needs `Authorization: Bearer <password>` |
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

Because the browser only uses relative URLs on its own origin, everything works the same
through the ingress (`app.devspace.test:8081`) and the port-forward (`localhost:3001`).
The proxy reads `BACKEND_URL` per request. Next's `rewrites` would fix it at build time
in a production image.

## Prerequisites

- Docker and k3d.
- `app.devspace.test` resolving to `127.0.0.1`, see [Local DNS](#local-dns).
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

## Local DNS

The ingress uses the hostname `app.devspace.test`. `.test` is a reserved TLD (RFC 2606) meant
for exactly this. Point it at your machine with one line in `/etc/hosts`:

```sh
echo '127.0.0.1 app.devspace.test' | sudo tee -a /etc/hosts
```

No DNS change at all? Send the Host header yourself:
`curl -H 'Host: app.devspace.test' http://127.0.0.1:8081/`

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

### Ingress

k3s ships [Traefik](https://traefik.io) as its ingress controller. The Ingress (the `ingress`
deployment in `devspace.yaml`) sends everything on the host `app.devspace.test` (`APP_HOST`)
to the frontend. The backend has no
ingress rule, so it isn't exposed outside the cluster (apart from the DevSpace port-forward).

```
browser → :8081 → serverlb → Traefik → frontend Service (3000) → backend Service (4000)
```

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
devspace dev                                        # Ctrl+C to stop
```

Then open:

| URL | What |
|---|---|
| http://app.devspace.test:8081 | App through the k3d load balancer + Traefik ingress |
| http://app.devspace.test:8081/api/hello | Backend, through the ingress and the Next.js proxy |
| http://localhost:3001 | Frontend, DevSpace port-forward |
| http://localhost:4000/api/hello | Backend directly, DevSpace port-forward |

Edit anything in `frontend/app/` or `backend/server.js` and it reloads in the cluster within a
second or two.

## Deployments

`deployments:` in `devspace.yaml` uses both of DevSpace's deployment types, one per service:

| Deployment | Type | Source |
|---|---|---|
| `backend` | `helm` | Local chart [`charts/backend/`](charts/backend/). `devspace.yaml` passes `image` as a value |
| `frontend` | `kubectl` | Plain manifests in [`k8s/`](k8s/): the frontend Deployment and Service |
| `ingress` | `kubectl` | `inlineManifest`: the Ingress, written inside `devspace.yaml` so `${APP_HOST}` gets filled in. DevSpace doesn't replace vars in `k8s/` files |

In both, DevSpace swaps image refs that match `images:` (here `localhost:5111/backend` in the
Helm values, `localhost:5111/frontend` in the manifest) for the freshly built tags.

Those are the only two types. Variants:

- **`kubectl`**: `kustomize: true` deploys a kustomize folder; `inlineManifest` takes YAML
  written inside `devspace.yaml`.
- **`helm`**: the chart can be a local folder, a chart repo or OCI. With no `chart:` at all,
  DevSpace uses its own generic "component chart", configured only through `values`.

DevSpace downloads the `helm` binary into `~/.devspace/bin` the first time it needs it, like
its own `kubectl`. The release shows up in `helm list` under the name `backend`.

## Variables

`devspace.yaml` uses one variable of each kind. By default (`source: all`) DevSpace takes a
value from your environment first and only asks if it isn't set, so
`GREETING=hi devspace dev` skips the question.

| Var | Kind | What it does |
|---|---|---|
| `REGISTRY` | static value | Registry prefix of the image names |
| `GREETING` | `question` + `default` | Backend greeting in dev mode. Asked once, then cached |
| `APP_VERSION` | `command` | `git rev-parse --short HEAD`, run every time, shown on the page |
| `FRONTEND_LOCAL_PORT` | `source: env` + `default` | Local port of the frontend port-forward (default `3001`). Never asked: `FRONTEND_LOCAL_PORT=3005 devspace dev` |
| `BACKEND_LOCAL_PORT`, `DEBUG_LOCAL_PORT` | `source: env` + `default` | Same for the backend (`4000`) and the debug profile's inspector (`9229`) |
| `APP_HOST` | `source: env` + `default` | Ingress host (default `app.devspace.test`); also fed to `ALLOWED_DEV_ORIGINS` |
| `HOSTS_ENTRY` | `command` | Checks `/etc/hosts` for `APP_HOST`, used by `devspace run doctor` |
| `APP_URL` | static value, built from a var | `http://${APP_HOST}:8081`, used by hooks and commands |

```sh
devspace list vars        # current values (cached answers included)
devspace reset vars       # forget cached answers, so questions are asked again
```

- **Cache:** question answers are stored encrypted in `.devspace/cache.yaml` (gitignored).
  `noCache` vars are never stored.
- **`alwaysResolve`:** in v6.3.21 every var is resolved on every run unless it sets
  `alwaysResolve: false`. Then it's resolved only when the run uses it. Leaving it unset counts
  as `true`, though the docs say the default is `false`; that's what the source code does
  (verified with `devspace print`). `GREETING` sets `false`, so `devspace run <command>` (which
  only loads `commands:`) doesn't ask for it.
- **A question var can't be limited to one command.** `dev`, `deploy`, `build` and `purge` load
  the whole file and resolve every `${VAR}` used anywhere in it, `commands:` included. A var
  asked on every run (`noCache`) would therefore prompt on `devspace purge` too. That's why the
  admin token isn't a DevSpace var: `set-admin-token` prompts for it itself, see
  [Commands](#commands). (`password: true` would hide the typing of a DevSpace question.)
- **Non-interactive runs** (CI, scripts) can't answer questions: pass every value as an env var
  or `--var NAME=value`.
- The vars are only wired into the dev containers (`dev.backend.env`). `k8s/` and the backend
  chart keep static values, so `devspace deploy` uses those.

## Commands

Shortcuts under `commands:` in `devspace.yaml`, run with `devspace run <name>`. `devspace list
commands` shows them with their descriptions, grouped by `section`.

| Command | What it does |
|---|---|
| `open` | Prints the app URL |
| `doctor` | Checks the `/etc/hosts` entry, the k3d cluster, the registry and the ingress ([`scripts/doctor.sh`](scripts/doctor.sh)) |
| `logs <backend\|frontend>` | Follows that service's logs (`devspace logs -f -l app=...`) |
| `shell <backend\|frontend>` | Opens a shell in that service's pod (`devspace enter -l app=...`) |
| `set-admin-token` | Prompts for an admin password (hidden; or `ADMIN_TOKEN=... devspace run set-admin-token`), stores it in the `backend-admin` Secret and restarts the backend. Empty removes it, so reset is open again ([`scripts/set-admin-token.sh`](scripts/set-admin-token.sh)) |
| `reset-visits` | Resets the visit counter through the ingress. No password set: just resets. Password set: asks for it (hidden; or `ADMIN_TOKEN=...`). It only checks whether the Secret exists and never reads the password itself ([`scripts/reset-visits.sh`](scripts/reset-visits.sh)) |

How the fields work:

- `command`: a shell script. Arguments after the name are `$1`, `$2`, ... Write `$1`, not
  `${1}`: DevSpace reads `${...}` as one of its own vars.
- `description` and `section`: only for `devspace list commands`.
- `after`: runs after the command, even when it fails. `$COMMAND_ERROR` holds the error;
  `reset-visits` uses it to print a hint.
- Not used here: `appendArgs` (add the CLI arguments to the end of `command`), `args` (run
  without a shell), `internal` (hidden, only callable from pipelines).

Commands work without `devspace dev` running: the dev pods keep running `next dev` /
`node --watch` on their own. Only sync, port-forwards and log streaming stop with it.

## Hooks

Scripts under `hooks:` in `devspace.yaml` that DevSpace runs on events in its normal flow. No
`container:` means the hook runs locally; with one, it runs inside a pod.

| Hook | Event | What it does |
|---|---|---|
| `preflight-registry` | `before:build` | Stops early with a clear message if the registry on `localhost:5111` is down |
| `failure-hint` | `error:build:*`, `error:deploy:*` | Prints `Try: devspace run doctor` when a build or deploy fails |
| `backend-smoke-test` | `after:initialSync:backend` | Runs inside the backend pod and waits until `/api/health` answers |
| `ready-banner` | `after:initialSync:frontend` | Prints `Ready: http://app.devspace.test:8081` |

### Events

- `before:` / `after:` / `error:` + `build`, `deploy`, `purge`, `initialSync`,
  `createPullSecrets`, `loadConfig`, and the `…Dependencies` variants.
- `start:` / `stop:` / `restart:` / `error:` + `sync`, `portForwarding`,
  `reversePortForwarding`.
- `devCommand:before:sync`, `devCommand:after:sync`, and the same for `portForwarding`.
- `skip:build:<image>`, when an image is unchanged and not rebuilt.
- Events about one image, deployment or dev container always end in `:<name>` or `:*`:
  `after:deploy:app`, `error:build:*`, `after:initialSync:backend`. **Plain `error:build` never
  fires.** `before:build` and `after:build` also exist once for the whole build step, which is
  what `preflight-registry` uses.

### Other hook options (not used here)

| Option | What it does |
|---|---|
| `upload` / `download` | Copy local files into a container, or out of it, instead of running a command |
| `wait` | Wait until the matched pod is running, or has exited with a given code |
| `logs` | Print the container's logs. Meant for containers that finish, like jobs or init containers |
| `background` | Don't wait for the hook to finish |
| `silent` | Hide the hook's output. In v6.3.21 this also hides it when the hook fails, so the reason is lost (only `exit status 1` remains). That's why `preflight-registry` silences `curl` itself |
| `os` | Only run on some operating systems, e.g. `os: linux,darwin` |
| `args` | Run `command` with these arguments directly, without a shell |
| `disabled` | Turn a hook off without deleting it |
| `container.once` | Run only once per container start |
| `container.pod`, `imageSelector`, `containerName`, `namespace` | Other ways to pick the container |
| `container.timeout` / `container.wait` | How long to wait for the container (default 150 s), or don't wait at all |

**Hooks vs pipelines:** hooks hang extra steps on the default flow. A pipeline replaces the
flow itself, and could run the same steps explicitly.

## Pipelines

`devspace dev`, `deploy`, `build` and `purge` each run a pipeline of the same name. Without a
`pipelines:` entry, DevSpace uses its built-in defaults (from the v6.3.21 source):

```sh
# devspace dev
run_dependencies --all
ensure_pull_secrets --all
build_images --all
create_deployments --all
start_dev --all

# devspace deploy: same as dev, without start_dev
run_dependencies --all
ensure_pull_secrets --all
build_images --all
create_deployments --all

# devspace build
run_dependencies --all --pipeline build
build_images --all

# devspace purge: the reverse order
stop_dev --all
purge_deployments --all
run_dependencies --all --pipeline purge
```

| Step | What it does here |
|---|---|
| `run_dependencies` | Runs the same pipeline in other DevSpace projects under `dependencies:`. None here, so nothing |
| `ensure_pull_secrets` | Creates image-pull secrets for registries that need a login. The local registry needs none |
| `build_images` | Builds everything under `images:`, skipping unchanged images |
| `create_deployments` | Deploys everything under `deployments:` (`backend` → Helm chart, `frontend` → `kubectl apply k8s/`) |
| `start_dev` | Starts everything under `dev:`: swaps the pods, then sync, port-forwards, logs |
| `stop_dev` / `purge_deployments` | Stops dev mode, then deletes what was deployed |

Defining `pipelines: dev:` with a `run:` script replaces the default for `devspace dev` only;
the others stay default. Custom pipelines run with `devspace run-pipeline <name>`.

### The `purge` override

This repo overrides only `purge`, to also delete the admin password Secret. `purge_deployments`
removes what's under `deployments:` (the chart and `k8s/`), but that Secret comes from `devspace run set-admin-token`.

```yaml
pipelines:
  purge:
    run: source ./pipelines/purge.sh
```

[`pipelines/purge.sh`](pipelines/purge.sh) is the default purge plus one `kubectl delete secret`.
`source` runs it inside DevSpace's pipeline shell, so `stop_dev` and the other functions work.
DevSpace doesn't fill in `${VAR}` in a sourced file, so it uses env vars like `$DEVSPACE_NAMESPACE`.

## Profiles

A profile is a named set of changes to `devspace.yaml`, turned on with `-p <name>`. Without
`-p`, nothing changes.

| Profile | What it changes |
|---|---|
| `debug` | Runs the backend with `node --inspect` and forwards the inspector to `localhost:9229` |

```sh
devspace dev -p debug        # then attach VS Code ("Attach to Node", port 9229) or chrome://inspect
devspace print -p debug      # show the config with the profile applied
```

A profile can change the config in three ways:

| Field | How |
|---|---|
| `patches` | Precise edits: `op: replace / add / remove` at a `path` (used here; `add` on a list appends) |
| `merge` | Deep-merges a YAML block on top of the config |
| `replace` | Replaces whole top-level sections |

`activation` can also turn a profile on automatically, for example when an env var is set.

## Stop / clean up

```sh
devspace reset pods                                 # swap the dev containers back to the built images
devspace purge                                      # remove the app (and the admin password)
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
- **Frontend dev image is a Dockerfile stage** (`target: dev`) with `node_modules` baked in.
  Running `npm ci` inside the dev pod on every start was slow and hit flaky in-cluster DNS.
- **Backend dev image is the built image itself** (`${runtime.images.backend.image}`), since
  it already has the production deps. `/app` belongs to `node`, the user the container runs
  as, so DevSpace's sync can write into it. Its sync has no `startContainer: true`: as a
  non-root user, DevSpace's restart helper can't create its start file in the root-owned
  `/.devspace`, so the app would wait forever. The image already has the code, so it starts
  right away and `node --watch` restarts on the first synced change.
- **Sync excludes come from two places.** Inline `excludePaths` in `devspace.yaml` for what
  must never sync (`node_modules/`, `.next/`: the image and `next dev` provide them), and
  `excludeFile: .devspaceignore` for local clutter (`.env*`, logs, coverage). DevSpace has no
  built-in `.devspaceignore`: the name is this repo's convention, and the path is relative to
  the synced folder (`backend/.devspaceignore`), not to `devspace.yaml`.
- **The visit counter is in memory** on purpose: it resets on every hot reload, so you can
  see reloads happen. A real app would keep it in a backing service (Redis, Postgres).
- **`allowedDevOrigins` for `next dev`.** Next.js dev mode only serves its JS to `localhost`.
  Through the ingress host the page rendered but never hydrated, so the button did nothing.
  `ALLOWED_DEV_ORIGINS=app.devspace.test` (set in `devspace.yaml`) feeds `next.config.mjs`.
