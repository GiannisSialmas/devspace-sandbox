// Small JSON API on Express. Config via env vars, logs to stdout.
const express = require("express");
const os = require("node:os");

const PORT = Number(process.env.PORT || 4000);
const GREETING = process.env.GREETING || "Hello from the backend";
const APP_VERSION = process.env.APP_VERSION || "unknown";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // empty: admin endpoints need no token
const startedAt = new Date().toISOString();
let visits = 0; // in-memory on purpose: resets on restart, which makes hot reloads visible

const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

const requireAdmin = (req, res, next) =>
  ADMIN_TOKEN === "" || req.headers.authorization === `Bearer ${ADMIN_TOKEN}`
    ? next()
    : res.status(401).json({ error: "unauthorized" });

const app = express();

app.use((req, res, next) => {
  if (req.path !== "/api/health")
    res.on("finish", () => log("request", { method: req.method, url: req.originalUrl, status: res.statusCode }));
  next();
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/hello", (req, res) =>
  res.json({ message: GREETING, version: APP_VERSION, pod: os.hostname(), node: process.version, startedAt, visits }),
);
app.post("/api/visits", (req, res) => res.json({ visits: ++visits }));
app.post("/api/visits/reset", requireAdmin, (req, res) => res.json({ visits: (visits = 0) }));
app.use((req, res) => res.status(404).json({ error: "not found" }));

const server = app.listen(PORT, () => log("backend listening", { port: PORT, version: APP_VERSION }));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
