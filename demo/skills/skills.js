// Draws each `.panel` from its data-start state and wires the clicks, so every
// frame can be walked through. Fake data follows the runtime's skill fields:
// name, description, body, user_invocable, model_invocable, enabled, scope.

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  slash: '<path d="M15 4L9 20"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  skills: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const esc = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const SKILLS = [
  {
    name: "weekly-report",
    description:
      "Summarise the week's closed tickets and open blockers per team, as a short report with one section per team.",
    body: "Collect the tickets closed since last Monday with the search_tickets tool.\nGroup them by team, then list what is still blocked and who owns it.\n\nKeep each team to five bullets. End with one line on what slipped.",
    user: true,
    model: true,
    enabled: true,
    scope: "personal",
    when: "2 days ago",
  },
  {
    name: "standup-notes",
    description: "Turn my rough notes into yesterday / today / blockers, in my voice.",
    body: "Rewrite the notes the user pastes as three short lists: Yesterday, Today, Blockers.\nKeep their wording where you can.",
    user: true,
    model: false,
    enabled: true,
    scope: "personal",
    when: "last week",
    shadows: true,
  },
  {
    name: "refund-policy",
    description:
      "Answer refund questions with the 2026 policy: 30 days, original payment method, store credit after that.",
    body: "When a customer asks about a refund, check the order date first...",
    user: false,
    model: true,
    enabled: true,
    scope: "shared",
    when: "3 weeks ago",
  },
  {
    name: "standup-notes",
    description: "Format standup notes as yesterday / today / blockers.",
    body: "...",
    user: true,
    model: true,
    enabled: true,
    scope: "shared",
    when: "Oct 2",
  },
  {
    name: "invoice-chaser",
    description: "Draft a polite reminder for invoices overdue more than 14 days.",
    body: "...",
    user: true,
    model: true,
    enabled: false,
    scope: "shared",
    when: "Sep 18",
  },
];

const ROUTINES = [
  {
    name: "Morning overview",
    prompt: "/what-is-on and tell me what is overdue",
    schedule: "Weekdays at 08:00",
    next: "Next run tomorrow, 08:00",
    status: "ok",
  },
  {
    name: "Close stale drafts",
    prompt: "Archive drafts untouched for 30 days",
    schedule: "Every 6 hours",
    next: "Next run in 2 h",
    status: "ok",
    destructive: true,
  },
  {
    name: "Friday report",
    prompt: "/weekly-report for the platform team",
    schedule: "Fridays at 16:00",
    next: "Paused: your access to Reports lapsed",
    status: "paused",
  },
];

const header = (title, { back = false, extra = "", sub = "" } = {}) => `
  <div class="ph">
    ${
      back
        ? `<button class="hb" data-act="back" aria-label="Back to the conversation">${icon("back")}</button>`
        : `<button class="hb" aria-label="Threads">${icon("menu")}</button>`
    }
    <div class="title">${title}${sub ? `<small>${sub}</small>` : ""}</div>
    ${extra}
    <button class="hb" aria-label="Close">${icon("close")}</button>
  </div>`;

const row = (skill, index) => {
  const reach = [
    skill.user ? `<span>${icon("slash")}In the / menu</span>` : "",
    skill.model ? `<span>${icon("bot")}Agent may load it</span>` : "",
  ].join("");
  const tags = [
    skill.enabled ? "" : '<span class="tag">Off</span>',
    skill.shadows ? `<span title="A shared skill has the same name">${icon("layers")}Overrides shared</span>` : "",
  ].join("");
  return `
    <button class="row${skill.enabled ? "" : " off"}" data-act="open" data-index="${index}">
      <span class="name">/${esc(skill.name)}</span>
      <span class="when">${skill.enabled ? esc(skill.when) : '<span class="btn ghost" data-act="enable" style="padding:1px 8px;font-size:12px">Turn on</span>'}</span>
      <span class="desc">${esc(skill.description)}</span>
      <span class="meta">${tags}${reach}</span>
    </button>`;
};

const listView = (skills) => {
  const groups = [
    ["personal", "Personal", "Only you"],
    ["shared", "Shared", "Everyone in Northwind"],
  ];
  const sections = groups
    .map(([scope, label, who]) => {
      const rows = skills
        .map((skill, i) => [skill, i])
        .filter(([skill]) => skill.scope === scope)
        .map(([skill, i]) => row(skill, i))
        .join("");
      return rows ? `<div class="group"><span>${label}</span><span>${who}</span></div><div class="rows">${rows}</div>` : "";
    })
    .join("");
  return `
    ${header("Skills", { back: true, sub: `${skills.length}`, extra: `<button class="hb" data-act="new" aria-label="New skill">${icon("plus")}</button>` })}
    <div class="pb">
      <div class="search"><input type="search" placeholder="Filter skills" aria-label="Filter skills" /></div>
      ${sections}
    </div>
    <div class="pf">
      <button class="btn block" data-act="draft">${icon("spark")}Draft a skill with the agent</button>
    </div>`;
};

const emptyView = () => `
  ${header("Skills", { back: true, extra: `<button class="hb" data-act="new" aria-label="New skill">${icon("plus")}</button>` })}
  <div class="pb">
    <div class="empty">
      ${icon("skills").replace("<svg", '<svg style="width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.5"')}
      <h3>No skills yet</h3>
      <p>A skill is a set of instructions you or the agent can call up by name, like <span class="chip">/weekly-report</span>.</p>
      <button class="btn primary" data-act="draft">${icon("spark")}Draft one with the agent</button>
      <button class="btn ghost" data-act="new">Write it yourself</button>
    </div>
  </div>`;

const counter = (value, max) => `<span class="count">${value.length.toLocaleString("en")} / ${max.toLocaleString("en")}</span>`;

const editView = (skill, { isNew = false, error = null } = {}) => {
  const both = !skill.user && !skill.model;
  const scope = isNew
    ? `<div class="field"><span class="label">Save to</span><div class="scope">
        <label><input type="radio" name="scope-${Math.random()}" ${skill.scope !== "shared" ? "checked" : ""}/> Personal</label>
        <label><input type="radio" name="scope-${Math.random()}" ${skill.scope === "shared" ? "checked" : ""}/> Shared with Northwind</label>
      </div><div class="hint"><span>Only the places you may write to are offered.</span></div></div>`
    : `<div class="notice info">${icon("info")}<span>${skill.scope === "shared" ? "Shared with everyone in Northwind." : "Personal: only you see it."}${skill.shadows ? " It overrides the shared skill of the same name." : ""}</span></div>`;
  return `
    ${header(isNew ? "New skill" : "Edit skill", { back: true, sub: isNew ? "" : `/${esc(skill.name)}` })}
    <div class="pb">
      <form class="form" onsubmit="return false">
        ${scope}
        <div class="field${error ? " bad" : ""}">
          <label>Name</label>
          <div class="slash"><span>/</span><input type="text" data-f="name" value="${esc(skill.name)}" spellcheck="false" /></div>
          ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
          <div class="hint"><span>Lowercase words joined by hyphens. It is what you type after /.</span>${counter(skill.name, 64)}</div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea rows="3" data-f="description">${esc(skill.description)}</textarea>
          <div class="hint"><span>The agent reads only this until it loads the skill, so say when to use it.</span>${counter(skill.description, 1024)}</div>
        </div>
        <div class="field">
          <span class="label">Who can use it</span>
          <label class="switch"><b>In the / menu</b><small>You pick it from the palette.</small><input type="checkbox" data-f="user" ${skill.user ? "checked" : ""}/></label>
          <label class="switch"><b>Agent may load it on its own</b><small>When the description matches the request.</small><input type="checkbox" data-f="model" ${skill.model ? "checked" : ""}/></label>
          ${both ? `<div class="notice">${icon("warn")}<span>With both off nobody can reach this skill. Turn it off instead if that is the intent.</span></div>` : ""}
        </div>
        <div class="field">
          <label>Instructions</label>
          <textarea class="body" data-f="body" spellcheck="false">${esc(skill.body)}</textarea>
          <div class="hint"><span>Markdown. A skill grants no tools: approvals still apply.</span>${counter(skill.body, 20000)}</div>
        </div>
      </form>
    </div>
    <div class="pf">
      ${isNew ? "" : `<button class="btn quiet-danger" data-act="disable">Turn off</button><button class="btn ghost" aria-label="Download SKILL.md" title="Download SKILL.md">${icon("file")}</button>`}
      <span class="grow"></span>
      <button class="btn ghost" data-act="back">Cancel</button>
      <button class="btn primary" data-act="save">${isNew ? "Create" : "Save"}</button>
    </div>`;
};

const draftView = () => `
  ${header("Support assistant", { extra: `<button class="hb" aria-label="Skills" aria-pressed="false" data-act="list">${icon("skills")}</button>` })}
  <div class="pb">
    <div class="tx">
      <div class="msg-user"><span class="chip">/create-skill</span></div>
      <div class="msg-ai"><div class="step">Using skill create-skill</div>
        <p>What should the skill do, and when should I reach for it?</p></div>
      <div class="msg-user">When someone asks about a late delivery, look up the order, check the carrier status and offer the standard apology voucher if it is more than 3 days late.</div>
      <div class="msg-ai">
        <p>Here is a draft. Approve it to save it as a personal skill.</p>
        <div class="approval">
          <div class="ah">${icon("spark").replace("<svg", '<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.75"')}Save a new skill?</div>
          <div class="ab">
            <dl>
              <dt>Name</dt><dd><span class="chip">/late-delivery</span></dd>
              <dt>Saved to</dt><dd>Personal</dd>
              <dt>Reach</dt><dd>In the / menu, agent may load it</dd>
              <dt>Description</dt><dd>Handle a customer asking why their order is late: check carrier status, apologise, offer the voucher past 3 days.</dd>
            </dl>
            <pre>1. Find the order with lookup_order using the number or email the customer gives.
2. Read the carrier status with track_shipment.
3. If it is more than 3 days past the promised date, apologise and offer the standard voucher (issue_voucher, needs approval).
4. Otherwise give the new estimate and the tracking link.</pre>
          </div>
          <div class="aa"><button class="btn ghost" data-act="edit-draft">Edit first</button><button class="btn">Decline</button><button class="btn primary" data-act="approve">Approve</button></div>
        </div>
      </div>
    </div>
  </div>
  <div class="composer">Reply…</div>`;

const routinesView = () => `
  ${header("Routines", { back: true, sub: "3", extra: `<button class="hb" aria-label="New routine">${icon("plus")}</button>` })}
  <div class="pb">
    <div class="rows" style="padding-top:8px">
      ${ROUTINES.map(
        (r) => `
        <button class="row${r.status === "paused" ? " off" : ""}">
          <span class="name" style="font-family:var(--font)">${esc(r.name)}</span>
          <span class="when"><span class="btn ghost" style="padding:1px 8px;font-size:12px">${r.status === "paused" ? "Resume" : `${icon("play").replace("<svg", '<svg style="width:12px;height:12px"')} Run now`}</span></span>
          <span class="desc">${esc(r.prompt)}</span>
          <span class="meta"><span>${icon("clock")}${esc(r.schedule)}</span><span${r.status === "paused" ? ' style="color:var(--warn)"' : ""}>${esc(r.next)}</span>${r.destructive ? '<span class="tag danger">May delete records</span>' : ""}</span>
        </button>`,
      ).join("")}
    </div>
  </div>
  <div class="pf"><button class="btn block">${icon("spark")}Set one up with the agent</button></div>`;

function mount(panel) {
  let skills = SKILLS.map((s) => ({ ...s }));
  const start = panel.dataset.start;
  let state = { view: start === "invalid" ? "edit" : start, index: 1, isNew: false, error: null };
  if (start === "invalid") {
    state = {
      view: "edit",
      isNew: true,
      draft: { name: "Late Delivery", description: "Handle a customer asking why their order is late.", body: "1. Find the order with lookup_order...", user: true, model: true, scope: "personal" },
      error: "Skill name 'Late Delivery' must be kebab-case: lowercase ASCII letters and digits in words joined by single hyphens, at most 64 characters.",
    };
  }
  if (start === "empty") skills = [];
  let toast = "";

  const render = () => {
    let html;
    if (state.view === "list") html = skills.length ? listView(skills) : emptyView();
    else if (state.view === "empty") html = emptyView();
    else if (state.view === "edit") html = editView(state.isNew || state.draft ? state.draft : skills[state.index], state);
    else if (state.view === "draft") html = draftView();
    else html = routinesView();
    panel.innerHTML = html + (toast ? `<div class="toast" role="status">${esc(toast)}</div>` : "");
    toast = "";
    if (state.view === "draft") {
      const body = panel.querySelector(".pb");
      body.scrollTop = body.scrollHeight;
    }
  };

  panel.addEventListener("input", (event) => {
    const target = event.target;
    const field = target.dataset?.f;
    if (!field || state.view !== "edit") return;
    const skill = state.draft ?? skills[state.index];
    skill[field] = target.type === "checkbox" ? target.checked : target.value;
    if (target.type === "checkbox") render();
    else {
      const count = target.closest(".field")?.querySelector(".count");
      const max = { name: 64, description: 1024, body: 20000 }[field];
      if (count) count.textContent = `${target.value.length.toLocaleString("en")} / ${max.toLocaleString("en")}`;
    }
  });

  panel.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "enable") {
      event.stopPropagation();
      const i = Number(el.closest("[data-index]").dataset.index);
      skills[i].enabled = true;
      toast = `/${skills[i].name} is on again`;
      render();
      return;
    }
    if (act === "open") state = { view: "edit", index: Number(el.dataset.index), isNew: false };
    else if (act === "new")
      state = { view: "edit", isNew: true, draft: { name: "", description: "", body: "", user: true, model: true, scope: "personal" } };
    else if (act === "back" || act === "list") state = { view: "list" };
    else if (act === "draft" || act === "edit-draft") state = act === "draft" ? { view: "draft" } : {
      view: "edit",
      isNew: true,
      draft: { name: "late-delivery", description: "Handle a customer asking why their order is late: check carrier status, apologise, offer the voucher past 3 days.", body: "1. Find the order with lookup_order...", user: true, model: true, scope: "personal" },
    };
    else if (act === "approve") {
      skills.unshift({ name: "late-delivery", description: "Handle a customer asking why their order is late: check carrier status, apologise, offer the voucher past 3 days.", body: "...", user: true, model: true, enabled: true, scope: "personal", when: "just now" });
      toast = "Saved /late-delivery";
      state = { view: "list" };
    } else if (act === "save") {
      const skill = state.draft ?? skills[state.index];
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) || skill.name.length > 64) {
        state = { ...state, error: `Skill name '${skill.name}' must be kebab-case: lowercase ASCII letters and digits in words joined by single hyphens, at most 64 characters.` };
      } else {
        if (state.draft) skills.unshift({ ...state.draft, enabled: true, when: "just now" });
        toast = `Saved /${skill.name}`;
        state = { view: "list" };
      }
    } else if (act === "disable") {
      skills[state.index].enabled = false;
      toast = `/${skills[state.index].name} is off`;
      state = { view: "list" };
    }
    render();
  });
  render();
}

for (const panel of document.querySelectorAll(".panel")) mount(panel);

for (const button of document.querySelectorAll("[data-theme-pick]")) {
  button.addEventListener("click", () => {
    const pick = button.dataset.themePick;
    if (pick === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pick;
    for (const other of document.querySelectorAll("[data-theme-pick]")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
  });
}
