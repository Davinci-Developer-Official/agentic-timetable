"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STORAGE_KEY = "agentic_timetable_personal_v1";

function slotKey(slot) {
  return `${slot.course}|${slot.day}|${slot.time}|${slot.unitCode || slot.value}`;
}

function renderFormattedLine(line, lineIdx) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span key={lineIdx}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
      {"\n"}
    </span>
  );
}

function FormattedAgentText({ text }) {
  const lines = String(text || "").split("\n");
  return <>{lines.map((line, idx) => renderFormattedLine(line, idx))}</>;
}

function SlotCard({ slot, saved, onToggleSave }) {
  const modeClass = `mode-${slot.mode || "in-person"}`;
  const badgeClass =
    slot.mode === "online"
      ? "badge-online"
      : slot.mode === "self-paced"
        ? "badge-selfpaced"
        : "badge-inperson";

  return (
    <div className={`slot-card ${modeClass}`}>
      <div className="slot-top">
        <span className="slot-code">{slot.unitCode || slot.course}</span>
        <button
          type="button"
          className={`save-btn ${saved ? "saved" : ""}`}
          onClick={() => onToggleSave(slot)}
        >
          {saved ? "Saved" : "+ Save"}
        </button>
      </div>
      <div className="slot-title">{slot.unitName || slot.value}</div>
      <div className="slot-meta">
        <span className={`badge ${badgeClass}`}>{slot.venue || slot.mode}</span>
        {slot.lecturer ? <span>{slot.lecturer}</span> : null}
        <span>· {slot.course}</span>
      </div>
    </div>
  );
}

function WeeklyGrid({ slots, savedKeys, onToggleSave, emptyMessage }) {
  if (!slots.length) {
    return (
      <div className="card">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  const activeDays = DAYS.filter(
    (d) => (d !== "Saturday" && d !== "Sunday") || slots.some((s) => s.day === d)
  );
  const times = [...new Set(slots.map((s) => s.time).filter(Boolean))].sort();

  return (
    <div className="grid-scroll">
      <table className="weekly-grid">
        <thead>
          <tr>
            <th>Time</th>
            {activeDays.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t}>
              <td className="time-col">{t}</td>
              {activeDays.map((d) => {
                const cellSlots = slots.filter((s) => s.day === d && s.time === t);
                return (
                  <td key={d}>
                    {cellSlots.map((slot) => (
                      <SlotCard
                        key={slotKey(slot)}
                        slot={slot}
                        saved={savedKeys.has(slotKey(slot))}
                        onToggleSave={onToggleSave}
                      />
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotsTable({ slots, savedKeys, onToggleSave, emptyMessage }) {
  if (!slots.length) {
    return (
      <div className="card">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Course</th>
            <th>Unit</th>
            <th>Lecturer</th>
            <th>Venue</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const key = slotKey(s);
            const saved = savedKeys.has(key);
            return (
              <tr key={key}>
                <td>{s.day}</td>
                <td>{s.time}</td>
                <td>{s.course}</td>
                <td>
                  <strong>{s.unitCode || ""}</strong> {s.unitName || s.value}
                </td>
                <td>{s.lecturer || "-"}</td>
                <td>{s.venue || s.mode}</td>
                <td>
                  <button
                    type="button"
                    className={`save-btn ${saved ? "saved" : ""}`}
                    onClick={() => onToggleSave(s)}
                  >
                    {saved ? "Saved" : "+ Save"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TimetableWorkspace({
  initialStats,
  initialCourses,
  initialDefaultCourse,
  initialSlots
}) {
  const [activeTab, setActiveTab] = useState("explorer");
  const [stats, setStats] = useState(initialStats);
  const [courses, setCourses] = useState(initialCourses);

  // Explorer filters & results
  const [courseFilter, setCourseFilter] = useState(initialDefaultCourse || "");
  const [queryFilter, setQueryFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [currentSlots, setCurrentSlots] = useState(initialSlots || []);
  const [explorerStatus, setExplorerStatus] = useState(
    `Showing ${(initialSlots || []).length} class${(initialSlots || []).length === 1 ? "" : "es"}${
      initialDefaultCourse ? ` for "${initialDefaultCourse}"` : ""
    }.`
  );

  // Personal schedule
  const [personalSlots, setPersonalSlots] = useState([]);
  const [personalClashData, setPersonalClashData] = useState(null);

  // Free rooms & clashes
  const [freeDay, setFreeDay] = useState("");
  const [freeTime, setFreeTime] = useState("");
  const [freeRooms, setFreeRooms] = useState(null);
  const [freeRoomsLoading, setFreeRoomsLoading] = useState(false);

  const [clashItemsInput, setClashItemsInput] = useState("");
  const [clashResult, setClashResult] = useState(null);
  const [clashLoading, setClashLoading] = useState(false);

  // Agent chat
  const [agentModeBadge, setAgentModeBadge] = useState("Tool-Calling Ready");
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "agent",
      text: "Hi! I'm your **Agentic Timetable** assistant. Ask me about courses, units, lecturers, free rooms, or schedule conflicts.",
      steps: [],
      slots: []
    }
  ]);
  const sessionIdRef = useRef(`web-${Math.random().toString(36).slice(2, 10)}`);
  const chatEndRef = useRef(null);

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPersonalSlots(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personalSlots));
    } catch {
      // ignore storage errors
    }
  }, [personalSlots]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeTab !== "personal" || !personalSlots.length) {
      setPersonalClashData(null);
      return;
    }
    let cancelled = false;
    fetch("/api/clashes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: personalSlots })
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPersonalClashData(data);
      })
      .catch(() => {
        if (!cancelled) setPersonalClashData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, personalSlots]);

  const savedKeys = useMemo(() => new Set(personalSlots.map(slotKey)), [personalSlots]);

  function toggleSaveSlot(slot) {
    const key = slotKey(slot);
    setPersonalSlots((prev) => {
      const exists = prev.some((s) => slotKey(s) === key);
      return exists ? prev.filter((s) => slotKey(s) !== key) : [...prev, slot];
    });
  }

  async function refreshDatasetMeta() {
    const [nextStats, nextCourses] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/courses").then((r) => r.json())
    ]);
    setStats(nextStats);
    setCourses(nextCourses);
    if (nextCourses.length && !courseFilter) {
      setCourseFilter(nextCourses[0].course);
    }
  }

  async function runSearch(overrides = {}) {
    const course = overrides.course !== undefined ? overrides.course : courseFilter.trim();
    const q = overrides.q !== undefined ? overrides.q : queryFilter.trim();
    const day = overrides.day !== undefined ? overrides.day : dayFilter;
    const mode = overrides.mode !== undefined ? overrides.mode : modeFilter;

    const params = new URLSearchParams();
    if (course) params.set("course", course);
    if (q) params.set("q", q);
    if (day) params.set("day", day);
    if (mode) params.set("mode", mode);

    setExplorerStatus("Searching...");
    try {
      const resp = await fetch(`/api/search?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Search failed");
      const slots = data.slots || [];
      setCurrentSlots(slots);
      setExplorerStatus(
        `Showing ${slots.length} class${slots.length === 1 ? "" : "es"}${
          course ? ` for "${course}"` : ""
        }.`
      );
    } catch (err) {
      setExplorerStatus(`Search failed: ${err.message}`);
    }
  }

  async function downloadIcs(slots, title) {
    if (!slots.length) {
      alert("No classes available to export.");
      return;
    }
    const resp = await fetch("/api/export/ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots, title })
    });
    if (!resp.ok) {
      alert("Failed to export calendar.");
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFindFreeRooms() {
    setFreeRoomsLoading(true);
    try {
      const params = new URLSearchParams();
      if (freeDay) params.set("day", freeDay);
      if (freeTime) params.set("time", freeTime);
      const resp = await fetch(`/api/free-rooms?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to load free rooms");
      setFreeRooms(data.availability || []);
    } catch (err) {
      setFreeRooms({ error: err.message });
    } finally {
      setFreeRoomsLoading(false);
    }
  }

  async function handleRunClashCheck(mode) {
    setClashLoading(true);
    try {
      if (mode === "system") {
        const resp = await fetch("/api/clashes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "system" })
        });
        const data = await resp.json();
        setClashResult({ kind: "system", data });
      } else {
        const items = clashItemsInput
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (items.length < 2) {
          setClashResult({
            kind: "error",
            message: "Enter at least two comma-separated units or courses."
          });
          return;
        }
        const resp = await fetch("/api/clashes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items })
        });
        const data = await resp.json();
        setClashResult({ kind: "custom", data });
      }
    } catch (err) {
      setClashResult({ kind: "error", message: err.message });
    } finally {
      setClashLoading(false);
    }
  }

  async function sendAgentMessage(rawMessage) {
    const trimmed = rawMessage.trim();
    if (!trimmed || chatSending) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      steps: [],
      slots: []
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatSending(true);

    try {
      const resp = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: sessionIdRef.current })
      });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.error || "Agent request failed");

      setAgentModeBadge(
        res.mode === "gemini" || res.mode === "openai"
          ? `LLM Agent (${res.mode})`
          : "Local Tool Agent"
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "agent",
          text: res.reply,
          steps: res.steps || [],
          slots: res.slots || []
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "agent",
          text: `Error: ${err.message}`,
          steps: [],
          slots: []
        }
      ]);
    } finally {
      setChatSending(false);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadFeedback({ ok: false, text: "Please select a .xlsx or .xls file first." });
      return;
    }
    setUploading(true);
    setUploadFeedback({ ok: true, text: `Uploading and parsing ${selectedFile.name}...` });
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.error || "Upload failed");

      const note = res.ephemeral ? " (active for current Vercel session)" : "";
      setUploadFeedback({
        ok: true,
        text: `Loaded ${res.courseCount} courses from ${res.filename}${note}!`
      });
      await refreshDatasetMeta();
      await runSearch();
      setTimeout(() => setUploadOpen(false), res.ephemeral ? 1300 : 700);
    } catch (err) {
      setUploadFeedback({ ok: false, text: `Upload failed: ${err.message}` });
    } finally {
      setUploading(false);
    }
  }

  const displaySlots = currentSlots.slice(0, 120);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              AT
            </div>
            <div>
              <h1>Agentic Timetable</h1>
              <p className="subtitle">
                Next.js AI-assisted university schedule explorer, clash auditor &amp; room finder
              </p>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="badge badge-neutral">
              {stats.courseCount} courses · {stats.classCount} classes
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setUploadFeedback(null);
                setUploadOpen(true);
              }}
            >
              Upload Excel
            </button>
            <Link href="/about" className="btn btn-ghost">
              Docs
            </Link>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="main-panel">
          <nav className="tabs" role="tablist">
            <button
              type="button"
              className={`tab ${activeTab === "explorer" ? "active" : ""}`}
              onClick={() => setActiveTab("explorer")}
            >
              Timetable Explorer
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "rooms" ? "active" : ""}`}
              onClick={() => setActiveTab("rooms")}
            >
              Free Rooms &amp; Clashes
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "personal" ? "active" : ""}`}
              onClick={() => setActiveTab("personal")}
            >
              My Schedule <span className="pill-count">{personalSlots.length}</span>
            </button>
          </nav>

          {activeTab === "explorer" && (
            <div>
              <form
                className="card filter-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <div className="filter-grid">
                  <div className="field">
                    <label htmlFor="courseInput">Course / Track</label>
                    <input
                      id="courseInput"
                      list="courseList"
                      type="text"
                      placeholder="e.g. BBAM Y1S1, BBIT, BSCIT"
                      value={courseFilter}
                      onChange={(e) => setCourseFilter(e.target.value)}
                      autoComplete="off"
                    />
                    <datalist id="courseList">
                      {courses.map((c) => (
                        <option key={c.course} value={c.course} />
                      ))}
                    </datalist>
                  </div>

                  <div className="field">
                    <label htmlFor="queryInput">Keyword (Unit / Lecturer / Room)</label>
                    <input
                      id="queryInput"
                      type="text"
                      placeholder="e.g. BAC 111, Samuel, L209"
                      value={queryFilter}
                      onChange={(e) => setQueryFilter(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="daySelect">Day</label>
                    <select
                      id="daySelect"
                      value={dayFilter}
                      onChange={(e) => setDayFilter(e.target.value)}
                    >
                      <option value="">All Days</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="modeSelect">Mode</label>
                    <select
                      id="modeSelect"
                      value={modeFilter}
                      onChange={(e) => setModeFilter(e.target.value)}
                    >
                      <option value="">All Modes</option>
                      <option value="in-person">In-Person</option>
                      <option value="online">Online</option>
                      <option value="self-paced">Self-Paced</option>
                    </select>
                  </div>
                </div>

                <div className="filter-actions">
                  <div className="btn-group">
                    <button type="submit" className="btn btn-primary">
                      Search Timetable
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setCourseFilter("");
                        setQueryFilter("");
                        setDayFilter("");
                        setModeFilter("");
                        runSearch({ course: "", q: "", day: "", mode: "" });
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="btn-group">
                    <div className="segmented" role="group" aria-label="View mode">
                      <button
                        type="button"
                        className={`seg-btn ${viewMode === "grid" ? "active" : ""}`}
                        onClick={() => setViewMode("grid")}
                      >
                        Weekly Grid
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${viewMode === "table" ? "active" : ""}`}
                        onClick={() => setViewMode("table")}
                      >
                        Table
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => downloadIcs(currentSlots, courseFilter || "Timetable")}
                    >
                      Export .ics
                    </button>
                  </div>
                </div>
              </form>

              <div className="status-bar">{explorerStatus}</div>
              <div className="results-container">
                {viewMode === "grid" ? (
                  <WeeklyGrid
                    slots={displaySlots}
                    savedKeys={savedKeys}
                    onToggleSave={toggleSaveSlot}
                    emptyMessage="No classes matched those filters. Try clearing filters or asking the Timetable Agent."
                  />
                ) : (
                  <SlotsTable
                    slots={displaySlots}
                    savedKeys={savedKeys}
                    onToggleSave={toggleSaveSlot}
                    emptyMessage="No classes matched those filters. Try clearing filters or asking the Timetable Agent."
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === "rooms" && (
            <div className="two-col">
              <div className="card">
                <h2>Free Room Finder</h2>
                <p className="muted">
                  Find physical classrooms with no scheduled lectures for a given window.
                </p>
                <div className="filter-grid compact">
                  <div className="field">
                    <label htmlFor="freeDaySelect">Day</label>
                    <select
                      id="freeDaySelect"
                      value={freeDay}
                      onChange={(e) => setFreeDay(e.target.value)}
                    >
                      <option value="">All Days</option>
                      {DAYS.slice(0, 5).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="freeTimeSelect">Time Slot</label>
                    <select
                      id="freeTimeSelect"
                      value={freeTime}
                      onChange={(e) => setFreeTime(e.target.value)}
                    >
                      <option value="">All Slots</option>
                      <option value="0800-1100">0800-1100</option>
                      <option value="1100-1400">1100-1400</option>
                      <option value="1400-1700">1400-1700</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={freeRoomsLoading}
                  onClick={handleFindFreeRooms}
                >
                  {freeRoomsLoading ? "Checking..." : "Find Available Rooms"}
                </button>

                <div className="stack-list">
                  {freeRooms?.error ? (
                    <div className="alert alert-danger">{freeRooms.error}</div>
                  ) : Array.isArray(freeRooms) ? (
                    freeRooms.slice(0, 12).map((slot) => (
                      <div key={`${slot.day}-${slot.time}`} className="mini-card">
                        <strong>
                          {slot.day} · {slot.time}
                        </strong>{" "}
                        <span className="muted">
                          ({slot.freeCount}/{slot.totalPhysicalVenues} free)
                        </span>
                        <div className="room-chips">
                          {slot.freeVenues.slice(0, 18).map((r) => (
                            <span key={r} className="room-chip">
                              {r}
                            </span>
                          ))}
                          {slot.freeVenues.length > 18 ? (
                            <span className="muted">+{slot.freeVenues.length - 18} more</span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : null}
                </div>
              </div>

              <div className="card">
                <h2>Clash &amp; Conflict Auditor</h2>
                <p className="muted">
                  Check unit/course combinations for overlaps or audit the entire timetable.
                </p>
                <div className="field" style={{ margin: "12px 0" }}>
                  <label htmlFor="clashItemsInput">Units or Courses (comma-separated)</label>
                  <input
                    id="clashItemsInput"
                    type="text"
                    placeholder="e.g. BAC 111, BEC 111, BCU 112"
                    value={clashItemsInput}
                    onChange={(e) => setClashItemsInput(e.target.value)}
                  />
                </div>
                <div className="btn-group">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={clashLoading}
                    onClick={() => handleRunClashCheck("custom")}
                  >
                    Check Selection
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={clashLoading}
                    onClick={() => handleRunClashCheck("system")}
                  >
                    Audit Whole Timetable
                  </button>
                </div>

                <div className="stack-list">
                  {clashResult?.kind === "error" ? (
                    <div className="alert alert-danger">{clashResult.message}</div>
                  ) : clashResult?.kind === "system" ? (
                    clashResult.data.totalClashes === 0 ? (
                      <div className="alert alert-success">
                        0 venue or lecturer clashes found across the entire timetable!
                      </div>
                    ) : (
                      <>
                        <div className="alert alert-danger">
                          Found {clashResult.data.venueClashes.length} venue clash(es) and{" "}
                          {clashResult.data.lecturerClashes.length} lecturer clash(es).
                        </div>
                        {[...clashResult.data.venueClashes, ...clashResult.data.lecturerClashes]
                          .slice(0, 15)
                          .map((c, idx) => (
                            <div key={idx} className="mini-card">
                              <strong>
                                {c.day} {c.time} ·{" "}
                                {c.type === "venue" ? `Room ${c.venue}` : c.lecturer}
                              </strong>
                              <ul>
                                {c.entries.map((e, i) => (
                                  <li key={i}>
                                    {e.course}: {e.unitCode || e.value} ({e.venue})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                      </>
                    )
                  ) : clashResult?.kind === "custom" ? (
                    clashResult.data.clashCount === 0 ? (
                      <div className="alert alert-success">
                        No clashes detected across {clashResult.data.evaluatedCount} matched
                        classes!
                      </div>
                    ) : (
                      clashResult.data.clashes.map((c, idx) => (
                        <div key={idx} className="mini-card">
                          <strong>
                            Conflict on {c.day} {c.time}
                          </strong>
                          <ul>
                            {c.slots.map((s, i) => (
                              <li key={i}>
                                {s.unitCode || s.value} — {s.venue || "TBA"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {activeTab === "personal" && (
            <div className="card">
              <div className="personal-header">
                <div>
                  <h2>My Personal Timetable</h2>
                  <p className="muted">
                    Save classes from Explorer to build your week and catch clashes automatically.
                  </p>
                </div>
                <div className="btn-group">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => downloadIcs(personalSlots, "My Personal Timetable")}
                  >
                    Export .ics Calendar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPersonalSlots([])}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {personalSlots.length > 0 && personalClashData ? (
                personalClashData.clashCount > 0 ? (
                  <div className="alert alert-danger">
                    <strong>Schedule Clash Detected ({personalClashData.clashCount}):</strong>
                    <ul>
                      {personalClashData.clashes.map((c, idx) => (
                        <li key={idx}>
                          <strong>
                            {c.day} {c.time}
                          </strong>
                          : {c.slots.map((s) => `${s.unitCode || s.value} (${s.course})`).join(" vs ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="alert alert-success">
                    No schedule clashes in your saved classes ({personalSlots.length} classes).
                  </div>
                )
              ) : null}

              <WeeklyGrid
                slots={personalSlots}
                savedKeys={savedKeys}
                onToggleSave={toggleSaveSlot}
                emptyMessage="You haven't saved any classes yet. Click + Save on any class card in the Explorer."
              />
            </div>
          )}
        </section>

        <aside className="agent-panel card">
          <div className="agent-header">
            <div>
              <h2>Timetable Agent</h2>
              <span className="badge badge-accent">{agentModeBadge}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setMessages([
                  {
                    id: `reset-${Date.now()}`,
                    role: "agent",
                    text: "Conversation cleared. How can I help with the timetable?",
                    steps: [],
                    slots: []
                  }
                ])
              }
            >
              Clear
            </button>
          </div>

          <div className="quick-prompts">
            {[
              { label: "BBAM Y1S1", prompt: "Show BBAM Y1S1 timetable" },
              { label: "Free rooms Tue AM", prompt: "Find free rooms on Tuesday 0800-1100" },
              { label: "Samuel Mbugua", prompt: "Show all classes by Samuel Mbugua" },
              { label: "Audit clashes", prompt: "Audit timetable clashes" },
              { label: "Stats", prompt: "Give me a timetable overview" }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className="chip"
                onClick={() => sendAgentMessage(item.prompt)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role === "user" ? "msg-user" : "msg-agent"}`}>
                <div className="msg-bubble">
                  <FormattedAgentText text={m.text} />
                </div>

                {m.steps?.length ? (
                  <details className="tool-trace">
                    <summary>Agent tool calls ({m.steps.length})</summary>
                    <ul>
                      {m.steps.map((s, idx) => (
                        <li key={idx}>
                          <code>{s.tool}</code> — {s.summary}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {m.slots?.length ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setCurrentSlots(m.slots);
                      setExplorerStatus(`Loaded ${m.slots.length} classes from Timetable Agent.`);
                      setActiveTab("explorer");
                    }}
                  >
                    Load {m.slots.length} classes into Explorer
                  </button>
                ) : null}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = chatInput;
              setChatInput("");
              sendAgentMessage(msg);
            }}
          >
            <input
              type="text"
              placeholder="Ask anything about the timetable..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" disabled={chatSending}>
              {chatSending ? "..." : "Send"}
            </button>
          </form>
        </aside>
      </main>

      {uploadOpen ? (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="uploadModalTitle">
          <div className="modal-backdrop" onClick={() => setUploadOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="uploadModalTitle">Upload Excel Timetable</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setUploadOpen(false)}
              >
                &times;
              </button>
            </div>
            <p className="muted">
              Upload a <code>.xlsx</code> or <code>.xls</code> timetable workbook. All search, free
              room, and agent queries update immediately.
            </p>
            <div className="upload-dropzone">
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <p className="muted" style={{ marginTop: "8px" }}>
                {selectedFile ? selectedFile.name : "Choose an Excel file (.xlsx / .xls)"}
              </p>
            </div>
            <div className="upload-feedback">
              {uploadFeedback ? (
                <span style={{ color: uploadFeedback.ok ? "var(--emerald)" : "var(--danger)" }}>
                  {uploadFeedback.text}
                </span>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setUploadOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading}
                onClick={handleUpload}
              >
                {uploading ? "Uploading..." : "Upload & Parse"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
