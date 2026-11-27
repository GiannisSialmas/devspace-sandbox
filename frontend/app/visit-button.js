"use client";

import { useState } from "react";

// Calls /api/visits on the page's own origin; Next.js proxies it to the backend (app/api).
export default function VisitButton({ initial }) {
  const [visits, setVisits] = useState(initial);
  const click = async () => {
    const res = await fetch("/api/visits", { method: "POST" });
    setVisits((await res.json()).visits);
  };
  return <button onClick={click}>Count a visit ({visits})</button>;
}
