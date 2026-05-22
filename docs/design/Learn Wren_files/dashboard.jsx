// Dashboard / My Courses — student logged in with active enrolments + watch history.
// Maps to UC-06-03 (Resume Learning) and is the post-login landing.

const DashboardScreen = ({ density = "cozy", hero = "ledger" }) => {
  const inProgress = ENROLMENTS.filter(e => !e.completed);
  const completed = ENROLMENTS.filter(e => e.completed);
  const totalMin = ENROLMENTS.reduce((acc, e) => acc + (COURSES.find(c => c.id === e.courseId)?.durationMin || 0) * e.progress, 0);

  return (
    <div className={`lw-screen lw-density-${density}`}>
      <TopNav active="home" />
      <div style={{ height: "calc(100% - 65px)", overflowY: "auto" }}>
        {/* Hero variations */}
        {hero === "ledger" && <HeroLedger totalMin={totalMin} count={inProgress.length} completed={completed.length} />}
        {hero === "resume" && <HeroResume />}
        {hero === "quote"  && <HeroQuote totalMin={totalMin} />}

        {/* Continue Watching */}
        <Section
          title="Continue Watching"
          subtitle="Pick up where you left off"
          right={<button className="lw-btn lw-btn-ghost" style={{ padding: "6px 10px", fontSize: 13 }}>View watch history <Icon name="arrow" size={13}/></button>}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            {inProgress.slice(0, 2).map(en => {
              const c = COURSES.find(x => x.id === en.courseId);
              return <ContinueCard key={en.courseId} course={c} en={en} />;
            })}
          </div>
        </Section>

        <Section title="Recommended for you" subtitle="From instructors you follow & topics you watch">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
            {COURSES.slice(2, 6).map(c => <CourseCard key={c.id} course={c} />)}
          </div>
        </Section>

        <Section title="Completed" subtitle="Your shelf">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
            {completed.map(en => {
              const c = COURSES.find(x => x.id === en.courseId);
              return (
                <div key={c.id} style={{ position: "relative" }}>
                  <CourseCard course={c} />
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    background: "var(--lw-moss)", color: "var(--lw-bg)",
                    fontSize: 11, padding: "3px 8px", borderRadius: 999,
                    fontWeight: 600, letterSpacing: 0.02,
                  }}>Completed</div>
                </div>
              );
            })}
          </div>
        </Section>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
};

function Section({ title, subtitle, right, children }) {
  return (
    <section style={{ padding: "28px 32px 8px" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>{title}</h2>
          {subtitle && <p className="lw-meta" style={{ marginTop: 4 }}>{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function ContinueCard({ course, en }) {
  return (
    <div style={{
      background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)",
      borderRadius: "var(--lw-r-lg)", overflow: "hidden",
      display: "grid", gridTemplateColumns: "200px 1fr",
    }}>
      <div style={{ position: "relative" }}>
        <Cover course={course} height="100%" />
        <button style={{
          position: "absolute", inset: 0, margin: "auto",
          width: 48, height: 48, borderRadius: "50%",
          border: 0, background: "oklch(100% 0 0 / 0.92)", color: "oklch(15% 0 0)",
          display: "grid", placeItems: "center",
        }}><Icon name="play" size={22}/></button>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="lw-meta" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Module {en.lastLesson.module} · Lesson {en.lastLesson.lesson} of {course.lessonCount}</span>
          <span>{en.remainingMin || en.lastLesson.remainingMin}m left</span>
        </div>
        <h3 style={{ fontSize: 17, lineHeight: 1.25 }}>{en.lastLesson.title}</h3>
        <p className="lw-meta" style={{ color: "var(--lw-ink-2)" }}>{course.title} · {course.instructor.name}</p>
        <div style={{ flex: 1 }} />
        <div className="lw-progress"><span style={{ width: `${en.progress * 100}%` }}/></div>
        <div className="lw-meta" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{Math.round(en.progress * 100)}% complete</span>
          <span>{en.lastWatched}</span>
        </div>
      </div>
    </div>
  );
}

// ── Hero variants ─────────────────────────────────────────
function HeroLedger({ totalMin, count, completed }) {
  return (
    <div style={{
      margin: "24px 32px 0", padding: "24px 28px",
      borderRadius: "var(--lw-r-xl)",
      background: "linear-gradient(135deg, color-mix(in oklch, var(--lw-ochre) 16%, var(--lw-bg-2)), var(--lw-bg-2))",
      border: "1px solid var(--lw-line)",
      display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 24, alignItems: "center",
    }}>
      <div>
        <p className="lw-meta">Welcome back, Etta</p>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>A quiet morning. Three lessons waiting.</h1>
      </div>
      <Stat label="Hours watched" value={`${(totalMin / 60).toFixed(1)}h`} />
      <Stat label="In progress" value={count} />
      <Stat label="Completed" value={completed} />
    </div>
  );
}
function HeroResume() {
  const en = ENROLMENTS[2];
  const c = COURSES.find(x => x.id === en.courseId);
  return (
    <div style={{
      margin: "24px 32px 0", padding: 0, overflow: "hidden",
      borderRadius: "var(--lw-r-xl)", border: "1px solid var(--lw-line)",
      display: "grid", gridTemplateColumns: "1fr 320px", minHeight: 200,
      background: "var(--lw-bg-2)",
    }}>
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        <span className="lw-meta">Resume — {Math.round(en.progress*100)}% in</span>
        <h1 style={{ fontSize: 28 }}>{en.lastLesson.title}</h1>
        <p style={{ color: "var(--lw-ink-2)", maxWidth: 460 }}>{c.title} · {c.instructor.name}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button className="lw-btn lw-btn-primary"><Icon name="play" size={14}/> Continue learning</button>
          <button className="lw-btn">Outline</button>
        </div>
      </div>
      <Cover course={c} height="100%" />
    </div>
  );
}
function HeroQuote({ totalMin }) {
  return (
    <div style={{
      margin: "24px 32px 0", padding: "32px 28px",
      borderRadius: "var(--lw-r-xl)",
      background: "var(--lw-bg-2)",
      border: "1px solid var(--lw-line)",
      display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 24,
    }}>
      <blockquote style={{ margin: 0 }}>
        <p style={{ fontFamily: "var(--lw-font-serif)", fontStyle: "italic", fontSize: 24, lineHeight: 1.3, color: "var(--lw-ink)" }}>
          "The wren is small but its song fills the wood."
        </p>
        <footer className="lw-meta" style={{ marginTop: 10 }}>— Field Notes, vol. iii</footer>
      </blockquote>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--lw-font-serif)", fontSize: 36 }}>{(totalMin / 60).toFixed(0)}h</div>
        <div className="lw-meta">watched this season</div>
      </div>
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--lw-font-serif)", fontSize: 28, lineHeight: 1 }}>{value}</div>
      <div className="lw-meta" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
