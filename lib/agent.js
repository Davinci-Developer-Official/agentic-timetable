const { cleanText } = require("./parser");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Tool registry exposed to both the LLM function-calling loop and the local planner.
 */
function createTools(store) {
  return {
    get_course_timetable: {
      description:
        "Get the weekly timetable for a course/program (e.g. 'BBAM Y1S1', 'BBIT Y2S1', 'BSCIT Y3S2'). Optionally filter by day.",
      parameters: {
        type: "object",
        properties: {
          course: { type: "string", description: "Course name or code like 'BBAM Y1S1'" },
          day: { type: "string", description: "Optional weekday like 'Monday'" }
        },
        required: ["course"]
      },
      execute: ({ course, day }) => {
        const matchedCourses = store.findMatchingCourses(course);
        const slots = store.getCourseSlots(course, { day, allMatches: matchedCourses.length <= 4 });
        return {
          matchedCourses: matchedCourses.map((c) => c.course),
          count: slots.length,
          slots: slots.slice(0, 60)
        };
      }
    },

    list_courses: {
      description: "List available courses/programs, optionally filtered by keyword, program, year (Y1..Y4), or semester (S1..S2).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          program: { type: "string" },
          year: { type: "string" },
          semester: { type: "string" }
        }
      },
      execute: (args = {}) => {
        const courses = store.listCourses(args);
        return { count: courses.length, courses: courses.slice(0, 40) };
      }
    },

    search_classes: {
      description:
        "Search scheduled classes by any combination of keyword, course, day, time, lecturer, unit code/name, venue, or delivery mode (in-person, online, self-paced).",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          course: { type: "string" },
          day: { type: "string" },
          time: { type: "string" },
          lecturer: { type: "string" },
          unit: { type: "string" },
          venue: { type: "string" },
          mode: { type: "string" }
        }
      },
      execute: (args = {}) => {
        const slots = store.searchSlots(args);
        return { count: slots.length, slots: slots.slice(0, 50) };
      }
    },

    find_free_rooms: {
      description: "Find unoccupied physical rooms/venues for a given day and/or time slot (e.g. '0800-1100').",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", description: "Weekday e.g. 'Tuesday'" },
          time: { type: "string", description: "Time window e.g. '0800-1100'" }
        }
      },
      execute: ({ day, time } = {}) => {
        const availability = store.findFreeVenues({ day, time });
        return { count: availability.length, availability: availability.slice(0, 15) };
      }
    },

    check_clashes: {
      description:
        "Check for time conflicts among a list of courses or unit codes (e.g. ['BAC 111', 'BEC 111']), or pass mode='system' to audit the whole timetable.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "List of unit codes or course names to check for clashes"
          },
          mode: { type: "string", description: "Set to 'system' to audit whole timetable" }
        }
      },
      execute: ({ items = [], mode = "" } = {}) => {
        if (mode === "system" || (!items.length && !mode)) {
          return store.findSystemClashes();
        }
        return store.detectClashes(items);
      }
    },

    get_timetable_stats: {
      description: "Get overall dataset statistics: total courses, classes, lecturers, venues, day distribution, and system clashes.",
      parameters: { type: "object", properties: {} },
      execute: () => store.getStats()
    }
  };
}

/**
 * Extract structured entities from a natural-language user prompt.
 */
function extractEntities(message, store) {
  const text = cleanText(message);
  const upper = text.toUpperCase();

  // Day detection
  let day = "";
  for (const d of DAYS) {
    if (new RegExp(`\\b${d}\\b`, "i").test(text)) {
      day = d;
      break;
    }
  }
  if (!day && /\btoday\b/i.test(text)) {
    const idx = new Date().getDay(); // 0=Sun..6=Sat
    day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx];
  } else if (!day && /\btomorrow\b/i.test(text)) {
    const idx = (new Date().getDay() + 1) % 7;
    day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx];
  }

  // Time detection
  let time = "";
  const timeMatch = text.match(/\b(\d{4}\s*-\s*\d{4})\b/);
  if (timeMatch) {
    time = timeMatch[1].replace(/\s+/g, "");
  } else if (/\bmorning\b/i.test(text)) {
    time = "0800-1100";
  } else if (/\bmidday|noon|lunch\b/i.test(text)) {
    time = "1100-1400";
  } else if (/\bafternoon|evening\b/i.test(text)) {
    time = "1400-1700";
  }

  // Course detection (prefer exact match against loaded courses, longest first)
  let course = "";
  const sortedCourses = [...store.courses]
    .map((c) => c.course.toUpperCase())
    .sort((a, b) => b.length - a.length);
  for (const cName of sortedCourses) {
    const escaped = cName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(upper)) {
      course = cName;
      break;
    }
  }
  if (!course) {
    const fullCourseMatch = upper.match(/\b([A-Z]{2,6}(?:\s+ZU)?\s+Y\d+\s*S\d+)\b/);
    if (fullCourseMatch) {
      course = fullCourseMatch[1].replace(/\s+/g, " ");
    } else {
      const programs = new Set(store.courses.map((c) => c.program.toUpperCase()));
      for (const p of programs) {
        if (new RegExp(`\\b${p}\\b`).test(upper)) {
          course = p;
          break;
        }
      }
    }
  }

  // Unit code detection (e.g., "BAC 111", "BCU112")
  const unitMatches = [...upper.matchAll(/\b([A-Z]{2,5}\s*-?\s*\d{3,4}[A-Z]?)\b/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );

  // Venue detection (e.g., "L209", "A401", "L211B")
  const venueMatch = upper.match(/\b([LA]\d{3}[A-Z]?|LAB\s*\d+)\b/);
  const venue = venueMatch ? venueMatch[1] : "";

  // Mode detection
  let mode = "";
  if (/\bonline\b/i.test(text)) mode = "online";
  else if (/\bself[- ]?paced\b/i.test(text)) mode = "self-paced";
  else if (/\bin[- ]?person|physical\b/i.test(text)) mode = "in-person";

  // Lecturer match against known lecturers
  let lecturer = "";
  const knownLecturers = [...new Set(store.getAllSlots().map((s) => s.lecturer).filter(Boolean))];
  for (const lec of knownLecturers) {
    if (upper.includes(lec.toUpperCase())) {
      lecturer = lec;
      break;
    }
  }
  if (!lecturer) {
    // Try last/first name match if prefixed by "by", "lecturer", "dr", "prof", or two capitalized words
    const byMatch = text.match(/(?:by|lecturer|taught by|prof\.?|dr\.?|mr\.?|ms\.?)\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (byMatch) {
      const candidate = byMatch[1].trim().toUpperCase();
      const hit = knownLecturers.find((l) => l.toUpperCase().includes(candidate));
      if (hit) lecturer = hit;
      else lecturer = byMatch[1].trim();
    }
  }

  return { text, day, time, course, unitMatches, venue, mode, lecturer };
}

class TimetableAgent {
  constructor(store) {
    this.store = store;
    this.tools = createTools(store);
    this.sessions = new Map();
  }

  getToolDeclarations() {
    return Object.entries(this.tools).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters
    }));
  }

  runTool(name, args = {}) {
    const tool = this.tools[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const output = tool.execute(args);
    return output;
  }

  async chat({ message, sessionId = "default" }) {
    const cleanMessage = cleanText(message);
    if (!cleanMessage) {
      return {
        reply: "Ask me about any course, unit, lecturer, free room, or schedule conflict!",
        steps: [],
        slots: [],
        mode: "local"
      };
    }

    const history = this.sessions.get(sessionId) || [];

    let result;
    if (process.env.GEMINI_API_KEY) {
      try {
        result = await this.runGeminiAgent(cleanMessage, history);
      } catch (err) {
        console.warn("Gemini API fallback to local agent:", err.message);
        result = this.runLocalAgent(cleanMessage);
        result.note = `Used local agent fallback (${err.message})`;
      }
    } else if (process.env.OPENAI_API_KEY) {
      try {
        result = await this.runOpenAIAgent(cleanMessage, history);
      } catch (err) {
        console.warn("OpenAI API fallback to local agent:", err.message);
        result = this.runLocalAgent(cleanMessage);
        result.note = `Used local agent fallback (${err.message})`;
      }
    } else {
      result = this.runLocalAgent(cleanMessage);
    }

    history.push({ role: "user", content: cleanMessage });
    history.push({ role: "assistant", content: result.reply });
    this.sessions.set(sessionId, history.slice(-12));

    return result;
  }

  /**
   * Smart deterministic tool-calling agent when no external LLM key is configured.
   */
  runLocalAgent(message) {
    const entities = extractEntities(message, this.store);
    const steps = [];
    let collectedSlots = [];
    let reply = "";
    let extra = {};

    const recordStep = (tool, args, summary, data) => {
      steps.push({ tool, args, summary });
      return data;
    };

    const lower = message.toLowerCase();

    // 1. Free rooms intent
    if (/\b(free|empty|available|open|unoccupied)\s+(room|rooms|venue|venues|classrooms?|halls?)\b/i.test(lower)) {
      const args = {};
      if (entities.day) args.day = entities.day;
      if (entities.time) args.time = entities.time;
      const res = recordStep(
        "find_free_rooms",
        args,
        `Checked room availability${args.day ? ` on ${args.day}` : ""}${args.time ? ` at ${args.time}` : ""}`,
        this.runTool("find_free_rooms", args)
      );

      if (!res.availability.length) {
        reply = "I couldn't find any matching day/time windows in the current timetable.";
      } else {
        const lines = res.availability.slice(0, 6).map((slot) => {
          const preview = slot.freeVenues.slice(0, 12).join(", ");
          const more = slot.freeVenues.length > 12 ? ` (+${slot.freeVenues.length - 12} more)` : "";
          return `- **${slot.day} ${slot.time}**: ${slot.freeCount}/${slot.totalPhysicalVenues} rooms free — ${preview}${more}`;
        });
        reply = `Here are the available physical rooms:\n${lines.join("\n")}`;
        extra.availability = res.availability;
      }
      return { reply, steps, slots: [], mode: "local", ...extra };
    }

    // 2. Clash / conflict detection intent
    if (/\b(clash|clashes|conflict|conflicts|overlap|double[- ]?book)\b/i.test(lower)) {
      const items = [...entities.unitMatches];
      const courseMatches = [
        ...message.toUpperCase().matchAll(/\b([A-Z]{2,6}(?:\s+ZU)?\s+Y\d+\s*S\d+)\b/g)
      ].map((m) => m[1]);
      items.push(...courseMatches);

      if (items.length >= 2) {
        const res = recordStep(
          "check_clashes",
          { items },
          `Checked time conflicts across ${items.join(", ")}`,
          this.runTool("check_clashes", { items })
        );
        if (res.clashCount === 0) {
          reply = `No schedule clashes detected across **${items.join(", ")}** (checked ${res.evaluatedCount} scheduled sessions).`;
        } else {
          const details = res.clashes
            .map(
              (c) =>
                `- **${c.day} ${c.time}**: ${c.slots
                  .map((s) => `${s.unitCode || s.value} (${s.venue || "TBA"})`)
                  .join(" vs ")}`
            )
            .join("\n");
          reply = `Found **${res.clashCount} clash(es)** across ${items.join(", ")}:\n${details}`;
          collectedSlots = res.clashes.flatMap((c) => c.slots);
        }
      } else {
        const res = recordStep(
          "check_clashes",
          { mode: "system" },
          "Audited entire timetable for venue and lecturer clashes",
          this.runTool("check_clashes", { mode: "system" })
        );
        if (res.totalClashes === 0) {
          reply = "System audit complete: **0 venue or lecturer clashes** found in the current timetable.";
        } else {
          const sample = [...res.venueClashes, ...res.lecturerClashes].slice(0, 6);
          const lines = sample.map((c) => {
            const who = c.type === "venue" ? `Room ${c.venue}` : `Lecturer ${c.lecturer}`;
            return `- **${c.day} ${c.time}** (${who}): ${c.entries
              .map((e) => `${e.course} ${e.unitCode || e.unitName}`)
              .join(" vs ")}`;
          });
          reply = `System audit found **${res.venueClashes.length} venue clash(es)** and **${res.lecturerClashes.length} lecturer clash(es)**:\n${lines.join("\n")}`;
          collectedSlots = sample.flatMap((c) => c.entries);
        }
      }
      return { reply, steps, slots: collectedSlots, mode: "local" };
    }

    // 3. Stats / overview / summary intent
    if (/\b(stat|stats|summary|overview|how many|busiest|count|total)\b/i.test(lower) && !entities.course) {
      const stats = recordStep(
        "get_timetable_stats",
        {},
        "Fetched dataset statistics and day distribution",
        this.runTool("get_timetable_stats", {})
      );
      const daySummary = Object.entries(stats.dayCounts)
        .map(([d, n]) => `${d}: ${n}`)
        .join(", ");
      reply =
        `Timetable Overview:\n` +
        `- **${stats.courseCount}** courses across **${stats.programCount}** programs\n` +
        `- **${stats.classCount}** scheduled classes (**${stats.modeCounts["in-person"]}** in-person, **${stats.modeCounts.online}** online, **${stats.modeCounts["self-paced"]}** self-paced)\n` +
        `- **${stats.lecturerCount}** lecturers and **${stats.physicalVenueCount}** physical venues\n` +
        `- Classes by day: ${daySummary}\n` +
        `- System conflicts: **${stats.systemClashes.total}**`;
      return { reply, steps, slots: [], mode: "local", stats };
    }

    // 4. List courses intent
    if (/\b(list|all|what|which)\s+(courses|programs|degrees|diplomas)\b/i.test(lower)) {
      const args = {};
      if (entities.course && !/\bY\d+S\d+\b/i.test(entities.course)) args.program = entities.course;
      const res = recordStep(
        "list_courses",
        args,
        `Listed courses${args.program ? ` for ${args.program}` : ""}`,
        this.runTool("list_courses", args)
      );
      const preview = res.courses.slice(0, 20).map((c) => `${c.course} (${c.classCount})`).join(", ");
      reply = `Found **${res.count}** course(s): ${preview}${res.count > 20 ? ` ...and ${res.count - 20} more.` : "."}`;
      return { reply, steps, slots: [], mode: "local" };
    }

    // 5. Course timetable lookup (when full course like BBAM Y1S1 or program + day is provided)
    if (entities.course && /\bY\d+\s*S\d+\b/i.test(entities.course) && !entities.lecturer && !entities.unitMatches.length) {
      const args = { course: entities.course };
      if (entities.day) args.day = entities.day;
      const res = recordStep(
        "get_course_timetable",
        args,
        `Looked up timetable for ${entities.course}${entities.day ? ` on ${entities.day}` : ""}`,
        this.runTool("get_course_timetable", args)
      );

      if (!res.slots.length) {
        reply = `I couldn't find any scheduled classes for **${entities.course}**${entities.day ? ` on ${entities.day}` : ""}.`;
      } else {
        collectedSlots = res.slots;
        const lines = res.slots
          .slice(0, 12)
          .map(
            (s) =>
              `- **${s.day} ${s.time}**: ${s.unitCode ? `${s.unitCode} ${s.unitName}` : s.value} — *${s.venue || "TBA"}*${s.lecturer ? ` (${s.lecturer})` : ""}`
          );
        reply = `Found **${res.count} class(es)** for **${res.matchedCourses.slice(0, 3).join(", ")}**${entities.day ? ` on ${entities.day}` : ""}:\n${lines.join("\n")}${res.count > 12 ? `\n...and ${res.count - 12} more shown in the results panel.` : ""}`;
      }
      return { reply, steps, slots: collectedSlots, mode: "local" };
    }

    // 6. General multi-facet search (unit code, lecturer, venue, day, time, mode, keyword)
    const searchArgs = {};
    if (entities.course) searchArgs.course = entities.course;
    if (entities.day) searchArgs.day = entities.day;
    if (entities.time) searchArgs.time = entities.time;
    if (entities.lecturer) searchArgs.lecturer = entities.lecturer;
    if (entities.unitMatches.length === 1) searchArgs.unit = entities.unitMatches[0];
    if (entities.venue) searchArgs.venue = entities.venue;
    if (entities.mode) searchArgs.mode = entities.mode;

    // If no structured filters extracted, treat meaningful words as a keyword search
    if (Object.keys(searchArgs).length === 0) {
      const stop = new Set([
        "show", "me", "find", "get", "what", "when", "where", "is", "are", "the", "all",
        "classes", "class", "unit", "units", "timetable", "schedule", "for", "on", "in",
        "at", "with", "taught", "by", "do", "we", "have", "please", "can", "you", "tell"
      ]);
      const keywords = message
        .replace(/[^\w\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stop.has(w.toLowerCase()));
      if (keywords.length) searchArgs.q = keywords.join(" ");
    }

    const res = recordStep(
      "search_classes",
      searchArgs,
      `Searched classes with filters: ${JSON.stringify(searchArgs)}`,
      this.runTool("search_classes", searchArgs)
    );

    if (!res.slots.length) {
      reply =
        "I didn't find classes matching that query. Try asking for a course (e.g. `BBAM Y1S1`), unit code (`BAC 111`), lecturer (`Samuel Mbugua`), room (`L209`), or `free rooms on Tuesday 0800-1100`.";
    } else {
      collectedSlots = res.slots;
      const lines = res.slots
        .slice(0, 12)
        .map(
          (s) =>
            `- **${s.course}** | **${s.day} ${s.time}**: ${s.unitCode ? `${s.unitCode} ${s.unitName}` : s.value} — *${s.venue || "TBA"}*${s.lecturer ? ` (${s.lecturer})` : ""}`
        );
      reply = `Found **${res.count} matching class(es)**:\n${lines.join("\n")}${res.count > 12 ? `\n...and ${res.count - 12} more shown in the results panel.` : ""}`;
    }

    return { reply, steps, slots: collectedSlots, mode: "local" };
  }

  /**
   * Gemini REST function-calling loop (used automatically when GEMINI_API_KEY is configured).
   */
  async runGeminiAgent(message, history) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const contents = [
      ...history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }]
      })),
      { role: "user", parts: [{ text: message }] }
    ];

    const steps = [];
    let latestSlots = [];

    for (let iter = 0; iter < 5; iter++) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are Agentic Timetable, a precise university schedule assistant. Always call tools to look up real data before answering. Summarize results clearly and concisely."
              }
            ]
          },
          contents,
          tools: [{ functionDeclarations: this.getToolDeclarations() }]
        })
      });

      if (!resp.ok) {
        throw new Error(`Gemini HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      contents.push({ role: "model", parts });

      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = parts.map((p) => p.text || "").join("\n").trim();
        return { reply: text || "Done.", steps, slots: latestSlots, mode: "gemini" };
      }

      const responseParts = [];
      for (const part of calls) {
        const { name, args } = part.functionCall;
        const output = this.runTool(name, args || {});
        if (Array.isArray(output?.slots) && output.slots.length) {
          latestSlots = output.slots;
        }
        steps.push({ tool: name, args: args || {}, summary: `Executed ${name}` });
        responseParts.push({
          functionResponse: {
            name,
            response: { result: output }
          }
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return {
      reply: "Completed tool lookup.",
      steps,
      slots: latestSlots,
      mode: "gemini"
    };
  }

  /**
   * OpenAI Chat Completions tool-calling loop (used when OPENAI_API_KEY is configured).
   */
  async runOpenAIAgent(message, history) {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const apiKey = process.env.OPENAI_API_KEY;
    const messages = [
      {
        role: "system",
        content:
          "You are Agentic Timetable, a precise university schedule assistant. Always use tools to retrieve real timetable data before answering."
      },
      ...history,
      { role: "user", content: message }
    ];

    const tools = this.getToolDeclarations().map((t) => ({
      type: "function",
      function: t
    }));

    const steps = [];
    let latestSlots = [];

    for (let iter = 0; iter < 5; iter++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, tools })
      });

      if (!resp.ok) {
        throw new Error(`OpenAI HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      messages.push(msg);

      const toolCalls = msg?.tool_calls || [];
      if (!toolCalls.length) {
        return { reply: msg?.content || "Done.", steps, slots: latestSlots, mode: "openai" };
      }

      for (const tc of toolCalls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const output = this.runTool(tc.function.name, args);
        if (Array.isArray(output?.slots) && output.slots.length) {
          latestSlots = output.slots;
        }
        steps.push({ tool: tc.function.name, args, summary: `Executed ${tc.function.name}` });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(output)
        });
      }
    }

    return { reply: "Completed tool lookup.", steps, slots: latestSlots, mode: "openai" };
  }
}

module.exports = { TimetableAgent, createTools, extractEntities };
