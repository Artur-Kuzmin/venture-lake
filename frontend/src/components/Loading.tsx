// Reusable loading state — a restrained spinner with an optional label.
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="placeholder">{label}</span>
    </div>
  );
}

export default Loading;
