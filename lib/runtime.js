const fs = require("fs");
const os = require("os");
const path = require("path");
const { TimetableStore } = require("./store");
const { TimetableAgent } = require("./agent");

const GLOBAL_KEY = "__agenticTimetableRuntime";

function loadEnv(envPath = path.join(process.cwd(), ".env")) {
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

function getRuntime(options = {}) {
  loadEnv();

  if (!options.fresh && globalThis[GLOBAL_KEY]) {
    return globalThis[GLOBAL_KEY];
  }

  const isVercel = Boolean(options.isVercel ?? process.env.VERCEL);
  const dataFile = options.dataFile || path.join(process.cwd(), "structured.json");
  const persistFile =
    options.persistFile ||
    (isVercel ? path.join(os.tmpdir(), "agentic-timetable-structured.json") : dataFile);

  const store = new TimetableStore(dataFile, { persistFilePath: persistFile });
  const agent = new TimetableAgent(store);

  const runtime = { store, agent, isVercel };
  if (!options.fresh) {
    globalThis[GLOBAL_KEY] = runtime;
  }
  return runtime;
}

module.exports = { getRuntime, loadEnv };
