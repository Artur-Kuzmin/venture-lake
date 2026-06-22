import type { CSSProperties } from 'react';

// Layout-matched loading placeholder: a grey rounded bar with a subtle shimmer
// (the shimmer is disabled under prefers-reduced-motion). Sizes are passed by
// the composed page skeletons so the placeholder mirrors the real content.
export function Skeleton({
  w,
  h = '1rem',
  radius,
  className,
  style,
}: {
  w?: string | number;
  h?: string | number;
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `skeleton ${className}` : 'skeleton'}
      style={{ width: w, height: h, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
