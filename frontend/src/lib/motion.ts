// Lake motion tokens (UI Spec §6). Motion is functional: state changes,
// feedback, attention — nothing decorative. Consumed by framer-motion (m.*).
export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
export const dur = { micro: 0.15, base: 0.22 } as const;

// List-item motion (UI Spec §9.4). Lists whose membership or order changes from
// an optimistic mutation animate the landing: enter on append/nominate, exit on
// rollback, layout (FLIP) reorder when the sort shifts. Gated by reduced motion
// at the call site. The reorder rides the snappy spring above so rows settle fast
// under a clicking user instead of drifting past the cursor.
export const listEnter = { opacity: 0, y: 6 } as const;
export const listShown = { opacity: 1, y: 0 } as const;
export const listExit = { opacity: 0 } as const;
export const listTransition = { layout: spring, default: { duration: dur.micro, ease } } as const;
