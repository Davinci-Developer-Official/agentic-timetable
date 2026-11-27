# Agentic Timetable

A **Next.js (App Router)** university timetable explorer, conflict auditor, free-room finder, and tool-calling schedule assistant upgraded from `easy-timetable`.

## Key Features

- **Smart Excel Parsing (`lib/parser.js`)**: Parses all workbook sheets, drops empty trailing columns, and extracts structured fields (`lecturer`, `unitCode`, `unitName`, `venue`, `mode`: `in-person`, `online`, `self-paced`).
- **Live Runtime Store (`lib/store.js`, `lib/runtime.js`)**: Uploading a `.xlsx`/`.xls` workbook immediately updates search, room availability, and agent queries.
- **Tool-Calling Timetable Agent (`lib/agent.js`)**: Answers natural-language queries with visible tool-call traces (`get_course_timetable`, `search_classes`, `find_free_rooms`, `check_clashes`, `list_courses`, `get_timetable_stats`). Works out of the box with zero API keys, and automatically upgrades to Gemini or OpenAI function-calling when `GEMINI_API_KEY` or `OPENAI_API_KEY` is configured.
- **Next.js App Router UI & API (`app/`, `components/`)**: Server-rendered initial load (`app/page.jsx`), Weekly Grid & Table views, Free Rooms & Clash Auditor, `My Schedule` saved in `localStorage` with live clash detection, and 1-click `.ics` calendar export.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3003` in your browser.

### Optional LLM Configuration

Copy `.env.example` to `.env` and set either `GEMINI_API_KEY` or `OPENAI_API_KEY` if you want LLM-driven reasoning on top of the built-in tool registry.

## Running Tests & Production Build

```bash
npm test
npm run build
```

## Deploying to Vercel

Next.js is supported natively on Vercel with zero custom `vercel.json` routing required:

- Push this repository to GitHub/GitLab/Bitbucket and import it into Vercel (Framework Preset: **Next.js**).
- `next.config.mjs` bundles `structured.json` with `outputFileTracingIncludes` so all API routes and Server Components have the dataset at runtime.
- When `VERCEL` is set, Excel uploads parse from memory and persist temporarily to `/tmp` so they work without `EROFS` read-only errors (for permanent global updates across deployments, commit `structured.json` or connect a database).
- Optionally add `GEMINI_API_KEY` or `OPENAI_API_KEY` in Vercel Project Settings → Environment Variables.
