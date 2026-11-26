const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { parseCellValue, parseRows, parseWorkbook } = require("../lib/parser");
const { TimetableStore } = require("../lib/store");
const { TimetableAgent } = require("../lib/agent");
const { createApp } = require("../index");

const ROOT_DIR = path.join(__dirname, "..");
const SAMPLE_EXCEL = path.join(
  ROOT_DIR,
  "src",
  "1759071164828-RUIRU CAMPUS DRAFT SEPTEMBER - DECEMBER 2025 TEACHING TIMETABLE (1).xlsx"
);

test("parseCellValue extracts lecturer, unitCode, unitName, venue, and mode", () => {
  const inPerson = parseCellValue("SAMUEL MBUGUA\r\nBAC 111 financial accounting 1\r\nL209");
  assert.equal(inPerson.lecturer, "SAMUEL MBUGUA");
  assert.equal(inPerson.unitCode, "BAC 111");
  assert.equal(inPerson.unitName, "financial accounting 1");
  assert.equal(inPerson.venue, "L209");
  assert.equal(inPerson.mode, "in-person");

  const online = parseCellValue("FLORA MWANJA\r\nBCU 111 Communication Skills\r\nONLINE");
  assert.equal(online.lecturer, "FLORA MWANJA");
  assert.equal(online.unitCode, "BCU 111");
  assert.equal(online.venue, "ONLINE");
  assert.equal(online.mode, "online");

  const selfPaced = parseCellValue("BCU 113 Health and Wellness\r\nManagement SELF PACED LEARNING");
  assert.equal(selfPaced.lecturer, "");
  assert.equal(selfPaced.unitCode, "BCU 113");
  assert.equal(selfPaced.unitName, "Health and Wellness Management");
  assert.equal(selfPaced.mode, "self-paced");
});

test("parseRows omits trailing empty columns", () => {
  const rows = [
    ["BBAM Y1S1", "", "", ""],
    ["", "0800-1100", "1100-1400", ""],
    ["Monday", "SAMUEL MBUGUA BAC 111 Accounting L209", "", ""]
  ];
  const parsed = parseRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].program, "BBAM");
  assert.equal(parsed[0].year, "Y1");
  assert.equal(parsed[0].semester, "S1");
  assert.equal(parsed[0].timetable[0].slots.length, 2);
});

test("parseWorkbook parses the real Excel timetable", () => {
  assert.ok(fs.existsSync(SAMPLE_EXCEL), "Sample Excel file must exist");
  const courses = parseWorkbook(SAMPLE_EXCEL);
  assert.ok(courses.length > 50, `Expected >50 courses, got ${courses.length}`);
  const bbam = courses.find((c) => c.course === "BBAM Y1S1");
  assert.ok(bbam, "Expected BBAM Y1S1 in parsed workbook");
  assert.ok(bbam.timetable.length >= 5);
});

test("TimetableStore search, free rooms, clash detection, and ICS export", () => {
  const store = new TimetableStore(path.join(ROOT_DIR, "structured.json"));
  assert.ok(store.courses.length > 100);

  const bbamSlots = store.getCourseSlots("BBAM Y1S1");
  assert.ok(bbamSlots.length > 0);
  assert.ok(bbamSlots.some((s) => s.unitCode === "BAC 111"));

  const mbugua = store.searchSlots({ lecturer: "SAMUEL MBUGUA" });
  assert.ok(mbugua.length > 0);

  const freeTue = store.findFreeVenues({ day: "Tuesday", time: "0800-1100" });
  assert.equal(freeTue.length, 1);
  assert.ok(!freeTue[0].freeVenues.includes("L209"), "L209 is occupied on Tuesday 0800-1100");
  assert.ok(!freeTue[0].freeVenues.includes("ONLINE"), "ONLINE must not be listed as a physical room");

  const clashRes = store.detectClashes([
    { day: "Monday", time: "0800-1100", unitCode: "BAC 111", venue: "L209", value: "BAC 111" },
    { day: "Monday", time: "0800-1100", unitCode: "BEC 111", venue: "A401", value: "BEC 111" }
  ]);
  assert.equal(clashRes.clashCount, 1);

  const noClash = store.detectClashes([
    { day: "Monday", time: "0800-1100", unitCode: "BAC 111", venue: "L209", value: "BAC 111" },
    { day: "Tuesday", time: "0800-1100", unitCode: "BEC 111", venue: "A401", value: "BEC 111" }
  ]);
  assert.equal(noClash.clashCount, 0);

  const ics = store.buildIcsCalendar(bbamSlots.slice(0, 2), "BBAM Y1S1");
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("RRULE:FREQ=WEEKLY"));
});

test("TimetableAgent handles natural-language queries with tool traces", async () => {
  const store = new TimetableStore(path.join(ROOT_DIR, "structured.json"));
  const agent = new TimetableAgent(store);

  const courseRes = await agent.chat({ message: "Show BBAM Y1S1 timetable" });
  assert.equal(courseRes.steps[0].tool, "get_course_timetable");
  assert.ok(courseRes.slots.length > 0);

  const roomRes = await agent.chat({ message: "Find free rooms on Tuesday 0800-1100" });
  assert.equal(roomRes.steps[0].tool, "find_free_rooms");
  assert.ok(roomRes.reply.includes("Tuesday 0800-1100"));

  const lecRes = await agent.chat({ message: "Show classes taught by Samuel Mbugua" });
  assert.equal(lecRes.steps[0].tool, "search_classes");
  assert.ok(lecRes.slots.length > 0);
});

test("HTTP API endpoints and live Excel upload work end-to-end", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-tt-"));
  const tmpJson = path.join(tmpDir, "structured.json");
  fs.copyFileSync(path.join(ROOT_DIR, "structured.json"), tmpJson);

  const { app } = createApp({ dataFile: tmpJson, uploadDir: tmpDir });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    assert.equal(health.status, "ok");
    assert.ok(health.coursesLoaded > 100);

    const search = await fetch(`${baseUrl}/api/search?course=BBAM%20Y1S1&day=Tuesday`).then((r) => r.json());
    assert.ok(search.count >= 1);

    const legacy = await fetch(`${baseUrl}/course/BBAM%20Y1S1`).then((r) => r.json());
    assert.ok(Array.isArray(legacy) && legacy.length > 0);

    const agentReply = await fetch(`${baseUrl}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Give me a timetable overview" })
    }).then((r) => r.json());
    assert.equal(agentReply.steps[0].tool, "get_timetable_stats");

    // Verify Excel upload updates live store
    const form = new FormData();
    const excelBuffer = fs.readFileSync(SAMPLE_EXCEL);
    form.append("file", new Blob([excelBuffer]), "timetable.xlsx");

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: form
    }).then((r) => r.json());
    assert.equal(uploadRes.success, true);
    assert.ok(uploadRes.courseCount > 50);

    // Ensure normalized structured.json is significantly smaller and clean
    const saved = JSON.parse(fs.readFileSync(tmpJson, "utf8"));
    assert.equal(saved.length, uploadRes.courseCount);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Vercel serverless entrypoint (api/index.js) and tmp-based uploads work", async () => {
  const vercelApp = require("../api/index");
  assert.equal(typeof vercelApp, "function");

  const tmpPersist = path.join(os.tmpdir(), `agentic-tt-vercel-${Date.now()}.json`);
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-tt-vup-"));
  const { app } = createApp({
    isVercel: true,
    uploadDir: tmpUploads,
    persistFile: tmpPersist
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    assert.equal(health.runtime, "vercel");
    assert.ok(health.coursesLoaded > 100);

    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(SAMPLE_EXCEL)]), "vercel-upload.xlsx");
    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: form
    }).then((r) => r.json());
    assert.equal(uploadRes.success, true);
    assert.equal(uploadRes.ephemeral, true);
    assert.ok(fs.existsSync(tmpPersist));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpUploads, { recursive: true, force: true });
    if (fs.existsSync(tmpPersist)) fs.rmSync(tmpPersist, { force: true });
  }
});
