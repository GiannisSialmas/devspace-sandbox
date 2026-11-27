// Proxies /api/* to the backend, server side, so the browser only ever talks to Next.js.
// BACKEND_URL is read per request (12-factor), not baked in at build time like `rewrites`.
export const dynamic = "force-dynamic";

async function proxy(req, { params }) {
  const { path } = await params;
  const { search } = new URL(req.url);
  const target = `${process.env.BACKEND_URL}/api/${path.join("/")}${search}`;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        ...(req.headers.has("authorization") && { authorization: req.headers.get("authorization") }),
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
      cache: "no-store",
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error(JSON.stringify({ msg: "backend unreachable", target, error: String(err) }));
    return Response.json({ error: "backend unreachable" }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
