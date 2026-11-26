(() => {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const STORAGE_KEY = "agentic_timetable_personal_v1";

  const state = {
    courses: [],
    currentSlots: [],
    viewMode: "grid",
    personalSlots: loadPersonalSlots(),
    sessionId: `web-${Math.random().toString(36).slice(2, 10)}`
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadPersonalSlots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function savePersonalSlots() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.personalSlots));
    document.getElementById("savedCountPill").textContent = String(state.personalSlots.length);
  }

  function slotKey(slot) {
    return `${slot.course}|${slot.day}|${slot.time}|${slot.unitCode || slot.value}`;
  }

  function isSaved(slot) {
    const key = slotKey(slot);
    return state.personalSlots.some((s) => slotKey(s) === key);
  }

  function toggleSaveSlot(slot) {
    const key = slotKey(slot);
    const idx = state.personalSlots.findIndex((s) => slotKey(s) === key);
    if (idx >= 0) state.personalSlots.splice(idx, 1);
    else state.personalSlots.push(slot);
    savePersonalSlots();
    renderExplorer();
    renderPersonalSchedule();
  }

  async function apiJson(url, options = {}) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    return data;
  }

  async function refreshDatasetMeta() {
    try {
      const [stats, courses] = await Promise.all([
        apiJson("/api/stats"),
        apiJson("/api/courses")
      ]);
      state.courses = courses;

      document.getElementById("datasetBadge").textContent =
        `${stats.courseCount} courses · ${stats.classCount} classes`;

      const datalist = document.getElementById("courseList");
      datalist.innerHTML = courses
        .map((c) => `<option value="${escapeHtml(c.course)}"></option>`)
        .join("");

      if (courses.length && !document.getElementById("courseInput").value) {
        document.getElementById("courseInput").value = courses[0].course;
      }
    } catch (err) {
      document.getElementById("datasetBadge").textContent = "Dataset error";
      console.error(err);
    }
  }

  async function runExplorerSearch() {
    const course = document.getElementById("courseInput").value.trim();
    const q = document.getElementById("queryInput").value.trim();
    const day = document.getElementById("daySelect").value;
    const mode = document.getElementById("modeSelect").value;

    const params = new URLSearchParams();
    if (course) params.set("course", course);
    if (q) params.set("q", q);
    if (day) params.set("day", day);
    if (mode) params.set("mode", mode);

    const statusEl = document.getElementById("explorerStatus");
    statusEl.textContent = "Searching...";

    try {
      const data = await apiJson(`/api/search?${params.toString()}`);
      state.currentSlots = data.slots || [];
      statusEl.textContent = `Showing ${state.currentSlots.length} class${state.currentSlots.length === 1 ? "" : "es"}${course ? ` for "${course}"` : ""}.`;
      renderExplorer();
    } catch (err) {
      statusEl.textContent = `Search failed: ${err.message}`;
    }
  }

  function renderSlotCard(slot) {
    const saved = isSaved(slot);
    const modeClass = `mode-${slot.mode || "in-person"}`;
    const badgeClass =
      slot.mode === "online"
        ? "badge-online"
        : slot.mode === "self-paced"
          ? "badge-selfpaced"
          : "badge-inperson";

    const title = slot.unitName || slot.value;
    const code = slot.unitCode || slot.course;

    return `
      <div class="slot-card ${escapeHtml(modeClass)}">
        <div class="slot-top">
          <span class="slot-code">${escapeHtml(code)}</span>
          <button class="save-btn ${saved ? "saved" : ""}" data-slot-key="${escapeHtml(slotKey(slot))}" type="button">
            ${saved ? "Saved" : "+ Save"}
          </button>
        </div>
        <div class="slot-title">${escapeHtml(title)}</div>
        <div class="slot-meta">
          <span class="badge ${badgeClass}">${escapeHtml(slot.venue || slot.mode)}</span>
          ${slot.lecturer ? `<span>${escapeHtml(slot.lecturer)}</span>` : ""}
          <span>· ${escapeHtml(slot.course)}</span>
        </div>
      </div>
    `;
  }

  function buildWeeklyGridHtml(slots, emptyMessage) {
    if (!slots.length) {
      return `<div class="card"><p class="muted">${escapeHtml(emptyMessage)}</p></div>`;
    }

    const activeDays = DAYS.filter(
      (d) => d !== "Saturday" && d !== "Sunday" || slots.some((s) => s.day === d)
    );
    const times = [...new Set(slots.map((s) => s.time).filter(Boolean))].sort();

    const headerCells = activeDays.map((d) => `<th>${escapeHtml(d)}</th>`).join("");
    const bodyRows = times
      .map((t) => {
        const cells = activeDays
          .map((d) => {
            const cellSlots = slots.filter((s) => s.day === d && s.time === t);
            return `<td>${cellSlots.map(renderSlotCard).join("")}</td>`;
          })
          .join("");
        return `<tr><td class="time-col">${escapeHtml(t)}</td>${cells}</tr>`;
      })
      .join("");

    return `
      <div class="grid-scroll">
        <table class="weekly-grid">
          <thead>
            <tr><th>Time</th>${headerCells}</tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  function buildTableHtml(slots, emptyMessage) {
    if (!slots.length) {
      return `<div class="card"><p class="muted">${escapeHtml(emptyMessage)}</p></div>`;
    }
    return `
      <div class="grid-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Time</th>
              <th>Course</th>
              <th>Unit</th>
              <th>Lecturer</th>
              <th>Venue</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${slots
              .map((s) => {
                const saved = isSaved(s);
                return `
                  <tr>
                    <td>${escapeHtml(s.day)}</td>
                    <td>${escapeHtml(s.time)}</td>
                    <td>${escapeHtml(s.course)}</td>
                    <td><strong>${escapeHtml(s.unitCode || "")}</strong> ${escapeHtml(s.unitName || s.value)}</td>
                    <td>${escapeHtml(s.lecturer || "-")}</td>
                    <td>${escapeHtml(s.venue || s.mode)}</td>
                    <td>
                      <button class="save-btn ${saved ? "saved" : ""}" data-slot-key="${escapeHtml(slotKey(s))}" type="button">
                        ${saved ? "Saved" : "+ Save"}
                      </button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindSlotSaveButtons(container, sourceSlots) {
    const slotMap = new Map(sourceSlots.map((s) => [slotKey(s), s]));
    container.querySelectorAll(".save-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-slot-key");
        const slot = slotMap.get(key);
        if (slot) toggleSaveSlot(slot);
      });
    });
  }

  function renderExplorer() {
    const container = document.getElementById("explorerResults");
    const displaySlots = state.currentSlots.slice(0, 120);
    const emptyMsg = "No classes matched those filters. Try clearing filters or asking the Timetable Agent.";

    container.innerHTML =
      state.viewMode === "grid"
        ? buildWeeklyGridHtml(displaySlots, emptyMsg)
        : buildTableHtml(displaySlots, emptyMsg);

    bindSlotSaveButtons(container, displaySlots);
  }

  async function renderPersonalSchedule() {
    const banner = document.getElementById("personalClashBanner");
    const container = document.getElementById("personalScheduleView");

    if (!state.personalSlots.length) {
      banner.innerHTML = "";
      container.innerHTML = `<p class="muted">You haven't saved any classes yet. Click <strong>+ Save</strong> on any class card in the Explorer.</p>`;
      return;
    }

    try {
      const clashData = await apiJson("/api/clashes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.personalSlots })
      });

      if (clashData.clashCount > 0) {
        const items = clashData.clashes
          .map(
            (c) =>
              `<li><strong>${escapeHtml(c.day)} ${escapeHtml(c.time)}</strong>: ${c.slots
                .map((s) => escapeHtml(`${s.unitCode || s.value} (${s.course})`))
                .join(" vs ")}</li>`
          )
          .join("");
        banner.innerHTML = `<div class="alert alert-danger"><strong>Schedule Clash Detected (${clashData.clashCount}):</strong><ul>${items}</ul></div>`;
      } else {
        banner.innerHTML = `<div class="alert alert-success">No schedule clashes in your saved classes (${state.personalSlots.length} classes).</div>`;
      }
    } catch {
      banner.innerHTML = "";
    }

    container.innerHTML = buildWeeklyGridHtml(state.personalSlots, "No saved classes.");
    bindSlotSaveButtons(container, state.personalSlots);
  }

  async function downloadIcs(slots, title) {
    if (!slots.length) {
      alert("No classes available to export.");
      return;
    }
    const resp = await fetch("/api/export/ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots, title })
    });
    if (!resp.ok) {
      alert("Failed to export calendar.");
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function findFreeRooms() {
    const day = document.getElementById("freeDaySelect").value;
    const time = document.getElementById("freeTimeSelect").value;
    const params = new URLSearchParams();
    if (day) params.set("day", day);
    if (time) params.set("time", time);

    const out = document.getElementById("freeRoomsOutput");
    out.innerHTML = `<p class="muted">Checking room availability...</p>`;
    try {
      const data = await apiJson(`/api/free-rooms?${params.toString()}`);
      out.innerHTML = data.availability
        .slice(0, 12)
        .map(
          (slot) => `
          <div class="mini-card">
            <strong>${escapeHtml(slot.day)} · ${escapeHtml(slot.time)}</strong>
            <span class="muted">(${slot.freeCount}/${slot.totalPhysicalVenues} free)</span>
            <div class="room-chips">
              ${slot.freeVenues
                .slice(0, 18)
                .map((r) => `<span class="room-chip">${escapeHtml(r)}</span>`)
                .join("")}
              ${slot.freeVenues.length > 18 ? `<span class="muted">+${slot.freeVenues.length - 18} more</span>` : ""}
            </div>
          </div>
        `
        )
        .join("");
    } catch (err) {
      out.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  }

  async function runClashCheck(mode) {
    const out = document.getElementById("clashOutput");
    out.innerHTML = `<p class="muted">Analyzing timetable...</p>`;
    try {
      if (mode === "system") {
        const res = await apiJson("/api/clashes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "system" })
        });
        if (res.totalClashes === 0) {
          out.innerHTML = `<div class="alert alert-success">0 venue or lecturer clashes found across the entire timetable!</div>`;
          return;
        }
        const combined = [...res.venueClashes, ...res.lecturerClashes];
        out.innerHTML =
          `<div class="alert alert-danger">Found ${res.venueClashes.length} venue clash(es) and ${res.lecturerClashes.length} lecturer clash(es).</div>` +
          combined
            .slice(0, 15)
            .map(
              (c) => `
              <div class="mini-card">
                <strong>${escapeHtml(c.day)} ${escapeHtml(c.time)} · ${escapeHtml(c.type === "venue" ? `Room ${c.venue}` : c.lecturer)}</strong>
                <ul>
                  ${c.entries
                    .map((e) => `<li>${escapeHtml(e.course)}: ${escapeHtml(e.unitCode || e.value)} (${escapeHtml(e.venue)})</li>`)
                    .join("")}
                </ul>
              </div>
            `
            )
            .join("");
      } else {
        const raw = document.getElementById("clashItemsInput").value;
        const items = raw.split(",").map((x) => x.trim()).filter(Boolean);
        if (items.length < 2) {
          out.innerHTML = `<div class="alert alert-danger">Enter at least two comma-separated units or courses.</div>`;
          return;
        }
        const res = await apiJson("/api/clashes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items })
        });
        if (res.clashCount === 0) {
          out.innerHTML = `<div class="alert alert-success">No clashes detected across ${res.evaluatedCount} matched classes!</div>`;
        } else {
          out.innerHTML = res.clashes
            .map(
              (c) => `
              <div class="mini-card">
                <strong>Conflict on ${escapeHtml(c.day)} ${escapeHtml(c.time)}</strong>
                <ul>
                  ${c.slots.map((s) => `<li>${escapeHtml(s.unitCode || s.value)} — ${escapeHtml(s.venue || "TBA")}</li>`).join("")}
                </ul>
              </div>
            `
            )
            .join("");
        }
      }
    } catch (err) {
      out.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  }

  function formatAgentText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function appendChatMessage(role, htmlContent, steps = [], slots = []) {
    const box = document.getElementById("chatMessages");
    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role === "user" ? "msg-user" : "msg-agent"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = htmlContent;
    wrapper.appendChild(bubble);

    if (steps.length) {
      const details = document.createElement("details");
      details.className = "tool-trace";
      details.innerHTML = `
        <summary>Agent tool calls (${steps.length})</summary>
        <ul>
          ${steps.map((s) => `<li><code>${escapeHtml(s.tool)}</code> — ${escapeHtml(s.summary)}</li>`).join("")}
        </ul>
      `;
      wrapper.appendChild(details);
    }

    if (slots.length) {
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "btn btn-secondary btn-sm";
      loadBtn.textContent = `Load ${slots.length} classes into Explorer`;
      loadBtn.addEventListener("click", () => {
        state.currentSlots = slots;
        document.getElementById("explorerStatus").textContent =
          `Loaded ${slots.length} classes from Timetable Agent.`;
        document.querySelector('[data-tab="explorer"]').click();
        renderExplorer();
      });
      wrapper.appendChild(loadBtn);
    }

    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
  }

  async function sendAgentMessage(message) {
    const trimmed = message.trim();
    if (!trimmed) return;
    appendChatMessage("user", escapeHtml(trimmed));

    const sendBtn = document.getElementById("chatSendBtn");
    sendBtn.disabled = true;
    sendBtn.textContent = "...";

    try {
      const res = await apiJson("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: state.sessionId })
      });
      document.getElementById("agentModeBadge").textContent =
        res.mode === "gemini" || res.mode === "openai"
          ? `LLM Agent (${res.mode})`
          : "Local Tool Agent";
      appendChatMessage("agent", formatAgentText(res.reply), res.steps || [], res.slots || []);
    } catch (err) {
      appendChatMessage("agent", `Error: ${escapeHtml(err.message)}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
    }
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        tabBtn.classList.add("active");
        const target = tabBtn.getAttribute("data-tab");
        document.getElementById(`tab-${target}`).classList.add("active");
        if (target === "personal") renderPersonalSchedule();
      });
    });
  }

  function setupUploadModal() {
    const modal = document.getElementById("uploadModal");
    const fileInput = document.getElementById("timetableFileInput");
    const feedback = document.getElementById("uploadFeedback");

    const closeModal = () => modal.classList.add("hidden");
    const openModal = () => {
      feedback.textContent = "";
      modal.classList.remove("hidden");
    };

    document.getElementById("openUploadBtn").addEventListener("click", openModal);
    document.getElementById("closeUploadBtn").addEventListener("click", closeModal);
    document.getElementById("cancelUploadBtn").addEventListener("click", closeModal);
    document.getElementById("uploadModalBackdrop").addEventListener("click", closeModal);

    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      document.getElementById("selectedFileName").textContent = f ? f.name : "Choose an Excel file (.xlsx / .xls)";
    });

    document.getElementById("confirmUploadBtn").addEventListener("click", async () => {
      const file = fileInput.files[0];
      if (!file) {
        feedback.innerHTML = `<span style="color:var(--danger)">Please select a .xlsx or .xls file first.</span>`;
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      feedback.textContent = `Uploading and parsing ${file.name}...`;

      try {
        const res = await apiJson("/api/upload", { method: "POST", body: formData });
        const note = res.ephemeral ? " (active for current Vercel session)" : "";
        feedback.innerHTML = `<span style="color:var(--emerald)">Loaded ${res.courseCount} courses from ${escapeHtml(res.filename)}${note}!</span>`;
        await refreshDatasetMeta();
        await runExplorerSearch();
        setTimeout(closeModal, res.ephemeral ? 1300 : 700);
      } catch (err) {
        feedback.innerHTML = `<span style="color:var(--danger)">Upload failed: ${escapeHtml(err.message)}</span>`;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    savePersonalSlots();
    setupTabs();
    setupUploadModal();

    document.getElementById("filterForm").addEventListener("submit", (e) => {
      e.preventDefault();
      runExplorerSearch();
    });

    document.getElementById("resetFiltersBtn").addEventListener("click", () => {
      document.getElementById("courseInput").value = "";
      document.getElementById("queryInput").value = "";
      document.getElementById("daySelect").value = "";
      document.getElementById("modeSelect").value = "";
      runExplorerSearch();
    });

    document.getElementById("viewGridBtn").addEventListener("click", () => {
      state.viewMode = "grid";
      document.getElementById("viewGridBtn").classList.add("active");
      document.getElementById("viewTableBtn").classList.remove("active");
      renderExplorer();
    });

    document.getElementById("viewTableBtn").addEventListener("click", () => {
      state.viewMode = "table";
      document.getElementById("viewTableBtn").classList.add("active");
      document.getElementById("viewGridBtn").classList.remove("active");
      renderExplorer();
    });

    document.getElementById("exportExplorerIcsBtn").addEventListener("click", () => {
      downloadIcs(state.currentSlots, document.getElementById("courseInput").value || "Timetable");
    });

    document.getElementById("exportPersonalIcsBtn").addEventListener("click", () => {
      downloadIcs(state.personalSlots, "My Personal Timetable");
    });

    document.getElementById("clearPersonalBtn").addEventListener("click", () => {
      state.personalSlots = [];
      savePersonalSlots();
      renderExplorer();
      renderPersonalSchedule();
    });

    document.getElementById("findFreeRoomsBtn").addEventListener("click", findFreeRooms);
    document.getElementById("checkCustomClashBtn").addEventListener("click", () => runClashCheck("custom"));
    document.getElementById("auditSystemClashBtn").addEventListener("click", () => runClashCheck("system"));

    document.getElementById("chatForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("chatInput");
      const msg = input.value;
      input.value = "";
      sendAgentMessage(msg);
    });

    document.getElementById("clearChatBtn").addEventListener("click", () => {
      document.getElementById("chatMessages").innerHTML = "";
      appendChatMessage("agent", "Conversation cleared. How can I help with the timetable?");
    });

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        sendAgentMessage(chip.getAttribute("data-prompt"));
      });
    });

    await refreshDatasetMeta();
    await runExplorerSearch();
  });
})();
