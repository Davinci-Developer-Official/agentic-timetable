import Link from "next/link";

export const metadata = {
  title: "Documentation | Agentic Timetable"
};

export default function AboutPage() {
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
              <p className="subtitle">Documentation &amp; API Reference</p>
            </div>
          </div>
          <div className="topbar-actions">
            <Link href="/" className="btn btn-primary">
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: "960px",
          margin: "24px auto",
          padding: "0 20px 40px",
          display: "grid",
          gap: "16px"
        }}
      >
        <section className="card">
          <h2>Overview</h2>
          <p style={{ marginTop: "8px" }}>
            <strong>Agentic Timetable</strong> is a Next.js App Router platform built from{" "}
            <em>easy-timetable</em>. It parses raw Excel timetables into structured fields
            (course, day, time, lecturer, unit code, unit name, venue, and delivery mode) and
            pairs them with a tool-calling Timetable Agent, clash auditor, free-room finder, and{" "}
            <code>.ics</code> calendar export.
          </p>
        </section>

        <section className="card">
          <h2>Key Capabilities</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: "20px", display: "grid", gap: "6px" }}>
            <li>
              <strong>Smart Excel Parsing</strong>: Extracts lecturer, unit code, unit name, venue,
              and delivery mode (in-person, online, self-paced) across all workbook sheets.
            </li>
            <li>
              <strong>Tool-Calling Timetable Agent</strong>: Answers natural-language questions
              (e.g. <em>&quot;Find free rooms on Tuesday 0800-1100&quot;</em>,{" "}
              <em>&quot;Audit timetable clashes&quot;</em>) with optional Gemini/OpenAI API keys or
              zero-key local planning.
            </li>
            <li>
              <strong>Free Room &amp; Clash Auditor</strong>: Finds unoccupied physical rooms and
              detects personal or system-wide lecturer/venue conflicts.
            </li>
            <li>
              <strong>Personal Schedule &amp; .ics Export</strong>: Save classes into a personal
              week view with automatic clash alerts and export to Google/Outlook/Apple Calendar.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>API Route Handlers</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: "20px", display: "grid", gap: "6px" }}>
            <li>
              <code>GET /api/health</code> — Server status &amp; loaded dataset info
            </li>
            <li>
              <code>GET /api/stats</code> — Course, class, lecturer, venue, and clash statistics
            </li>
            <li>
              <code>GET /api/courses?q=&amp;program=&amp;year=&amp;semester=</code> — List matching
              courses
            </li>
            <li>
              <code>GET /api/search?q=&amp;course=&amp;day=&amp;time=&amp;lecturer=&amp;unit=&amp;venue=&amp;mode=</code>{" "}
              — Multi-facet search
            </li>
            <li>
              <code>GET /api/free-rooms?day=&amp;time=</code> — Available physical classrooms
            </li>
            <li>
              <code>POST /api/clashes</code> — Check conflicts for <code>{"{ items }"}</code> or{" "}
              <code>{"{ mode: \"system\" }"}</code>
            </li>
            <li>
              <code>POST /api/agent/chat</code> — Natural-language tool-calling assistant
            </li>
            <li>
              <code>POST /api/upload</code> (or <code>POST /file</code>) — Upload &amp; live-reload
              Excel timetable
            </li>
            <li>
              <code>POST /api/export/ics</code> — Export selected slots or course as{" "}
              <code>.ics</code>
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
