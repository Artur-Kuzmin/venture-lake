import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { dur, ease } from '../../lib/motion';

// Lake empty state (UI Spec §9.5). Quiet, centered placeholder for a list with
// no items yet. Presence-driven so it fades out when the first item arrives
// (the list's own Pass-4 motion fades the item in). Gated by reduced motion.
export function EmptyState({
  show,
  icon,
  children,
}: {
  show: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          className="vl-empty"
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: dur.base, ease }}
        >
          {icon && (
            <span className="vl-empty__icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="vl-empty__text">{children}</div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

export default EmptyState;
