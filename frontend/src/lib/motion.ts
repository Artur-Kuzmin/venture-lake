// Lake motion tokens (UI Spec §6). Motion is functional: state changes,
// feedback, attention — nothing decorative. Consumed by framer-motion (m.*).
export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
export const dur = { micro: 0.15, base: 0.22 } as const;
