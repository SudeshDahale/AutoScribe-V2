import { useEffect, useState } from "react";

/** Ticks every `ms`, returning seconds elapsed since mount.
 *  SSR and the first client render both return 0 — no hydration mismatch. */
export function useLiveTick(ms = 1000) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - start) / 1000), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return elapsed;
}
