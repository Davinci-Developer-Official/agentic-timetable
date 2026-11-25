# Agentic Timetable

An upgraded, agentic university timetable parser, schedule explorer, room availability finder, and conflict auditor built on top of `easy-timetable`.

## Improvements over `easy-timetable`

- **Smart Excel Parsing (`lib/parser.js`)**: Parses all workbook sheets, drops empty trailing columns, and extracts structured fields (`lecturer`, `unitCode`, `unitName`, `venue`, `mode`: `in-person`, `online`, `self-paced`).
- **Live Store (`lib/store.js`)**: Uploading a new `.xlsx`/`.xls` file immediately refreshes all search, agent, and room endpoints without restarting the server.
- **Tool-Calling Timetable Agent (`lib/agent.js`)**: Supports natural-language queries with visible tool-call traces (`get_course_timetable`, `search_classes`, `find_free_rooms`, `check_clashes`, `list_courses`, `get_timetable_stats`). Works out of the box with zero API keys, and automatically upgrades to Gemini or OpenAI function-calling when `GEMINI_API_KEY` or `OPENAI_API_KEY` is configured.
- **Free Rooms & Clash Auditor**: Finds open physical classrooms by day/time, checks custom unit/course overlaps, and audits the whole timetable for venue and lecturer conflicts.
- **Modern UI & Personal `.ics` Export (`public/`)**: Responsive Weekly Grid and Table views, `My Schedule` saved in `localStorage` with live clash detection, XSS-safe rendering, and 1-click `.ics` calendar export.

## Getting Started

```bash
npm install
npm start
```

Open `http://localhost:3003` in your browser.

### Optional LLM Configuration

Copy `.env.example` to `.env` and set either `GEMINI_API_KEY` or `OPENAI_API_KEY` if you want LLM-driven reasoning on top of the built-in tool registry.

## Running Tests

```bash
npm test
```
