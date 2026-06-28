import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { toastEnter, toastExit, toastShown, toastTransition } from '../../lib/motion';

type Tone = 'info' | 'success' | 'error';

// Lake toast (UI Spec §9.5). Floating, dismissible feedback for transient action
// results — driven by a single message string so it is trivial to wire to an
// existing `error` state. Enter/exit via AnimatePresence (§6), gated by reduced
// motion. Auto-dismisses; also closeable. Rendered INSIDE .lake-scope so it is
// styled by the scoped rules and legacy screens stay untouched.
export function Toast({
  message,
  tone = 'error',
  onClose,
  duration = 6000,
}: {
  message: string | null;
  tone?: Tone;
  onClose: () => void;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  // Keep the latest onClose without re-arming the timer on every parent render
  // (the Team page re-renders on its 5s poll — that must not reset the timeout).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => closeRef.current(), duration);
    return () => clearTimeout(t);
  }, [message, duration]);

  return (
    <div className="vl-toast-region" aria-live="polite">
      <AnimatePresence>
        {message && (
          <m.div
            className={`vl-toast vl-toast--${tone}`}
            role={tone === 'error' ? 'alert' : 'status'}
            initial={reduce ? false : toastEnter}
            animate={reduce ? undefined : toastShown}
            exit={reduce ? undefined : toastExit}
            transition={toastTransition}
          >
            <span className="vl-toast__msg">{message}</span>
            <button
              type="button"
              className="icon-btn vl-toast__close"
              onClick={onClose}
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Toast;
