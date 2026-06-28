// Concrete motion tokens (§5). Motion is functional and HARD: state changes,
// feedback, attention — nothing decorative, nothing soft. Brutalist motion is
// snappy and near-linear (~120–180ms), not gentle spring/ease. Consumed by
// framer-motion (m.*). Every consumer gates on reduced motion at the call site.
export const ease: [number, number, number, number] = [0.2, 0, 0, 1]; // sharp ease-out, near-linear
export const spring = { type: 'spring', stiffness: 600, damping: 40, mass: 0.7 } as const; // snappy FLIP, minimal overshoot
export const dur = { micro: 0.12, base: 0.16 } as const;

// List-item motion (§5/§9.4). Lists whose membership or order changes from an
// optimistic mutation animate the landing: enter on append/nominate, exit on
// rollback, layout (FLIP) reorder when the sort shifts. Hard and short so rows
// snap into place under a clicking user instead of drifting.
export const listEnter = { opacity: 0, y: 8 } as const;
export const listShown = { opacity: 1, y: 0 } as const;
export const listExit = { opacity: 0 } as const;
export const listTransition = { layout: spring, default: { duration: dur.micro, ease } } as const;

// Toast motion (§5). Floating feedback slides in HARD from the edge and snaps out
// — no soft fade, no scale. The hard offset shadow (--vl-shadow) lives in CSS.
export const toastEnter = { opacity: 0, x: 16 } as const;
export const toastShown = { opacity: 1, x: 0 } as const;
export const toastExit = { opacity: 0, x: 12 } as const;
export const toastTransition = { duration: dur.micro, ease } as const;
