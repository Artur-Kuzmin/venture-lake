import { useEffect, useState } from 'react';

// Self-contained countdown: owns its own 1s interval so the parent component
// does not re-render every second. `format` preserves each caller's exact
// remaining-time formatting; `onExpire` (optional) fires once when the deadline
// passes, letting the parent flip any deadline-dependent gates with a single
// re-render instead of ticking.
export function Countdown({
  to,
  format,
  onExpire,
}: {
  to: string | number | Date;
  format: (msRemaining: number) => string;
  onExpire?: () => void;
}) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (Date.now() >= target) {
      onExpire?.();
      return;
    }
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= target) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <>{format(target - now)}</>;
}

export default Countdown;
