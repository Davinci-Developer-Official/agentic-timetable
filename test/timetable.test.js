const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  parseCellValue,
  parseRows,
  parseWorkbook,
  parseWorkbookBuffer
} = require("../lib/parser");
const { TimetableStore } = require("../lib/store");
const { TimetableAgent } = require("../lib/agent");
const { getRuntime } = require("../lib/runtime");

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

test("parseWorkbook and parseWorkbookBuffer parse the real Excel timetable", () => {
  assert.ok(fs.existsSync(SAMPLE_EXCEL), "Sample Excel file must exist");
  const fromPath = parseWorkbook(SAMPLE_EXCEL);
  const fromBuffer = parseWorkbookBuffer(fs.readFileSync(SAMPLE_EXCEL));
  assert.ok(fromPath.length > 50, `Expected >50 courses, got ${fromPath.length}`);
  assert.equal(fromBuffer.length, fromPath.length);
  const bbam = fromBuffer.find((c) => c.course === "BBAM Y1S1");
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

test("getRuntime supports Vercel tmp persistence from in-memory workbook buffer", () => {
  const tmpPersist = path.join(os.tmpdir(), `agentic-tt-next-${Date.now()}.json`);
  try {
    const rt = getRuntime({
      fresh: true,
      isVercel: true,
      dataFile: path.join(ROOT_DIR, "structured.json"),
      persistFile: tmpPersist
    });
    assert.equal(rt.isVercel, true);
    assert.ok(rt.store.courses.length > 100);

    const courses = rt.store.replaceFromWorkbookBuffer(
      fs.readFileSync(SAMPLE_EXCEL),
      "uploaded.xlsx"
    );
    assert.ok(courses.length > 50);
    assert.ok(fs.existsSync(tmpPersist));
  } finally {
    if (fs.existsSync(tmpPersist)) fs.rmSync(tmpPersist, { force: true });
  }
});
