// Course catalogue (UC-05-01) with working filters & sort, plus search results state (UC-05-02).

const { useState: useStateCat, useMemo: useMemoCat } = React;

const CatalogueScreen = ({ density = "cozy" }) => {
  const [cat, setCat] = useStateCat("All");
  const [lvl, setLvl] = useStateCat("All");
  const [sort, setSort] = useStateCat("Newest");
  const [view, setView] = useStateCat("grid");

  const filtered = useMemoCat(() => {
    let r = COURSES.slice();
    if (cat !== "All") r = r.filter(c => c.category === cat);
    if (lvl !== "All") r = r.filter(c => c.level === lvl);
    if (sort === "Most Popular") r.sort((a, b) => b.students - a.students);
    else if (sort === "Alphabetical") r.sort((a, b) => a.title.localeCompare(b.title));
    return r;
  }, [cat, lvl, sort]);

  return (
    <div className={`lw-screen lw-density-${density}`}>
      <TopNav active="browse" />
      <div style={{ height: "calc(100% - 65px)", overflowY: "auto" }}>
        <header style={{ padding: "32px 32px 16px", borderBottom: "1px solid var(--lw-line)" }}>
          <p className="lw-meta">Browse</p>
          <h1 style={{ fontSize: 32, marginTop: 6 }}>The whole library</h1>
          <p style={{ color: "var(--lw-ink-2)", marginTop: 8, maxWidth: 520 }}>
            Eight published courses across craft, food, garden, and field. Pick something quiet for the evening.
          </p>
        </header>

        {/* Filters */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "16px 32px",
          borderBottom: "1px solid var(--lw-line)", background: "var(--lw-bg)",
          position: "sticky", top: 0, zIndex: 4,
          flexWrap: "wrap",
        }}>
          <PillRow label="Category" options={CATEGORIES} value={cat} onChange={setCat} />
          <span style={{ width: 1, height: 22, background: "var(--lw-line)" }} />
          <PillRow label="Level" options={LEVELS} value={lvl} onChange={setLvl} />
          <span style={{ flex: 1 }} />
          <Select label="Sort" options={SORTS} value={sort} onChange={setSort} />
          <div style={{ display: "flex", border: "1px solid var(--lw-line)", borderRadius: "var(--lw-r)", overflow: "hidden" }}>
            <button className="lw-btn lw-btn-ghost"
              onClick={() => setView("grid")}
              style={{ borderRadius: 0, background: view === "grid" ? "var(--lw-bg-2)" : "transparent", color: view === "grid" ? "var(--lw-ink)" : "var(--lw-ink-3)", padding: 8 }}>
              <Icon name="grid"/></button>
            <button className="lw-btn lw-btn-ghost"
              onClick={() => setView("list")}
              style={{ borderRadius: 0, background: view === "list" ? "var(--lw-bg-2)" : "transparent", color: view === "list" ? "var(--lw-ink)" : "var(--lw-ink-3)", padding: 8 }}>
              <Icon name="list"/></button>
          </div>
        </div>

        {/* Result count + active filters */}
        <div style={{ padding: "14px 32px", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="lw-meta" style={{ color: "var(--lw-ink-2)" }}>
            {filtered.length} {filtered.length === 1 ? "course" : "courses"}
          </span>
          {(cat !== "All" || lvl !== "All") && (
            <button className="lw-btn lw-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => { setCat("All"); setLvl("All"); }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Results */}
        <div style={{ padding: "0 32px 40px" }}>
          {filtered.length === 0 ? (
            <EmptyResults onClear={() => { setCat("All"); setLvl("All"); }} />
          ) : view === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18 }}>
              {filtered.map(c => <CourseCard key={c.id} course={c} />)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map(c => <ListRow key={c.id} course={c} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function PillRow({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="lw-meta" style={{ color: "var(--lw-ink-3)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: 11 }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o}
            onClick={() => onChange(o)}
            className={`lw-pill ${value === o ? "lw-pill-active" : ""}`}
            style={{ cursor: "pointer", fontSize: 12 }}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, options, value, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="lw-meta" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 0.06 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          font: "inherit", color: "var(--lw-ink)",
          background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)",
          padding: "6px 10px", borderRadius: "var(--lw-r-sm)",
        }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ListRow({ course }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "180px 1fr auto",
      gap: 18, alignItems: "center",
      background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)",
      borderRadius: "var(--lw-r-lg)", padding: 14,
    }}>
      <Cover course={course} height={104} />
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="lw-meta">{course.category}</span>
          <span className="lw-meta">·</span>
          <span className="lw-meta">{course.level}</span>
        </div>
        <h3 style={{ fontSize: 18, marginTop: 4 }}>{course.title}</h3>
        <p className="lw-meta" style={{ marginTop: 4, color: "var(--lw-ink-2)" }}>
          {course.instructor.name} · {course.instructor.bio}
        </p>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }} className="lw-meta">
          <span><Icon name="clock" size={12}/> {fmtDuration(course.durationMin)}</span>
          <span><Icon name="users" size={12}/> {course.students.toLocaleString()} students</span>
          <span>{course.lessonCount} lessons</span>
        </div>
      </div>
      <button className="lw-btn">View course</button>
    </div>
  );
}

function EmptyResults({ onClear }) {
  return (
    <div style={{
      padding: 64, textAlign: "center",
      background: "var(--lw-bg-2)",
      border: "1px dashed var(--lw-line-2)",
      borderRadius: "var(--lw-r-lg)",
    }}>
      <h3 style={{ fontSize: 22 }}>No courses match your filters.</h3>
      <p style={{ color: "var(--lw-ink-2)", margin: "10px 0 18px" }}>Try adjusting your search criteria.</p>
      <button className="lw-btn lw-btn-primary" onClick={onClear}>Clear filters</button>
    </div>
  );
}

window.CatalogueScreen = CatalogueScreen;
