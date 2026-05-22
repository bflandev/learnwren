// Shared primitives for the Learn Wren screens.
// Each screen is designed to fit a fixed artboard size, so we use
// CSS-driven layouts and don't fight the parent.

const { useState, useMemo } = React;

// ── Formatters ──────────────────────────────────────────────
const fmtDuration = (min) => {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
const fmtRating = (n) => n.toFixed(1);

// ── Icons (inline strokes; calm and small) ─────────────────
function Icon({ name, size = 16, stroke = 1.5 }) {
  const s = size, sw = stroke;
  const c = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "search": return <svg {...c}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "bell":   return <svg {...c}><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>;
    case "play":   return <svg {...c}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>;
    case "pause":  return <svg {...c}><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/></svg>;
    case "check":  return <svg {...c}><path d="m4 12 5 5L20 6"/></svg>;
    case "lock":   return <svg {...c}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
    case "bookmark": return <svg {...c}><path d="M6 3h12v18l-6-4-6 4z"/></svg>;
    case "arrow":  return <svg {...c}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case "chev-r": return <svg {...c}><path d="m9 6 6 6-6 6"/></svg>;
    case "chev-d": return <svg {...c}><path d="m6 9 6 6 6-6"/></svg>;
    case "filter": return <svg {...c}><path d="M4 6h16M7 12h10M10 18h4"/></svg>;
    case "grid":   return <svg {...c}><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>;
    case "list":   return <svg {...c}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case "clock":  return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "users":  return <svg {...c}><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15 19c.4-2 2-4 5-4"/></svg>;
    case "level":  return <svg {...c}><path d="M5 18h3v-6H5zM11 18h3V8h-3zM17 18h3V4h-3z" fill="currentColor" stroke="none"/></svg>;
    case "doc":    return <svg {...c}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>;
    case "down":   return <svg {...c}><path d="M12 4v12m0 0-5-5m5 5 5-5"/><path d="M5 20h14"/></svg>;
    case "captions": return <svg {...c}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h3M7 14h2M14 11h3M14 14h2"/></svg>;
    case "settings": return <svg {...c}><circle cx="12" cy="12" r="3"/><path d="M19 12c0 .7-.1 1.3-.2 2l1.7 1.3-2 3.4-2-.7c-.9.7-1.9 1.3-3 1.6l-.3 2.1H10l-.3-2.1c-1.1-.3-2.1-.9-3-1.6l-2 .7-2-3.4L4.3 14c-.1-.7-.2-1.3-.2-2s.1-1.3.2-2L2.6 8.7l2-3.4 2 .7c.9-.7 1.9-1.3 3-1.6L10 1.5h4l.3 2.1c1.1.3 2.1.9 3 1.6l2-.7 2 3.4L19.7 9c.1.7.2 1.3.2 2z"/></svg>;
    case "fs":     return <svg {...c}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>;
    case "vol":    return <svg {...c}><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9c1 1 1 5 0 6"/></svg>;
    case "more":   return <svg {...c}><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/></svg>;
    case "leaf":   return <svg {...c}><path d="M5 19c0-9 6-14 14-14 0 8-5 14-14 14z"/><path d="M5 19l9-9"/></svg>;
    case "x":      return <svg {...c}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    default: return null;
  }
}

// ── Cover with placeholder gradient + glyph + label ────────
function Cover({ course, height = 140, label, children }) {
  return (
    <div className="lw-cover" data-tone={course.cover.tone} style={{ height, width: "100%" }}>
      <div className="lw-cover-glyph">{course.cover.glyph}</div>
      <span className="lw-cover-label">{label || `cover · ${course.id}`}</span>
      {children}
    </div>
  );
}

// ── Top nav (used by every screen except the player) ──────
function TopNav({ active = "home", onNav, q, onQ }) {
  const items = [
    { id: "home", label: "Home" },
    { id: "browse", label: "Browse" },
    { id: "my", label: "My Courses" },
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 24,
      padding: "14px 24px",
      borderBottom: "1px solid var(--lw-line)",
      background: "var(--lw-bg)",
      position: "sticky", top: 0, zIndex: 5,
    }}>
      <span className="lw-wordmark" style={{ fontSize: 20 }}>Learn&nbsp;Wren</span>
      <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
        {items.map((it) => (
          <button key={it.id}
            onClick={() => onNav && onNav(it.id)}
            className="lw-btn lw-btn-ghost"
            style={{
              padding: "6px 12px",
              color: active === it.id ? "var(--lw-ink)" : "var(--lw-ink-3)",
              background: "transparent",
              fontWeight: active === it.id ? 600 : 400,
            }}>
            {it.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <label style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "min(100%, 460px)",
          padding: "8px 14px",
          background: "var(--lw-bg-2)",
          border: "1px solid var(--lw-line)",
          borderRadius: 999,
          color: "var(--lw-ink-3)",
        }}>
          <Icon name="search" size={15} />
          <input
            value={q ?? ""}
            onChange={(e) => onQ && onQ(e.target.value)}
            placeholder="Search courses, instructors, lessons"
            style={{
              flex: 1, background: "transparent", border: 0, outline: "none",
              color: "var(--lw-ink)", font: "inherit",
            }} />
          <span className="lw-mono" style={{ fontSize: 11, color: "var(--lw-ink-4)" }}>⌘K</span>
        </label>
      </div>
      <button className="lw-btn lw-btn-ghost" style={{ padding: 8 }}><Icon name="bell" /></button>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--lw-ochre)", color: "var(--lw-ochre-ink)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--lw-font-serif)", fontWeight: 600, fontStyle: "italic",
        fontSize: 14, letterSpacing: "-0.02em",
      }}>e</div>
    </div>
  );
}

// ── Course card (cataogue / search / dashboard) ────────────
function CourseCard({ course, variant = "default" }) {
  return (
    <div style={{
      background: "var(--lw-bg-2)",
      border: "1px solid var(--lw-line)",
      borderRadius: "var(--lw-r-lg)",
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <Cover course={course} height={variant === "wide" ? 160 : 124} />
      <div style={{ padding: "var(--lw-card-pad, 14px)", display: "flex", flexDirection: "column", gap: "var(--lw-card-gap, 8px)", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="lw-meta">{course.category}</span>
          {course.badge && (
            <span className="lw-pill" style={{ background: "color-mix(in oklch, var(--lw-ochre) 16%, transparent)", borderColor: "color-mix(in oklch, var(--lw-ochre) 35%, transparent)", color: "var(--lw-ochre)" }}>
              {course.badge}
            </span>
          )}
        </div>
        <h3 style={{ fontSize: 17, lineHeight: 1.2 }}>{course.title}</h3>
        <p className="lw-meta" style={{ color: "var(--lw-ink-2)" }}>
          {course.instructor.name}
        </p>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} className="lw-meta">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="level" size={13}/> {course.level}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="users" size={13}/> {course.students.toLocaleString()}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={13}/> {fmtDuration(course.durationMin)}
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Cover, TopNav, CourseCard, fmtDuration, fmtRating });
