const xlsx = require("xlsx");

const DAY_REGEX = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const COURSE_HEADER_REGEX = /\bY\d+\s*S\d+\b/i;
const UNIT_CODE_REGEX = /\b([A-Z]{2,6}\s*-?\s*\d{3,4}[A-Z]?)\b/;

/**
 * Clean raw spreadsheet text while preserving meaningful word boundaries.
 */
function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\u00A0\u200B\u202F]/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a course title such as "BBAM Y3S1 ACCOUNTING" or "BSE Y1S1 GROUP 2".
 */
function parseCourseMeta(courseName) {
  const cleaned = cleanText(courseName).toUpperCase();
  const match = cleaned.match(/^(.+?)\s+Y(\d+)\s*S(\d+)(?:\s+(.*))?$/i);
  if (!match) {
    return {
      program: cleaned.split(/\s+/)[0] || cleaned,
      year: null,
      semester: null,
      specialization: ""
    };
  }
  return {
    program: match[1].trim(),
    year: `Y${match[2]}`,
    semester: `S${match[3]}`,
    specialization: (match[4] || "").trim()
  };
}

/**
 * Extract structured fields (lecturer, unitCode, unitName, venue, mode)
 * from a raw timetable cell string.
 */
function parseCellValue(rawValue) {
  const raw = rawValue === null || rawValue === undefined ? "" : String(rawValue);
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return {
      value: "",
      lecturer: "",
      unitCode: "",
      unitName: "",
      venue: "",
      mode: "in-person"
    };
  }

  let working = cleaned;
  let venue = "";
  let mode = "in-person";

  // Detect delivery mode or venue at the end of the cell
  const specialVenuePatterns = [
    /\b(SELF[\s-]+PACED(?:\s+LEARNING)?)\b$/i,
    /\b(ONLINE(?:\s+CLASS)?)\b$/i,
    /\b(VIRTUAL(?:\s+CLASS)?)\b$/i,
    /\b(BLENDED)\b$/i
  ];

  for (const pattern of specialVenuePatterns) {
    const m = working.match(pattern);
    if (m) {
      venue = m[1].toUpperCase();
      working = working.slice(0, m.index).trim();
      if (/ONLINE|VIRTUAL/i.test(venue)) mode = "online";
      else if (/SELF/i.test(venue)) mode = "self-paced";
      break;
    }
  }

  if (!venue) {
    // Match physical room/lab codes such as L209, L211B, A401, L005, LAB 2, ICT LAB 1, AUDITORIUM
    const roomMatch = working.match(
      /\b((?:ICT\s+)?LAB\s*\d*[A-Z]?|AUDITORIUM|HALL\s*\d*[A-Z]?|[A-Z]{1,3}\s?\d{2,4}[A-Z]?)$/i
    );
    if (roomMatch) {
      venue = roomMatch[1].toUpperCase().replace(/\s+/g, " ").trim();
      working = working.slice(0, roomMatch.index).trim();
    }
  }

  let lecturer = "";
  let unitCode = "";
  let unitName = working;

  const unitMatch = working.match(UNIT_CODE_REGEX);
  if (unitMatch) {
    unitCode = unitMatch[1].replace(/\s+/g, " ").trim().toUpperCase();
    lecturer = working.slice(0, unitMatch.index).trim();
    unitName = working.slice(unitMatch.index + unitMatch[0].length).trim();
  }

  return {
    value: cleaned,
    lecturer,
    unitCode,
    unitName: unitName || cleaned,
    venue,
    mode
  };
}

/**
 * Parse a 2D array of spreadsheet rows into clean course timetable objects,
 * omitting trailing empty columns.
 */
function parseRows(rows) {
  const courses = [];
  let currentCourse = null;
  let currentTimes = [];

  for (let i = 0; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const firstCell = cleanText(row[0]);

    if (firstCell && COURSE_HEADER_REGEX.test(firstCell)) {
      currentCourse = {
        course: firstCell,
        ...parseCourseMeta(firstCell),
        timetable: []
      };
      courses.push(currentCourse);

      // Look ahead for the nearest non-empty time header row
      currentTimes = [];
      for (let k = i + 1; k < Math.min(i + 4, rows.length); k++) {
        const candidate = Array.isArray(rows[k]) ? rows[k] : [];
        const hasTimes = candidate.slice(1).some((c) => cleanText(c) !== "");
        if (hasTimes && !DAY_REGEX.test(cleanText(candidate[0]))) {
          currentTimes = candidate.map((c) => cleanText(c));
          break;
        }
      }
      continue;
    }

    if (firstCell && DAY_REGEX.test(firstCell) && currentCourse) {
      const dayName = firstCell.match(DAY_REGEX)[1];
      const normalizedDay =
        dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();

      const slots = [];
      const maxCols = Math.max(row.length, currentTimes.length);
      for (let j = 1; j < maxCols; j++) {
        const time = currentTimes[j] || "";
        const rawVal = row[j];
        const parsed = parseCellValue(rawVal);

        // Skip completely empty trailing cells without time headers or values
        if (!time && !parsed.value) continue;

        slots.push({
          time,
          ...parsed
        });
      }

      currentCourse.timetable.push({
        day: normalizedDay,
        slots
      });
    }
  }

  return courses;
}

/**
 * Parse an Excel (.xlsx / .xls) file across all sheets and return structured courses.
 */
function parseWorkbook(filePath) {
  const wb = xlsx.readFile(filePath);
  const allCourses = [];
  const seen = new Map();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const parsed = parseRows(rows);
    for (const course of parsed) {
      const key = course.course.toUpperCase();
      if (!seen.has(key)) {
        seen.set(key, course);
        allCourses.push(course);
      } else {
        // Merge any additional days if the same course appears across sheets
        const existing = seen.get(key);
        existing.timetable.push(...course.timetable);
      }
    }
  }

  return allCourses;
}

/**
 * Normalize already-parsed structured JSON (e.g., legacy structured.json)
 * to ensure every course and slot has clean parsed metadata and no empty filler slots.
 */
function normalizeStructuredData(rawCourses) {
  if (!Array.isArray(rawCourses)) return [];
  return rawCourses
    .filter((c) => c && c.course)
    .map((c) => {
      const meta = parseCourseMeta(c.course);
      const timetable = Array.isArray(c.timetable)
        ? c.timetable.map((d) => ({
            day: cleanText(d.day),
            slots: Array.isArray(d.slots)
              ? d.slots
                  .map((s) => {
                    const time = cleanText(s.time);
                    const value = cleanText(s.value);
                    if (!time && !value) return null;
                    const parsed =
                      s.unitCode !== undefined && s.venue !== undefined && s.lecturer !== undefined
                        ? {
                            value,
                            lecturer: cleanText(s.lecturer),
                            unitCode: cleanText(s.unitCode),
                            unitName: cleanText(s.unitName),
                            venue: cleanText(s.venue),
                            mode: s.mode || "in-person"
                          }
                        : parseCellValue(s.value);
                    return { time, ...parsed };
                  })
                  .filter(Boolean)
              : []
          }))
        : [];

      return {
        course: cleanText(c.course),
        program: c.program || meta.program,
        year: c.year ?? meta.year,
        semester: c.semester ?? meta.semester,
        specialization: c.specialization ?? meta.specialization,
        timetable
      };
    });
}

module.exports = {
  cleanText,
  parseCourseMeta,
  parseCellValue,
  parseRows,
  parseWorkbook,
  normalizeStructuredData
};
