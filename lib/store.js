const fs = require("fs");
const path = require("path");
const { parseWorkbook, parseWorkbookBuffer, normalizeStructuredData, cleanText } = require("./parser");

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ONLINE_MODES = new Set(["online", "self-paced"]);

function isPhysicalVenue(venue, mode) {
  if (!venue) return false;
  if (ONLINE_MODES.has(mode)) return false;
  if (/^(ONLINE|SELF[\s-]+PACED|VIRTUAL|BLENDED)/i.test(venue)) return false;
  return true;
}

function normalizeTimeRange(timeStr) {
  const cleaned = cleanText(timeStr);
  const m = cleaned.match(/(\d{2}):?(\d{2})\s*[-–]\s*(\d{2}):?(\d{2})/);
  if (!m) return null;
  return {
    start: `${m[1]}${m[2]}00`,
    end: `${m[3]}${m[4]}00`
  };
}

function escapeIcsText(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

class TimetableStore {
  constructor(dataFilePath = path.join(__dirname, "..", "structured.json"), options = {}) {
    this.dataFilePath = dataFilePath;
    this.persistFilePath = options.persistFilePath || dataFilePath;
    this.courses = [];
    this.metadata = {
      sourceFile: path.basename(dataFilePath),
      updatedAt: null
    };
    this.reload();
  }

  reload() {
    const activePath =
      this.persistFilePath !== this.dataFilePath && fs.existsSync(this.persistFilePath)
        ? this.persistFilePath
        : this.dataFilePath;

    if (!fs.existsSync(activePath)) {
      this.courses = [];
      return this.courses;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(activePath, "utf8"));
      this.courses = normalizeStructuredData(raw);
      const stat = fs.statSync(activePath);
      if (!this.metadata.updatedAt) {
        this.metadata.updatedAt = stat.mtime.toISOString();
      }
    } catch (err) {
      console.error("Failed to load timetable JSON:", err.message);
      this.courses = [];
    }
    return this.courses;
  }

  replaceFromCourses(rawCourses, sourceName = "uploaded.xlsx", persist = true) {
    this.courses = normalizeStructuredData(rawCourses);
    this.metadata = {
      sourceFile: sourceName,
      updatedAt: new Date().toISOString()
    };
    if (persist) {
      fs.mkdirSync(path.dirname(this.persistFilePath), { recursive: true });
      fs.writeFileSync(this.persistFilePath, JSON.stringify(this.courses, null, 2), "utf8");
    }
    return this.courses;
  }

  replaceFromWorkbook(filePath, originalName) {
    const parsed = parseWorkbook(filePath);
    return this.replaceFromCourses(parsed, originalName || path.basename(filePath), true);
  }

  replaceFromWorkbookBuffer(buffer, originalName = "uploaded.xlsx") {
    const parsed = parseWorkbookBuffer(buffer);
    return this.replaceFromCourses(parsed, originalName, true);
  }

  getAllSlots() {
    const flat = [];
    for (const c of this.courses) {
      for (const d of c.timetable || []) {
        for (const s of d.slots || []) {
          if (!s.value) continue;
          flat.push({
            course: c.course,
            program: c.program,
            year: c.year,
            semester: c.semester,
            specialization: c.specialization,
            day: d.day,
            time: s.time,
            value: s.value,
            lecturer: s.lecturer || "",
            unitCode: s.unitCode || "",
            unitName: s.unitName || "",
            venue: s.venue || "",
            mode: s.mode || "in-person"
          });
        }
      }
    }
    return flat;
  }

  listCourses({ query = "", program = "", year = "", semester = "" } = {}) {
    const q = cleanText(query).toUpperCase();
    const prog = cleanText(program).toUpperCase();
    const yr = cleanText(year).toUpperCase();
    const sem = cleanText(semester).toUpperCase();

    return this.courses
      .filter((c) => {
        if (q && !c.course.toUpperCase().includes(q)) return false;
        if (prog && c.program.toUpperCase() !== prog) return false;
        if (yr && (c.year || "").toUpperCase() !== yr) return false;
        if (sem && (c.semester || "").toUpperCase() !== sem) return false;
        return true;
      })
      .map((c) => {
        let classCount = 0;
        for (const d of c.timetable || []) {
          for (const s of d.slots || []) {
            if (s.value) classCount++;
          }
        }
        return {
          course: c.course,
          program: c.program,
          year: c.year,
          semester: c.semester,
          specialization: c.specialization,
          classCount
        };
      });
  }

  findMatchingCourses(courseQuery) {
    const q = cleanText(courseQuery).toUpperCase();
    if (!q) return [];
    const exact = this.courses.filter((c) => c.course.toUpperCase() === q);
    if (exact.length > 0) return exact;
    return this.courses.filter((c) => c.course.toUpperCase().includes(q));
  }

  getCourseSlots(courseQuery, { day = "", allMatches = false } = {}) {
    const matched = this.findMatchingCourses(courseQuery);
    if (!matched.length) return [];

    const targetCourses = allMatches ? matched : [matched[0]];
    const dayFilter = cleanText(day).toUpperCase();
    const slots = [];

    for (const c of targetCourses) {
      for (const d of c.timetable || []) {
        if (dayFilter && d.day.toUpperCase() !== dayFilter) continue;
        for (const s of d.slots || []) {
          if (!s.value) continue;
          slots.push({
            course: c.course,
            program: c.program,
            year: c.year,
            semester: c.semester,
            day: d.day,
            time: s.time,
            value: s.value,
            lecturer: s.lecturer || "",
            unitCode: s.unitCode || "",
            unitName: s.unitName || "",
            venue: s.venue || "",
            mode: s.mode || "in-person"
          });
        }
      }
    }
    return slots;
  }

  searchSlots({ q = "", course = "", day = "", time = "", lecturer = "", unit = "", venue = "", mode = "" } = {}) {
    const qNorm = cleanText(q).toUpperCase();
    const courseNorm = cleanText(course).toUpperCase();
    const dayNorm = cleanText(day).toUpperCase();
    const timeNorm = cleanText(time).toUpperCase();
    const lecturerNorm = cleanText(lecturer).toUpperCase();
    const unitNorm = cleanText(unit).toUpperCase();
    const venueNorm = cleanText(venue).toUpperCase();
    const modeNorm = cleanText(mode).toLowerCase();

    return this.getAllSlots().filter((slot) => {
      if (courseNorm && !slot.course.toUpperCase().includes(courseNorm)) return false;
      if (dayNorm && slot.day.toUpperCase() !== dayNorm) return false;
      if (timeNorm && !slot.time.toUpperCase().includes(timeNorm)) return false;
      if (lecturerNorm && !slot.lecturer.toUpperCase().includes(lecturerNorm)) return false;
      if (
        unitNorm &&
        !slot.unitCode.toUpperCase().includes(unitNorm) &&
        !slot.unitName.toUpperCase().includes(unitNorm)
      ) {
        return false;
      }
      if (venueNorm && !slot.venue.toUpperCase().includes(venueNorm)) return false;
      if (modeNorm && slot.mode.toLowerCase() !== modeNorm) return false;

      if (qNorm) {
        const haystack = [
          slot.course,
          slot.day,
          slot.time,
          slot.value,
          slot.lecturer,
          slot.unitCode,
          slot.unitName,
          slot.venue
        ]
          .join(" ")
          .toUpperCase();
        const terms = qNorm.split(/\s+/).filter(Boolean);
        if (!terms.every((t) => haystack.includes(t))) return false;
      }

      return true;
    });
  }

  listPhysicalVenues() {
    const venues = new Set();
    for (const s of this.getAllSlots()) {
      if (isPhysicalVenue(s.venue, s.mode)) {
        venues.add(s.venue);
      }
    }
    return [...venues].sort();
  }

  listTimeSlots() {
    const times = new Set();
    for (const c of this.courses) {
      for (const d of c.timetable || []) {
        for (const s of d.slots || []) {
          if (s.time) times.add(s.time);
        }
      }
    }
    return [...times].sort();
  }

  findFreeVenues({ day = "", time = "" } = {}) {
    const allVenues = this.listPhysicalVenues();
    const allTimes = this.listTimeSlots();
    const targetDays = day
      ? [DAY_ORDER.find((d) => d.toUpperCase() === cleanText(day).toUpperCase()) || cleanText(day)]
      : DAY_ORDER.filter((d) => this.getAllSlots().some((s) => s.day === d));

    const targetTimes = time ? [cleanText(time)] : allTimes;
    const allSlots = this.getAllSlots();

    const results = [];
    for (const d of targetDays) {
      for (const t of targetTimes) {
        const occupiedMap = new Map();
        for (const s of allSlots) {
          if (
            s.day.toUpperCase() === d.toUpperCase() &&
            s.time.toUpperCase() === t.toUpperCase() &&
            isPhysicalVenue(s.venue, s.mode)
          ) {
            if (!occupiedMap.has(s.venue)) occupiedMap.set(s.venue, []);
            occupiedMap.get(s.venue).push({
              course: s.course,
              unitCode: s.unitCode,
              unitName: s.unitName,
              lecturer: s.lecturer
            });
          }
        }
        const freeVenues = allVenues.filter((v) => !occupiedMap.has(v));
        results.push({
          day: d,
          time: t,
          totalPhysicalVenues: allVenues.length,
          occupiedCount: occupiedMap.size,
          freeCount: freeVenues.length,
          freeVenues
        });
      }
    }

    return results;
  }

  /**
   * Detect timetable clashes for a user-supplied list of course/unit identifiers or slot objects.
   */
  detectClashes(items = []) {
    const collected = [];
    for (const item of items) {
      if (typeof item === "string") {
        const trimmed = cleanText(item);
        if (!trimmed) continue;
        // Check exact/partial course match first, else unit search
        const byCourse = this.getCourseSlots(trimmed, { allMatches: false });
        if (byCourse.length > 0 && /\bY\d+\s*S\d+\b/i.test(trimmed)) {
          collected.push(...byCourse);
        } else {
          const byUnit = this.searchSlots({ unit: trimmed });
          if (byUnit.length > 0) {
            // Deduplicate identical unit+day+time across combined courses
            const seenUnit = new Set();
            for (const s of byUnit) {
              const key = `${s.day}|${s.time}|${s.unitCode}|${s.venue}`;
              if (!seenUnit.has(key)) {
                seenUnit.add(key);
                collected.push(s);
              }
            }
          } else {
            collected.push(...this.searchSlots({ q: trimmed }));
          }
        }
      } else if (item && typeof item === "object" && item.day && item.time) {
        collected.push(item);
      }
    }

    const byWindow = new Map();
    for (const s of collected) {
      const key = `${s.day.toUpperCase()}|${s.time.toUpperCase()}`;
      if (!byWindow.has(key)) byWindow.set(key, []);
      byWindow.get(key).push(s);
    }

    const clashes = [];
    for (const [, group] of byWindow) {
      // Deduplicate exact same unit in same time/venue (shared class across tracks)
      const uniqueClasses = [];
      const sigs = new Set();
      for (const s of group) {
        const sig = `${(s.unitCode || s.value).toUpperCase()}|${s.venue.toUpperCase()}`;
        if (!sigs.has(sig)) {
          sigs.add(sig);
          uniqueClasses.push(s);
        }
      }
      if (uniqueClasses.length > 1) {
        clashes.push({
          day: uniqueClasses[0].day,
          time: uniqueClasses[0].time,
          slots: uniqueClasses
        });
      }
    }

    return {
      evaluatedCount: collected.length,
      clashCount: clashes.length,
      clashes
    };
  }

  /**
   * Audit the entire timetable for genuine physical venue double-bookings and lecturer double-bookings.
   */
  findSystemClashes() {
    const allSlots = this.getAllSlots();
    const venueBuckets = new Map();
    const lecturerBuckets = new Map();

    for (const s of allSlots) {
      if (isPhysicalVenue(s.venue, s.mode) && s.time) {
        const vKey = `${s.day.toUpperCase()}|${s.time.toUpperCase()}|${s.venue.toUpperCase()}`;
        if (!venueBuckets.has(vKey)) venueBuckets.set(vKey, []);
        venueBuckets.get(vKey).push(s);
      }
      if (s.lecturer && s.time) {
        const lKey = `${s.day.toUpperCase()}|${s.time.toUpperCase()}|${s.lecturer.toUpperCase()}`;
        if (!lecturerBuckets.has(lKey)) lecturerBuckets.set(lKey, []);
        lecturerBuckets.get(lKey).push(s);
      }
    }

    const venueClashes = [];
    for (const [, list] of venueBuckets) {
      const distinctUnits = new Set(list.map((x) => `${x.unitCode || x.value}|${x.lecturer}`));
      if (distinctUnits.size > 1) {
        venueClashes.push({
          type: "venue",
          day: list[0].day,
          time: list[0].time,
          venue: list[0].venue,
          entries: list
        });
      }
    }

    const lecturerClashes = [];
    for (const [, list] of lecturerBuckets) {
      const distinctSessions = new Set(list.map((x) => `${x.unitCode || x.value}|${x.venue}`));
      if (distinctSessions.size > 1) {
        lecturerClashes.push({
          type: "lecturer",
          day: list[0].day,
          time: list[0].time,
          lecturer: list[0].lecturer,
          entries: list
        });
      }
    }

    return {
      venueClashes,
      lecturerClashes,
      totalClashes: venueClashes.length + lecturerClashes.length
    };
  }

  getStats() {
    const allSlots = this.getAllSlots();
    const programs = new Set();
    const lecturers = new Set();
    const venues = new Set();
    const dayCounts = {};
    const modeCounts = { "in-person": 0, online: 0, "self-paced": 0 };

    for (const c of this.courses) programs.add(c.program);
    for (const s of allSlots) {
      if (s.lecturer) lecturers.add(s.lecturer);
      if (isPhysicalVenue(s.venue, s.mode)) venues.add(s.venue);
      dayCounts[s.day] = (dayCounts[s.day] || 0) + 1;
      modeCounts[s.mode] = (modeCounts[s.mode] || 0) + 1;
    }

    const systemClashes = this.findSystemClashes();

    return {
      courseCount: this.courses.length,
      programCount: programs.size,
      programs: [...programs].sort(),
      classCount: allSlots.length,
      lecturerCount: lecturers.size,
      physicalVenueCount: venues.size,
      timeSlots: this.listTimeSlots(),
      dayCounts,
      modeCounts,
      systemClashes: {
        venueCount: systemClashes.venueClashes.length,
        lecturerCount: systemClashes.lecturerClashes.length,
        total: systemClashes.totalClashes
      },
      metadata: this.metadata
    };
  }

  buildIcsCalendar(slots, calendarTitle = "Agentic Timetable") {
    // Anchor weekdays to a reference week (Mon 2026-11-23 .. Sun 2026-11-29) with weekly recurrence
    const dayDates = {
      MONDAY: "20261123",
      TUESDAY: "20261124",
      WEDNESDAY: "20261125",
      THURSDAY: "20261126",
      FRIDAY: "20261127",
      SATURDAY: "20261128",
      SUNDAY: "20261129"
    };

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Agentic Timetable//University Schedule//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:${escapeIcsText(calendarTitle)}`
    ];

    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    slots.forEach((slot, idx) => {
      const dateStr = dayDates[(slot.day || "").toUpperCase()];
      const range = normalizeTimeRange(slot.time);
      if (!dateStr || !range) return;

      const summary = slot.unitCode
        ? `${slot.unitCode} - ${slot.unitName || slot.value}`
        : slot.value;
      const descParts = [];
      if (slot.course) descParts.push(`Course: ${slot.course}`);
      if (slot.lecturer) descParts.push(`Lecturer: ${slot.lecturer}`);
      if (slot.mode) descParts.push(`Mode: ${slot.mode}`);

      lines.push(
        "BEGIN:VEVENT",
        `UID:agentic-tt-${idx}-${dateStr}-${range.start}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dateStr}T${range.start}`,
        `DTEND:${dateStr}T${range.end}`,
        "RRULE:FREQ=WEEKLY;COUNT=14",
        `SUMMARY:${escapeIcsText(summary)}`,
        `LOCATION:${escapeIcsText(slot.venue || "TBA")}`,
        `DESCRIPTION:${escapeIcsText(descParts.join(" | "))}`,
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
}

module.exports = { TimetableStore, isPhysicalVenue, DAY_ORDER };
