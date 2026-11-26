const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { TimetableStore } = require("./lib/store");
const { TimetableAgent } = require("./lib/agent");

// Lightweight zero-dependency .env loader
function loadEnv(envPath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

function createApp(options = {}) {
  const app = express();
  const isVercel = Boolean(options.isVercel ?? process.env.VERCEL);
  const uploadDir =
    options.uploadDir ||
    (isVercel ? path.join(os.tmpdir(), "agentic-timetable-uploads") : path.join(__dirname, "src"));
  const dataFile = options.dataFile || path.join(__dirname, "structured.json");
  const persistFile =
    options.persistFile ||
    (isVercel ? path.join(os.tmpdir(), "agentic-timetable-structured.json") : dataFile);

  fs.mkdirSync(uploadDir, { recursive: true });

  const store = new TimetableStore(dataFile, { persistFilePath: persistFile });
  const agent = new TimetableAgent(store);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safeName}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error("Only .xlsx and .xls Excel files are supported"));
    }
  });

  function handleUpload(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    try {
      const courses = store.replaceFromWorkbook(req.file.path, req.file.originalname);
      return res.json({
        success: true,
        filename: req.file.originalname,
        courseCount: courses.length,
        ephemeral: isVercel,
        stats: store.getStats(),
        structured: courses
      });
    } catch (error) {
      console.error("Excel upload error:", error);
      return res.status(500).json({ error: "Failed to parse Excel timetable file" });
    } finally {
      if (isVercel && req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  // Health & Overview
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "agentic-timetable",
      runtime: isVercel ? "vercel" : "node",
      coursesLoaded: store.courses.length,
      llmConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)
    });
  });

  app.get("/api/stats", (_req, res) => {
    res.json(store.getStats());
  });

  // Upload routes (legacy + new)
  app.post("/file", upload.single("file"), handleUpload);
  app.post("/api/upload", upload.single("file"), handleUpload);

  // Courses & Search
  app.get("/api/courses", (req, res) => {
    const { q, program, year, semester } = req.query;
    res.json(store.listCourses({ query: q, program, year, semester }));
  });

  app.get("/api/search", (req, res) => {
    const { q, course, day, time, lecturer, unit, venue, mode } = req.query;
    const slots = store.searchSlots({ q, course, day, time, lecturer, unit, venue, mode });
    res.json({ count: slots.length, slots });
  });

  // Free room finder
  app.get("/api/free-rooms", (req, res) => {
    const { day, time } = req.query;
    const availability = store.findFreeVenues({ day, time });
    res.json({ count: availability.length, availability });
  });

  // Clash detector & system audit
  app.post("/api/clashes", (req, res) => {
    const { items = [], mode = "" } = req.body || {};
    if (mode === "system" || !items.length) {
      return res.json(store.findSystemClashes());
    }
    return res.json(store.detectClashes(items));
  });

  // Calendar .ics export
  app.post("/api/export/ics", (req, res) => {
    const { course, slots, title } = req.body || {};
    let targetSlots = Array.isArray(slots) ? slots : [];
    if (!targetSlots.length && course) {
      targetSlots = store.getCourseSlots(course, { allMatches: false });
    }
    if (!targetSlots.length) {
      return res.status(400).json({ error: "No classes provided to export" });
    }
    const ics = store.buildIcsCalendar(targetSlots, title || course || "Agentic Timetable");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="timetable.ics"');
    return res.send(ics);
  });

  // Agentic Assistant chat
  app.post("/api/agent/chat", async (req, res) => {
    try {
      const { message, sessionId } = req.body || {};
      const result = await agent.chat({ message, sessionId });
      res.json(result);
    } catch (err) {
      console.error("Agent error:", err);
      res.status(500).json({ error: "Agent failed to process request" });
    }
  });

  // Legacy-compatible endpoints
  app.get("/course/abrev/:abrev", (req, res) => {
    const abrev = decodeURIComponent(req.params.abrev);
    const matched = store.findMatchingCourses(abrev);
    if (!matched.length) return res.status(404).json({ error: "Course not found" });
    return res.json(matched);
  });

  app.get("/course/:course", (req, res) => {
    const courseParam = decodeURIComponent(req.params.course);
    const slots = store.getCourseSlots(courseParam, { allMatches: false });
    if (!slots.length) return res.status(404).json({ error: "Course not found" });
    return res.json(slots);
  });

  app.get("/course/:course/day/:day", (req, res) => {
    const courseParam = decodeURIComponent(req.params.course);
    const dayParam = decodeURIComponent(req.params.day);
    const matched = store.findMatchingCourses(courseParam);
    if (!matched.length) return res.status(404).json({ error: "Course not found" });
    const slots = store.getCourseSlots(courseParam, { day: dayParam, allMatches: false });
    if (!slots.length) return res.json({ message: `No classes on ${dayParam}` });
    return res.json(slots);
  });

  // Error handler (including multer errors)
  app.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message || "Request error" });
  });

  return { app, store, agent };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3003;
  const { app } = createApp();
  app.listen(port, () => {
    console.log(`Agentic Timetable listening on http://localhost:${port}`);
  });
}

module.exports = { createApp };
