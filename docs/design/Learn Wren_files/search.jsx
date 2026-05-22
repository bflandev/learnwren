// Search results screen — UC-05-02. Shows query echo, relevance ranking,
// and the "no results" empty state alongside live results.

const SearchScreen = ({ density = "cozy" }) => {
  const [q, setQ] = React.useState("sourdough");
  const results = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return COURSES.filter(c =>
      c.title.toLowerCase().includes(needle) ||
      c.description.toLowerCase().includes(needle) ||
      c.category.toLowerCase().includes(needle) ||
      c.instructor.name.toLowerCase().includes(needle)
    );
  }, [q]);

  return (
    <div className={`lw-screen lw-density-${density}`}>
      <TopNav active="browse" q={q} onQ={setQ} />
      <div style={{ height: "calc(100% - 65px)", overflowY: "auto", padding: "32px 32px 40px" }}>
        <p className="lw-meta">Search</p>
        <h1 style={{ fontSize: 30, marginTop: 6 }}>
          Results for <span style={{ color: "var(--lw-ochre)" }}>"{q}"</span>
        </h1>
        <p className="lw-meta" style={{ marginTop: 8 }}>
          {results.length} {results.length === 1 ? "course" : "courses"} · ranked by relevance
        </p>

        {/* Suggested searches */}
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <span className="lw-meta" style={{ alignSelf: "center" }}>Try:</span>
          {["wren", "sourdough", "sashiko", "carving", "letterpress"].map(s => (
            <button key={s} className="lw-pill" onClick={() => setQ(s)} style={{ cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {results.length === 0 ? (
            <div style={{
              padding: 48, textAlign: "center",
              background: "var(--lw-bg-2)", border: "1px dashed var(--lw-line-2)",
              borderRadius: "var(--lw-r-lg)",
            }}>
              <h3 style={{ fontSize: 22 }}>No courses found for "{q}".</h3>
              <p style={{ color: "var(--lw-ink-2)", margin: "10px 0 18px" }}>
                Try different keywords or browse the catalogue.
              </p>
              <button className="lw-btn lw-btn-primary">Browse all courses</button>
            </div>
          ) : results.map((c, i) => (
            <SearchRow key={c.id} course={c} q={q} rank={i + 1}/>
          ))}
        </div>
      </div>
    </div>
  );
};

function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "color-mix(in oklch, var(--lw-ochre) 36%, transparent)", color: "inherit", padding: "0 2px", borderRadius: 3 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function SearchRow({ course, q, rank }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "32px 200px 1fr auto",
      gap: 20, alignItems: "center",
      background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)",
      borderRadius: "var(--lw-r-lg)", padding: 14,
    }}>
      <span className="lw-mono" style={{ color: "var(--lw-ink-4)", fontSize: 12 }}>
        {String(rank).padStart(2, "0")}
      </span>
      <Cover course={course} height={108}/>
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="lw-meta">{course.category}</span>
          <span className="lw-meta">·</span>
          <span className="lw-meta">{course.level}</span>
        </div>
        <h3 style={{ fontSize: 18, marginTop: 4 }}>{highlight(course.title, q)}</h3>
        <p style={{ color: "var(--lw-ink-2)", marginTop: 6, fontSize: 13, lineHeight: 1.5, maxWidth: 540 }}>
          {highlight(course.description, q)}
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 8 }} className="lw-meta">
          <span>{course.instructor.name}</span>
          <span>·</span>
          <span>{fmtDuration(course.durationMin)}</span>
          <span>·</span>
          <span>{course.lessonCount} lessons</span>
        </div>
      </div>
      <button className="lw-btn lw-btn-primary">View</button>
    </div>
  );
}

window.SearchScreen = SearchScreen;
