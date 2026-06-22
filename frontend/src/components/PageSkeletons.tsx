import { Skeleton } from './Skeleton';

// First-load skeletons. Each mirrors its page's real layout (same containers and
// rough spacing) so content swaps in without layout shift. Shown only on a
// cache-miss / first load — never over data the page already has.

export function LobbySkeleton() {
  return (
    <div className="page queue-terminal">
      <header className="qt-header">
        <Skeleton w={140} h={11} />
        <Skeleton w={280} h={34} style={{ marginTop: '0.6rem' }} />
        <Skeleton w="min(460px, 100%)" h={14} style={{ marginTop: '0.6rem' }} />
      </header>

      <section className="qt-status">
        <div className="qt-status__bar">
          <Skeleton w={96} h={22} radius={999} />
          <Skeleton w={70} h={12} />
        </div>
        <Skeleton w={240} h={26} style={{ marginBottom: '0.5rem' }} />
        <Skeleton w="70%" h={14} />
        <Skeleton w={150} h={42} radius={8} style={{ marginTop: '1.1rem' }} />
      </section>

      <div className="qt-cols">
        <div className="queue-state">
          <Skeleton w={150} h={18} />
          <Skeleton w="100%" h={14} style={{ marginTop: '0.8rem' }} />
          <div className="party-join" style={{ marginTop: '0.4rem' }}>
            <Skeleton w={180} h={38} radius={8} />
            <Skeleton w={110} h={38} radius={8} />
          </div>
        </div>
        <aside className="qt-side">
          <div className="qt-stat">
            <Skeleton w={64} h={30} />
            <Skeleton w={150} h={12} style={{ marginTop: '0.5rem' }} />
          </div>
          <div className="queue-state">
            <Skeleton w={160} h={18} />
            <Skeleton w="100%" h={14} style={{ marginTop: '0.6rem' }} />
            <div className="tag-row" style={{ marginTop: '0.4rem' }}>
              <Skeleton w={90} h={26} radius={999} />
              <Skeleton w={70} h={26} radius={999} />
              <Skeleton w={84} h={26} radius={999} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div className="page">
      <header className="team-header">
        <div>
          <Skeleton w={120} h={11} />
          <Skeleton w={220} h={30} style={{ margin: '0.5rem 0' }} />
          <Skeleton w={90} h={22} radius={999} />
        </div>
      </header>

      <div className="team-grid">
        <aside className="team-col team-col--left">
          <section className="queue-state">
            <Skeleton w={120} h={18} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} w="100%" h={16} style={{ marginTop: '0.5rem' }} />
            ))}
            <Skeleton w={120} h={36} radius={8} style={{ marginTop: '0.6rem' }} />
          </section>
        </aside>

        <main className="team-col team-col--center">
          <section className="queue-state">
            <Skeleton w={180} h={22} />
            <Skeleton w="100%" h={14} style={{ marginTop: '0.8rem' }} />
            <Skeleton w="92%" h={14} style={{ marginTop: '0.4rem' }} />
            <Skeleton w="96%" h={14} style={{ marginTop: '0.4rem' }} />
            <Skeleton w={150} h={40} radius={8} style={{ marginTop: '1rem' }} />
          </section>
        </main>

        <aside className="team-col team-col--right">
          <section className="queue-state">
            <Skeleton w={120} h={18} />
            <Skeleton w="100%" h={16} style={{ marginTop: '0.6rem' }} />
          </section>
          <section className="queue-state chat">
            <Skeleton w={80} h={18} />
            <Skeleton w="100%" h={200} radius={8} style={{ marginTop: '0.6rem' }} />
          </section>
        </aside>
      </div>
    </div>
  );
}

export function VCSkeleton() {
  return (
    <div className="page">
      <header className="vc-header">
        <div>
          <Skeleton w={100} h={11} />
          <Skeleton w={240} h={32} style={{ marginTop: '0.5rem' }} />
        </div>
        <Skeleton w={140} h={24} radius={999} />
      </header>

      <div className="queue-state" style={{ marginTop: '1.5rem' }}>
        <Skeleton w={80} h={22} radius={999} />
        <Skeleton w={260} h={24} style={{ marginTop: '0.6rem' }} />
        <Skeleton w="80%" h={14} style={{ marginTop: '0.6rem' }} />
        <Skeleton w={170} h={40} radius={8} style={{ marginTop: '1rem' }} />
      </div>
    </div>
  );
}

// Rendered inside ShowcasePage below its (static) hero, so this is just the grid.
export function ShowcaseSkeleton() {
  return (
    <div className="sc-grid">
      {[0, 1, 2, 3].map((i) => (
        <article key={i} className="sc-card">
          <div className="sc-card__top">
            <Skeleton w={70} h={28} />
            <Skeleton w={90} h={22} radius={999} />
          </div>
          <Skeleton w="70%" h={20} style={{ marginTop: '0.4rem' }} />
          <Skeleton w="55%" h={15} style={{ marginTop: '0.3rem' }} />
          <Skeleton w="100%" h={14} style={{ marginTop: '0.3rem' }} />
          <Skeleton w="85%" h={14} style={{ marginTop: '0.3rem' }} />
          <div className="sc-card__foot">
            <div className="tag-row">
              <Skeleton w={70} h={24} radius={999} />
              <Skeleton w={84} h={24} radius={999} />
            </div>
            <Skeleton w={160} h={14} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="page">
      <div className="profile-head">
        <div>
          <Skeleton w={110} h={11} />
          <Skeleton w={200} h={32} style={{ margin: '0.6rem 0 0.4rem' }} />
          <Skeleton w={300} h={14} />
        </div>
        <Skeleton w={120} h={40} radius={8} />
      </div>

      <div className="profile-cards">
        {[0, 1, 2].map((i) => (
          <section key={i} className="queue-state">
            <Skeleton w={140} h={18} />
            <Skeleton w="60%" h={14} style={{ marginTop: '0.6rem' }} />
            <div className="tag-row" style={{ marginTop: '0.6rem' }}>
              <Skeleton w={80} h={26} radius={999} />
              <Skeleton w={64} h={26} radius={999} />
              <Skeleton w={90} h={26} radius={999} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
