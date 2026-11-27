# devspace-sandbox

A sandbox for trying out [DevSpace](https://www.devspace.sh): a small full-stack app
(Next.js frontend + Node backend) developed live against a local
[k3d](https://k3d.io) cluster.

This experiment was planned and built through
[GitHub issues](https://github.com/GiannisSialmas/devspace-sandbox/issues?q=is%3Aissue),
one per step, each closed by a pull request.

## Layout

```
backend/        Express API (/api/hello, /api/visits, /api/visits/reset, /api/health)
frontend/       Next.js 16 (App Router). Server-renders data from the backend over the in-cluster Service
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
  On every page load it fetches `${BACKEND_URL}/api/hello` (`http://backend:4000` in the
  cluster) straight from the frontend pod, and the browser
  receives finished HTML.
- **The browser goes through a proxy.** [`visit-button.js`](frontend/app/visit-button.js) is
  a client component that sends `POST /api/visits` to the page's own origin. The route handler
  [`app/api/[...path]/route.js`](frontend/app/api/%5B...path%5D/route.js) forwards any
  `/api/*` request to `BACKEND_URL` (method, body, status, query string).

```
page load:  browser ─► frontend (server component) ─────────────► backend Service
button:     browser ─► frontend /api/* (route handler proxy) ───► backend Service
```

## Notes and gotchas

- **The visit counter is in memory** on purpose: it resets on every hot reload, so you can
  see reloads happen. A real app would keep it in a backing service (Redis, Postgres).
