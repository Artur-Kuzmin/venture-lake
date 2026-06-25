import { m, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ember';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
}

// Lake button (UI Spec §5). Press feedback via whileTap, gated by reduced motion.
// m.button under LazyMotion strict — never motion.*. Ember variant is reserved for
// the single commit/execute action on a screen (enforced by usage, not code).
export function Button({ variant = 'secondary', className, type = 'button', children, ...props }: ButtonProps) {
  const reduce = useReducedMotion();
  return (
    <m.button
      type={type}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ duration: dur.micro, ease }}
      className={`vl-btn vl-btn--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </m.button>
  );
}

export default Button;
