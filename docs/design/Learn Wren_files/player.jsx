// Lesson player — UC-06-01..04. Video left, outline right.
// Shows DRM-protected playback chrome, captions toggle, speed picker,
// course outline with module groups + completion checks, and materials drawer.

const PlayerScreen = ({ density = "cozy" }) => {
  const [outlineOpen, setOutlineOpen] = React.useState(true);
  const [activeId, setActiveId] = React.useState("l5");
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState("1x");
  const [captions, setCaptions] = React.useState(true);

  const course = COURSES.find(c => c.id === COURSE_OUTLINE.courseId);
  const allLessons = COURSE_OUTLINE.modules.flatMap(m => m.lessons.map(l => ({ ...l, module: m.title })));
  const active = allLessons.find(l => l.id === activeId) || allLessons[0];
  const idx = allLessons.findIndex(l => l.id === active.id);
  const completed = allLessons.filter(l => l.status === "complete").length;
  const percent = Math.round((completed / allLessons.length) * 100);

  return (
    <div className={`lw-screen lw-density-${density}`}>
      <TopNav active="my" />
      <div style={{
        display: "grid",
        gridTemplateColumns: outlineOpen ? "1fr 360px" : "1fr 0",
        height: "calc(100% - 65px)",
        transition: "grid-template-columns 220ms ease",
      }}>
        {/* Left — video + lesson body */}
        <div style={{ overflowY: "auto", borderRight: outlineOpen ? "1px solid var(--lw-line)" : "none" }}>
          {/* Breadcrumb */}
          <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", gap: 8 }} className="lw-meta">
            <span>My Courses</span>
            <Icon name="chev-r" size={11}/>
            <span>{course.title}</span>
            <Icon name="chev-r" size={11}/>
            <span style={{ color: "var(--lw-ink-2)" }}>{active.module}</span>
          </div>

          {/* Player */}
          <div style={{ padding: "16px 28px 0" }}>
            <div style={{
              position: "relative", aspectRatio: "16/9",
              background: "linear-gradient(135deg, oklch(20% 0.02 60), oklch(12% 0.01 60))",
              borderRadius: "var(--lw-r-lg)",
              overflow: "hidden",
              border: "1px solid var(--lw-line)",
            }}>
              {/* DRM watermark */}
              <div style={{
                position: "absolute", top: 14, right: 14,
                fontFamily: "var(--lw-font-mono)", fontSize: 10,
                color: "oklch(100% 0 0 / 0.3)", letterSpacing: 0.06,
              }}>etta · drm · {course.id.slice(-4)}</div>

              {/* Cinematic placeholder content */}
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div style={{
                  fontFamily: "var(--lw-font-serif)", fontStyle: "italic",
                  fontSize: 96, color: "oklch(100% 0 0 / 0.08)",
                }}>♪</div>
              </div>
              <div style={{
                position: "absolute", left: 24, bottom: 70, right: 24,
                color: "oklch(100% 0 0 / 0.85)",
              }}>
                <div className="lw-mono" style={{ fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase", opacity: 0.6 }}>
                  Lesson {idx + 1} of {allLessons.length}
                </div>
                <h2 style={{ fontFamily: "var(--lw-font-serif)", fontSize: 24, marginTop: 6, color: "oklch(100% 0 0 / 0.95)" }}>
                  {active.title}
                </h2>
              </div>

              {/* Captions */}
              {captions && playing && (
                <div style={{
                  position: "absolute", left: "50%", bottom: 110, transform: "translateX(-50%)",
                  background: "oklch(0% 0 0 / 0.7)", color: "oklch(100% 0 0 / 0.95)",
                  padding: "8px 14px", borderRadius: 6,
                  fontSize: 14, maxWidth: "70%", textAlign: "center",
                }}>
                  …a TLM-103 will pick up the wren's high register without bringing the wind in with it.
                </div>
              )}

              {/* Big play */}
              {!playing && (
                <button
                  onClick={() => setPlaying(true)}
                  style={{
                    position: "absolute", inset: 0, margin: "auto",
                    width: 76, height: 76, borderRadius: "50%",
                    background: "oklch(100% 0 0 / 0.95)",
                    color: "oklch(15% 0 0)", border: 0,
                    display: "grid", placeItems: "center",
                    boxShadow: "0 12px 40px oklch(0% 0 0 / 0.6)",
                  }}>
                  <Icon name="play" size={32}/>
                </button>
              )}

              {/* Controls bar */}
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                padding: "12px 16px",
                background: "linear-gradient(180deg, transparent, oklch(0% 0 0 / 0.7))",
                color: "oklch(100% 0 0 / 0.9)",
              }}>
                {/* Scrubber */}
                <div style={{ height: 4, background: "oklch(100% 0 0 / 0.18)", borderRadius: 999, position: "relative", marginBottom: 10 }}>
                  <div style={{ position: "absolute", inset: 0, width: "34%", background: "var(--lw-ochre)", borderRadius: 999 }}/>
                  <div style={{ position: "absolute", inset: 0, width: "42%", background: "oklch(100% 0 0 / 0.25)", borderRadius: 999 }}/>
                  <div style={{
                    position: "absolute", left: "34%", top: "50%", transform: "translate(-50%, -50%)",
                    width: 10, height: 10, borderRadius: "50%", background: "var(--lw-ochre)",
                    boxShadow: "0 0 0 3px oklch(0% 0 0 / 0.5)",
                  }}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setPlaying(!playing)} style={ctrlBtn}>
                    <Icon name={playing ? "pause" : "play"} size={16}/>
                  </button>
                  <span className="lw-mono" style={{ fontSize: 12 }}>06:34 / 19:00</span>
                  <button style={ctrlBtn}><Icon name="vol" size={16}/></button>
                  <span style={{ flex: 1 }}/>
                  <button style={{ ...ctrlBtn, opacity: captions ? 1 : 0.5 }} onClick={() => setCaptions(!captions)}>
                    <Icon name="captions" size={16}/>
                  </button>
                  <select value={speed} onChange={e => setSpeed(e.target.value)}
                    style={{ ...ctrlBtn, paddingRight: 8, paddingLeft: 8, color: "inherit", background: "transparent", border: "1px solid oklch(100% 0 0 / 0.18)" }}>
                    {["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"].map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button style={ctrlBtn}><Icon name="settings" size={16}/></button>
                  <button style={ctrlBtn}><Icon name="fs" size={16}/></button>
                </div>
              </div>
            </div>
          </div>

          {/* Lesson body */}
          <div style={{ padding: "20px 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
              <div>
                <p className="lw-meta">{course.title} · {active.module}</p>
                <h1 style={{ fontSize: 26, marginTop: 6 }}>{active.title}</h1>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="lw-btn"><Icon name="bookmark" size={14}/> Save</button>
                <button className="lw-btn lw-btn-primary"><Icon name="check" size={14}/> Mark complete</button>
              </div>
            </div>

            <p style={{ color: "var(--lw-ink-2)", marginTop: 14, lineHeight: 1.6, maxWidth: 640 }}>
              In this lesson we compare three small-diaphragm condensers in the field, listen for
              self-noise on a quiet wren passage, and review when a parabolic dish earns its weight.
            </p>

            {/* Materials (UC-04-02 surface) */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16 }}>Lesson materials</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
                {[
                  { name: "Mic comparison chart", size: "PDF · 248 KB" },
                  { name: "Sample spectrograms", size: "ZIP · 4.2 MB" },
                ].map(m => (
                  <div key={m.name} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: 12,
                    background: "var(--lw-bg-2)", border: "1px solid var(--lw-line)",
                    borderRadius: "var(--lw-r)",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: "var(--lw-bg-3)", display: "grid", placeItems: "center", color: "var(--lw-ink-2)",
                    }}><Icon name="doc" size={18}/></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                      <div className="lw-meta">{m.size}</div>
                    </div>
                    <button className="lw-btn lw-btn-ghost" style={{ padding: 6 }}><Icon name="down" size={14}/></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Prev / Next */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 10 }}>
              <button className="lw-btn" style={{ flex: 1, justifyContent: "flex-start" }}>
                <Icon name="chev-r" size={14} style={{ transform: "rotate(180deg)" }}/>
                <div style={{ textAlign: "left" }}>
                  <div className="lw-meta">Previous</div>
                  <div style={{ fontWeight: 500 }}>Choosing a recorder</div>
                </div>
              </button>
              <button className="lw-btn lw-btn-primary" style={{ flex: 1, justifyContent: "flex-end" }}>
                <div style={{ textAlign: "right" }}>
                  <div className="lw-meta" style={{ color: "color-mix(in oklch, var(--lw-ochre-ink) 80%, transparent)" }}>Next</div>
                  <div style={{ fontWeight: 600 }}>Wind, weather & you</div>
                </div>
                <Icon name="arrow" size={14}/>
              </button>
            </div>
            <div style={{ height: 32 }}/>
          </div>
        </div>

        {/* Outline */}
        {outlineOpen && (
          <aside style={{ overflowY: "auto", background: "var(--lw-bg)" }}>
            <div style={{
              position: "sticky", top: 0, padding: "20px 22px 14px",
              background: "var(--lw-bg)", borderBottom: "1px solid var(--lw-line)",
              zIndex: 2,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16 }}>Course outline</h3>
                <button onClick={() => setOutlineOpen(false)} className="lw-btn lw-btn-ghost" style={{ padding: 6 }}>
                  <Icon name="x" size={14}/>
                </button>
              </div>
              <p className="lw-meta" style={{ marginTop: 4 }}>{course.title}</p>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div className="lw-progress" style={{ flex: 1 }}><span style={{ width: `${percent}%` }}/></div>
                <span className="lw-meta" style={{ minWidth: 56, textAlign: "right" }}>{percent}%</span>
              </div>
              <p className="lw-meta" style={{ marginTop: 4 }}>{completed} of {allLessons.length} lessons</p>
            </div>

            <div style={{ padding: "8px 12px 24px" }}>
              {COURSE_OUTLINE.modules.map((m, mi) => {
                const mDone = m.lessons.every(l => l.status === "complete");
                return (
                  <div key={m.id} style={{ marginTop: 8 }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
                      padding: "8px 10px",
                    }}>
                      <span className="lw-mono" style={{ color: "var(--lw-ink-4)", fontSize: 11 }}>
                        {String(mi + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{m.title}</span>
                      {mDone && <Icon name="check" size={14}/>}
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {m.lessons.map(l => {
                        const isActive = l.id === activeId;
                        return (
                          <li key={l.id}>
                            <button onClick={() => setActiveId(l.id)}
                              style={{
                                width: "100%", textAlign: "left",
                                display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center",
                                padding: "8px 10px", borderRadius: 8,
                                background: isActive ? "color-mix(in oklch, var(--lw-ochre) 18%, transparent)" : "transparent",
                                border: "1px solid " + (isActive ? "color-mix(in oklch, var(--lw-ochre) 35%, transparent)" : "transparent"),
                                color: l.status === "locked" ? "var(--lw-ink-3)" : "var(--lw-ink)",
                                cursor: "pointer", font: "inherit",
                              }}>
                              {l.status === "complete" ? <span style={{ color: "var(--lw-moss)" }}><Icon name="check" size={14}/></span>
                                : isActive ? <span style={{ color: "var(--lw-ochre)" }}><Icon name="play" size={12}/></span>
                                : l.status === "locked" ? <span style={{ color: "var(--lw-ink-4)" }}><Icon name="lock" size={11}/></span>
                                : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--lw-line-2)", display: "inline-block" }}/>}
                              <span style={{ fontSize: 13, lineHeight: 1.3 }}>{l.title}</span>
                              <span className="lw-meta" style={{ fontSize: 11 }}>{l.durationMin}m</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {!outlineOpen && (
          <button onClick={() => setOutlineOpen(true)} className="lw-btn"
            style={{
              position: "absolute", right: 20, top: 84,
              padding: "8px 12px",
            }}>
            <Icon name="list" size={14}/> Outline
          </button>
        )}
      </div>
    </div>
  );
};

const ctrlBtn = {
  background: "transparent", border: 0, color: "inherit",
  padding: 6, borderRadius: 6, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
  font: "inherit", fontSize: 12,
};

window.PlayerScreen = PlayerScreen;
