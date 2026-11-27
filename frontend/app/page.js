import VisitButton from "./visit-button";

// Rendered per request so the page always shows live backend data.
export const dynamic = "force-dynamic";

async function getHello() {
  // Server-side call over the in-cluster Service; the URL comes from env (12-factor).
  const res = await fetch(`${process.env.BACKEND_URL}/api/hello`, { cache: "no-store" });
  return res.json();
}

export default async function Home() {
  let hello;
  try {
    hello = await getHello();
  } catch (err) {
    console.error(JSON.stringify({ msg: "backend unreachable", error: String(err) }));
  }

  return (
    <main>
      <h1>DevSpace Sandbox</h1>
      <p>Next.js frontend talking to a Node backend, running on k3d via DevSpace.</p>
      {hello ? (
        <ul>
          <li>Backend says: <strong>{hello.message}</strong></li>
          <li>Backend version: <code>{hello.version}</code></li>
          <li>Backend pod: <code>{hello.pod}</code></li>
          <li>Backend started at: <code>{hello.startedAt}</code></li>
        </ul>
      ) : (
        <p style={{ color: "crimson" }}>Backend unreachable.</p>
      )}
      <VisitButton initial={hello?.visits ?? 0} />
    </main>
  );
}
