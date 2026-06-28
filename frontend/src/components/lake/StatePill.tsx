import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

// The signature status element (Concrete §4/§7) — formerly the dot+pill StatePill,
// now a mono KICKER/tag. "Live" states (active / committed) render as a solid blue
// tag with paper text; done is deep green text with a ✓; blocked is danger with a ✕;
// draft is faint. Color + tag styling come from the data-state attribute (see the
// .vl-pill rules in index.css). On a transition the label cross-fades with a quick,
// hard step; reduced motion swaps it instantly. m.* only (LazyMotion strict).
export type PillState = 'draft' | 'active' | 'committed' | 'done' | 'blocked';

const META: Record<PillState, { label: string; glyph: string }> = {
  draft: { label: 'Draft', glyph: '' },
  active: { label: 'Active', glyph: '' },
  committed: { label: 'Committed', glyph: '' },
  done: { label: 'Done', glyph: '✓ ' },
  blocked: { label: 'Blocked', glyph: '✕ ' },
};

export function StatePill({ state, label }: { state: PillState; label?: string }) {
  const reduce = useReducedMotion();
  const meta = META[state];
  const text = meta.glyph + (label ?? meta.label);

  return (
    <span className="vl-pill" data-state={state}>
      {reduce ? (
        <span className="vl-pill__label">{text}</span>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={state}
            className="vl-pill__label"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
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
