// Course detail page — UC-05-03 & UC-05-04. Shows full course info,
// instructor, structure, and the Continue Learning state for an enrolled student.

const DetailScreen = ({ density = "cozy" }) => {
  const course = COURSES[0]; // Reading the Wren's Song
  const enrolment = ENROLMENTS.find(e => e.courseId === course.id);

  return (
    <div className={`lw-screen lw-density-${density}`}>
      <TopNav active="browse" />
      <div style={{ height: "calc(100% - 65px)", overflowY: "auto" }}>
        {/* Hero */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.4fr 1fr",
          gap: 32, padding: "32px 40px",
          borderBottom: "1px solid var(--lw-line)",
          background: "linear-gradient(180deg, color-mix(in oklch, var(--lw-moss) 8%, var(--lw-bg)), var(--lw-bg))",
        }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="lw-meta" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>Browse</span>
              <Icon name="chev-r" size={12}/>
              <span>{course.category}</span>
              <Icon name="chev-r" size={12}/>
              <span style={{ color: "var(--lw-ink-2)" }}>{course.title}</span>
            </div>
            <h1 style={{ fontSize: 38, marginTop: 14, lineHeight: 1.05 }}>{course.title}</h1>
            <p style={{ color: "var(--lw-ink-2)", fontSize: 16, lineHeight: 1.55, marginTop: 14, maxWidth: 540 }}>
              {course.description}
            </p>

            <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
              <Meta icon="level" label="Level" value={course.level}/>
              <Meta icon="clock" label="Duration" value={fmtDuration(course.durationMin)}/>
              <Meta icon="doc"   label="Lessons" value={`${course.lessonCount} in ${course.moduleCount} modules`}/>
              <Meta icon="users" label="Students" value={course.students.toLocaleString()}/>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center" }}>
              {enrolment ? (
                <>
                  <button className="lw-btn lw-btn-primary" style={{ padding: "12px 18px", fontSize: 14 }}>
                    <Icon name="play" size={14}/> Continue learning
                  </button>
                  <span className="lw-meta">
                    {Math.round(enrolment.progress*100)}% · last watched {enrolment.lastWatched}
                  </span>
                </>
              ) : (
                <button className="lw-btn lw-btn-primary" style={{ padding: "12px 18px", fontSize: 14 }}>
                  Enrol — free for members <Icon name="arrow" size={14}/>
                </button>
              )}
              <button className="lw-btn"><Icon name="bookmark" size={14}/> Save</button>
            </div>

            {enrolment && (
              <div style={{ marginTop: 18, maxWidth: 460 }}>
                <div className="lw-progress"><span style={{ width: `${enrolment.progress*100}%` }}/></div>
                <div className="lw-meta" style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{enrolment.completedLessons} of {course.lessonCount} lessons complete</span>
                  <span>Up next: {enrolment.lastLesson.title}</span>
                </div>
              </div>
            )}
          </div>
          <Cover course={course} height={300} />
        </div>

        {/* Body grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 36, padding: "32px 40px 48px" }}>
          {/* Course structure */}
          <div>
            <h2 style={{ fontSize: 22 }}>Course structure</h2>
            <p className="lw-meta" style={{ marginTop: 4, marginBottom: 18 }}>
              {course.moduleCount} modules · {course.lessonCount} lessons · video content hidden until enrolled
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {COURSE_OUTLINE.modules.map((m, i) => (
                <ModuleAccordion key={m.id} module={m} index={i + 1} open={i < 2}/>
              ))}
            </div>
          </div>

          {/* Instructor + materials */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)", borderRadius: "var(--lw-r-lg)", padding: 20 }}>
              <h3 style={{ fontSize: 18 }}>About the instructor</h3>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "var(--lw-moss)", color: "var(--lw-bg)",
                  display: "grid", placeItems: "center",
                  fontFamily: "var(--lw-font-serif)", fontStyle: "italic", fontSize: 22,
                }}>{course.instructor.avatar}</div>
                <div>
                  <p style={{ fontWeight: 500 }}>{course.instructor.name}</p>
                  <p className="lw-meta">{course.instructor.bio}</p>
                </div>
              </div>
              <p style={{ color: "var(--lw-ink-2)", marginTop: 14, fontSize: 13.5, lineHeight: 1.55 }}>
                Etta has been recording in northern woodland since 2011. Her field library
                contributes to community archives at three universities.
              </p>
            </div>
            <div style={{ background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)", borderRadius: "var(--lw-r-lg)", padding: 20 }}>
              <h3 style={{ fontSize: 18 }}>What you'll get</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  "12 video lessons (3h 4m)",
                  "Field-recording checklist (PDF)",
                  "Spectrogram reference cards",
                  "Community discussion thread",
                ].map(it => (
                  <li key={it} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--lw-ink-2)", fontSize: 13.5 }}>
                    <Icon name="check" size={14}/> {it}
                  </li>
                ))}
              </ul>
            </div>
            {enrolment && (
              <button className="lw-btn lw-btn-ghost" style={{ justifyContent: "center", color: "var(--lw-ink-3)" }}>
                Leave course…
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

function Meta({ icon, label, value }) {
  return (
    <div>
      <div className="lw-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={12}/> {label}
      </div>
      <div style={{ marginTop: 4, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ModuleAccordion({ module, index, open: initialOpen }) {
  const [open, setOpen] = React.useState(initialOpen);
  const total = module.lessons.reduce((a, l) => a + l.durationMin, 0);
  const done = module.lessons.filter(l => l.status === "complete").length;
  return (
    <div style={{ background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)", borderRadius: "var(--lw-r-lg)", overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)}
        className="lw-btn lw-btn-ghost"
        style={{
          width: "100%", padding: "16px 20px",
          display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
          background: "transparent", borderRadius: 0, color: "var(--lw-ink)",
        }}>
        <span className="lw-mono" style={{ color: "var(--lw-ink-3)", fontSize: 12 }}>
          {String(index).padStart(2, "0")}
        </span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 500, fontSize: 15 }}>{module.title}</div>
          <div className="lw-meta" style={{ marginTop: 2 }}>
            {module.lessons.length} lessons · {fmtDuration(total)} · {done}/{module.lessons.length} complete
          </div>
        </div>
        <span className="lw-meta">{open ? "Hide" : "Show"}</span>
        <Icon name={open ? "chev-d" : "chev-r"} size={14}/>
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: "4px 0 14px", borderTop: "1px solid var(--lw-line)" }}>
          {module.lessons.map((l, i) => (
            <li key={l.id} style={{
              display: "grid", gridTemplateColumns: "60px 24px 1fr auto", alignItems: "center",
              padding: "10px 20px", gap: 12,
            }}>
              <span className="lw-mono lw-meta">{String(i + 1).padStart(2, "0")}</span>
              {l.status === "complete" ? (
                <span style={{ color: "var(--lw-moss)" }}><Icon name="check" size={16}/></span>
              ) : l.status === "active" ? (
                <span style={{ color: "var(--lw-ochre)" }}><Icon name="play" size={14}/></span>
              ) : (
                <span style={{ color: "var(--lw-ink-4)" }}><Icon name="lock" size={13}/></span>
              )}
              <span style={{ color: l.status === "locked" ? "var(--lw-ink-3)" : "var(--lw-ink)" }}>{l.title}</span>
              <span className="lw-meta">{l.durationMin}m</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

window.DetailScreen = DetailScreen;
