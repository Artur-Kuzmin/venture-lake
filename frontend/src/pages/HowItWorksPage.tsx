// Simple public explainer of the VentureLake loop.
const STEPS = ['Profile', 'Queue', 'Match', 'Lobby', 'Mission', 'Review', 'Continue or Publish'];

export default function HowItWorksPage() {
  return (
    <div className="page">
      <h1>How it works</h1>
      <p className="placeholder">{STEPS.join(' → ')}</p>
      <ol className="party-members">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
