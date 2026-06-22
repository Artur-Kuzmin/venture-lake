import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Accessible tooltip wrapper: shows a visual label on hover AND keyboard focus,
// positioned edge-safely (fixed, clamped to the viewport, flips below if there
// is no room above), dismissed on blur/Escape, and reduced-motion-aware.
//
// The label is VISUAL only (aria-hidden) — the wrapped control must carry its
// own aria-label so screen readers get the accessible name. Add BOTH.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position after render so the bubble is measured; keep it on screen.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !bubbleRef.current) return;
    const trigger = wrapRef.current.getBoundingClientRect();
    const bubble = bubbleRef.current.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    let left = trigger.left + trigger.width / 2 - bubble.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bubble.width - margin));
    let top = trigger.top - bubble.height - gap;
    if (top < margin) top = trigger.bottom + gap; // not enough room above → below
    setPos({ top, left });
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="tt-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      {children}
      {open && (
        <span
          ref={bubbleRef}
          className="tt-bubble"
          aria-hidden="true"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
