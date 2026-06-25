import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { dur, ease } from '../../lib/motion';

// The signature element (UI Spec §7). Every entity is a small state machine; its
// state is shown the same way everywhere. On a transition the dot pulses once and
// the label cross-fades to the new state. Both are gated by reduced motion: skip
// the pulse, swap the label instantly. m.* only (LazyMotion strict).
export type PillState = 'draft' | 'active' | 'committed' | 'done' | 'blocked';

const META: Record<PillState, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--vl-ink-faint)' },
  active: { label: 'Active', color: 'var(--vl-lake)' },
  committed: { label: 'Committed', color: 'var(--vl-ember)' },
  done: { label: 'Done', color: 'var(--vl-ok)' },
  blocked: { label: 'Blocked', color: 'var(--vl-danger)' },
};

export function StatePill({ state, label }: { state: PillState; label?: string }) {
  const reduce = useReducedMotion();
  const meta = META[state];
  const text = label ?? meta.label;
  const style = { '--vl-pill-color': meta.color } as CSSProperties;

  return (
    <span className="vl-pill" data-state={state} style={style}>
      {reduce ? (
        <span className="vl-pill__dot" />
      ) : (
        <m.span
          key={state}
          className="vl-pill__dot"
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.35, 1] }}
          transition={{ duration: 0.4, ease }}
        />
      )}

      {reduce ? (
        <span className="vl-pill__label">{text}</span>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={state}
            className="vl-pill__label"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: dur.micro, ease }}
          >
            {text}
          </m.span>
        </AnimatePresence>
      )}
    </span>
  );
}

export default StatePill;
