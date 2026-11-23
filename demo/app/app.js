// The demo page. One <ag-ui-chat> per page load, set up for the scenario the
// URL names (/scenarios/<slug>/) or for the start page (/). Each scenario is its own
// page so it gets its own element id, and so its own stored conversation: a
// thread started in one scenario is not waiting in the next.
//
// The first half draws the shell from scenarios.js and configures the element
// before it is defined; the second wires the scenario's controls, which live in
// index.html as <section data-scenario> blocks.
import {
  THREAD_EVENT,
  VERSION,
  defineChat,
  fillField,
  pressButton,
  selectControl,
  showHighlightOverlay,
  toggleCheckbox,
  X_DESTRUCTIVE_KEY,
} from "/bundle.js";
import { registerA2ui } from "/a2ui.bundle.js";
import { registerMcpApps } from "/mcp-apps.bundle.js";
import { GROUPS, SCENARIOS, scenarioFor } from "/app/scenarios.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const chat = $("chat");
const scenario = scenarioFor(location.pathname);
const slug = scenario?.slug ?? "start";
const on = (...slugs) => slugs.includes(slug);

// Try and Reset start over from a fresh load: the scenario's stored state (its
// conversation, collapsed state, theme, size) is dropped and the page reloads,
// so nothing an earlier run left behind (a filled form, a pending approval, a
// readout) carries into the next. Try keeps the scenario's control values and
// sends its prompt once the page is up; Reset leaves every control at its
// default.
const RESTART_KEY = "demo:restart";
const restart = (() => {
  try {
    const value = JSON.parse(sessionStorage.getItem(RESTART_KEY) ?? "null");
    sessionStorage.removeItem(RESTART_KEY);
    return value?.slug === slug ? value : null;
  } catch {
    return null;
  }
})();
const controlsOf = () => [
  ...document.querySelectorAll(`section[data-scenario="${slug}"] .controls :is(input, select, textarea)[id]`),
];
const startOver = (prompt) => {
  const controls =
    prompt === null
      ? []
      : controlsOf().map((c) => [c.id, c.type === "checkbox" || c.type === "radio" ? c.checked : c.value]);
  for (const store of [sessionStorage, localStorage]) {
    for (const key of Object.keys(store)) {
      if (key.includes(`chat-${slug}`) || (prompt === null && key.startsWith("demo:"))) {
        store.removeItem(key);
      }
    }
  }
  sessionStorage.setItem(RESTART_KEY, JSON.stringify({ slug, prompt, controls }));
  location.replace(location.pathname);
};

// ── The shell ────────────────────────────────────────────────────────────────

$("version").textContent = VERSION;
document.title =
  scenario === null ? "agents-web-components demo" : `${scenario.title} · agents-web-components demo`;

const navGroups = $("nav-groups");
for (const group of GROUPS) {
  const list = el("ul");
  for (const item of SCENARIOS.filter((s) => s.group === group)) {
    const link = el("a", { href: `/scenarios/${item.slug}/` }, item.title, el("small", {}, item.since));
    if (item.slug === slug) {
      link.setAttribute("aria-current", "page");
    }
    list.append(el("li", {}, link));
  }
  navGroups.append(el("h2", {}, group), list);
}

// The phone's drawer: the button opens it, and following a link or tapping
// outside it closes it.
const navToggle = $("nav-toggle");
const setNav = (open) => {
  document.body.classList.toggle("nav-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
};
navToggle.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
$("main").addEventListener("click", () => setNav(false));

const send = (text) => {
  chat.setCollapsed(false);
  void chat.sendMessage(text);
};

const head = $("scenario-head");
if (scenario === null) {
  head.append(
    el("p", { className: "eyebrow" }, "Demo"),
    el("h1", {}, "Every feature, one page each"),
    el(
      "p",
      { className: "summary" },
      "Pick a scenario. Each has the controls and the phrases that reach one feature, and its own conversation with the scripted agent in the panel.",
    ),
  );
  const groups = $("start-groups");
  for (const group of GROUPS) {
    const cards = el("div", { className: "cards" });
    for (const item of SCENARIOS.filter((s) => s.group === group)) {
      cards.append(
        el(
          "a",
          { className: "card", href: `/scenarios/${item.slug}/` },
          el("strong", {}, item.title, el("small", {}, item.since)),
          el("span", {}, item.summary),
        ),
      );
    }
    groups.append(el("div", {}, el("h2", {}, group), cards));
  }
  const rows = $("prompt-index").tBodies[0];
  for (const item of SCENARIOS) {
    for (const [, text] of item.prompts) {
      rows.append(
        el("tr", {}, el("td", {}, text), el("td", {}, el("a", { href: `/scenarios/${item.slug}/` }, item.title))),
      );
    }
  }
} else {
  const tryRow = el("div", { className: "try" });
  if (scenario.prompts.length > 0) {
    tryRow.append(el("span", {}, "Try"));
  }
  for (const [label, text] of scenario.prompts) {
    const button = el("button", { type: "button", title: text }, label);
    button.addEventListener("click", () => startOver(text));
    tryRow.append(button);
  }
  const reset = el("button", { type: "button", className: "reset", title: "A fresh conversation, every control at its default" }, "Reset");
  reset.addEventListener("click", () => startOver(null));
  tryRow.append(reset);
  if (scenario.link !== undefined) {
    tryRow.append(el("a", { href: scenario.link[1] }, scenario.link[0]));
  }
  head.append(
    el("p", { className: "eyebrow" }, scenario.group),
    el("h1", {}, scenario.title, el("span", { className: "since" }, `since ${scenario.since}`)),
    el("p", { className: "summary" }, scenario.summary),
  );
  head.append(tryRow);
}
const section = document.querySelector(`section[data-scenario="${slug}"]`);
if (section !== null) {
  section.hidden = false;
}

// ── The element, configured before it is defined ─────────────────────────────

// The stored conversation is keyed on the id, so each scenario keeps its own.
chat.id = `chat-${slug}`;
for (const [name, value] of Object.entries(scenario?.attrs ?? {})) {
  chat.setAttribute(name, value);
}
// On a phone an open panel covers the page, so a scenario opens on its text
// and the launcher; a Try button opens the panel.
if (matchMedia("(max-width: 899px)").matches) {
  chat.removeAttribute("data-start-open");
}

// A localized string table, which is also the quickest check that every label
// is sourced from UiStrings rather than hard-coded.
const DE = {
  title: "Assistent",
  argumentsLabel: "Argumente",
  resultLabel: "Ergebnis",
  errorLabel: "Fehler",
  details: "Einzelheiten",
  decisionApproved: "von dir bestätigt",
  decisionDeclined: "von dir abgelehnt",
  resizePanel: "Panelgröße ändern",
  toolRunning: "läuft…",
  toolDone: "✓ fertig",
  confirm: "Bestätigen",
  cancel: "Abbrechen",
  enqueuedMessages: "Während des Laufs hinzugefügt",
  mcpAppUnsupported: "Diese App-Ansicht kann hier nicht angezeigt werden: {uri}",
};
// data-strings is read once while connecting, so it has to be on the element
// before the definition upgrades it: hence the flag and the reload.
if (on("strings") && sessionStorage.getItem("demo:i18n") === "1") {
  chat.setAttribute("data-strings", JSON.stringify(DE));
  $("cfg-i18n").checked = true;
}
$("cfg-i18n").addEventListener("change", (event) => {
  sessionStorage.setItem("demo:i18n", event.target.checked ? "1" : "0");
  window.location.reload();
});

defineChat();

// ── What every scenario has ───────────────────────────────────────────────────

chat.enableCharts(["tool", "activity"]);
// The question card needs the built-in ask_user tool offered to the agent.
chat.askUser = true;
// This mock server honours editedArgs in the resume payload, so the approval
// cards offer the arguments for editing. Against a server that ignores them
// this stays off: the component cannot see the capability.
chat.approveWithEdits = true;
// Selecting text anywhere on the page offers to quote it, not only in answers.
chat.offerQuoteInPage();

// A surface the server pushes and redraws: type into it while the second
// snapshot is on its way, and the field keeps its value and focus, because the
// renderer updates the node it is given and returns it. Replayed from history
// it is drawn inert. Its button starts a run that forwards the answer rather
// than sending it as a message.
chat.registerActivityRenderer({
  type: "release_form",
  render: (content, { previous, live }) => {
    const form = previous ?? document.createElement("form");
    if (previous === null) {
      form.style.cssText = "display:grid;gap:6px;padding:8px;border:1px solid currentColor;border-radius:8px";
      const label = document.createElement("span");
      const input = document.createElement("input");
      input.placeholder = "Release name";
      const button = document.createElement("button");
      button.textContent = "Submit";
      form.append(label, input, button);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        // The turn's id derives from the run id, which a Retry of a refused run sends again.
        const runId = crypto.randomUUID();
        void chat.run({
          forwardedProps: { action: "submit_release", name: input.value },
          runId,
          message: { id: `${runId}-turn`, content: `Release name: ${input.value}` },
        });
      });
    }
    form.querySelector("span").textContent = `${content.step}${live ? "" : " (from history)"}`;
    for (const control of form.querySelectorAll("input, button")) {
      control.disabled = !live;
    }
    return form;
  },
});
// Nothing to draw, by design: an empty fragment keeps the type out of
// unhandledActivityTypes, where a type nobody registered lands.
chat.registerActivityRenderer({ type: "host_marker", render: () => document.createDocumentFragment() });

// A2UI surfaces from the second vendored file. Errors go to the host: this
// page lists them in the A2UI scenario, and logs them as the default would.
registerA2ui(chat, {
  onError: (message) => {
    console.warn("A2UI", message);
    const { code, message: text, path } = message.error;
    $("a2ui-errors").append(el("li", {}, `${code}: ${text}${path ? ` at ${path}` : ""}`));
    $("a2ui-errors-empty").hidden = true;
  },
});

// What arrived with nobody to draw it, after every run.
const syncUnhandled = () => {
  $("act-unhandled").textContent = JSON.stringify(chat.unhandledActivityTypes);
};
chat.addEventListener("ag-ui-run-finished", () => {
  console.info("unhandledActivityTypes", chat.unhandledActivityTypes);
  syncUnhandled();
});
syncUnhandled();

// ── Frontend tools (driven by the mock agent) ──────────────────────────────

chat.registerTool({
  name: "fill_field",
  description: "Fill a text input by id with a value.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
  },
  handler: async ({ field, value }) => {
    await fillField($(field), String(value), { charDelayMs: 45 });
    return "ok";
  },
});

chat.registerTool({
  name: "select_option",
  description: "Choose an option in a select by id (animated).",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
  },
  handler: async ({ field, value }) => {
    await selectControl($(field), String(value));
    return "ok";
  },
});

chat.registerTool({
  name: "toggle_checkbox",
  description: "Set a checkbox by id (animated).",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "boolean" } },
  },
  handler: async ({ field, value }) => {
    await toggleCheckbox($(field), Boolean(value));
    return "ok";
  },
});

chat.registerTool({
  name: "break_something",
  description: "Always throws: shows a failed tool card.",
  parameters: { type: "object", properties: {}, "x-summary": "Flaky operation" },
  handler: async () => {
    throw new Error("the upstream service refused the request");
  },
});

chat.registerTool({
  name: "click_save",
  description: "Save the article. Destructive: asks for confirmation.",
  parameters: {
    type: "object",
    properties: {},
    [X_DESTRUCTIVE_KEY]: true,
    "x-confirm": "Save this article?",
    "x-summary": "Save article",
  },
  handler: async () => {
    await pressButton($("save"));
    return "saved";
  },
});

$("save").addEventListener("click", () => {
  $("banner").classList.add("show");
});

// ── Skills (chips + / palette), where the scenario is about them ─────────────

if (scenario?.skills === true) {
  chat.setSkills([
    {
      name: "fill-article",
      title: "Fill the article",
      description: "Populate every field, then save.",
      prompt:
        'Create an article titled "Hello, AG-UI", slug hello-ag-ui, status published and featured, then save.',
      chip: true,
    },
    {
      name: "summarize-form",
      title: "Summarize the form",
      description: "Recap the current field values.",
      prompt: "Summarize the current values of the article form.",
      chip: true,
    },
    {
      // {topic} is filled from the Title field; empty means blocked with a hint.
      name: "suggest-title",
      title: "Suggest a better title",
      description: "Uses the current Title as the topic.",
      prompt: "Suggest three catchy titles for an article about: {topic}.",
      // Pre-fills rather than sends, so the user can edit before committing.
      sendImmediately: false,
    },
    {
      // No prompt: server-resolved. Picking it sends "/triage" and the agent
      // decides what that means, so the wording never reaches this file.
      name: "triage",
      title: "Triage this article",
      description: "Server-resolved: the prompt never reaches the browser.",
      chip: true,
    },
  ]);
  chat.skillContext = () => ({ topic: $("title").value.trim() });
}

// ── Placements ───────────────────────────────────────────────────────────────

const bind = (id, attr) => {
  $(id).addEventListener("change", (event) => {
    chat.setAttribute(attr, event.target.value);
  });
};
// Absent is a value of its own for these: the attribute's default.
const bindOptional = (id, attr) => {
  $(id).addEventListener("change", (event) => {
    if (event.target.value === "") {
      chat.removeAttribute(attr);
    } else {
      chat.setAttribute(attr, event.target.value);
    }
  });
};
$("cfg-placement").value = chat.getAttribute("placement") ?? "floating";
bind("cfg-placement", "placement");
bindOptional("cfg-side", "data-side");
$("cfg-min-page").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "") {
    chat.style.removeProperty("--ag-ui-min-page-width");
  } else {
    chat.style.setProperty("--ag-ui-min-page-width", value);
  }
});
chat.addEventListener("ag-ui-maximize", (event) => {
  $("cfg-maximized").textContent = `maximized: ${event.detail.maximized}`;
});
// resetSize() drops a dragged size and its stored copy, which otherwise
// outlives the tab and confuses a comparison of placements.
$("cfg-reset-size").addEventListener("click", () => {
  chat.resetSize();
});
$("cfg-move").addEventListener("click", () => {
  const moved = chat.moveTo("top-left");
  const { movable, draggable } = chat.describeSurface();
  $("cfg-move-out").textContent = `moved: ${moved}, movable: ${movable}, draggable: ${draggable}`;
});

// ── Collapse ─────────────────────────────────────────────────────────────────

bindOptional("cfg-collapse-icon", "data-collapse-icon");
bindOptional("cfg-anchor-side", "anchor-side");

// What a collapsed panel becomes. auto is the attribute's absence. Under none
// the widget is hidden while collapsed, so the page shows a toolbar of its own
// whose button drives the public API, and anchors the panel to that button.
const hostBar = $("host-bar");
const hostAgent = $("host-agent");
const labelHostAgent = () => {
  hostAgent.setAttribute("aria-pressed", String(!chat.collapsed));
};
// The page's share of the edges: the widget's bar height under bar, and the
// host toolbar's own under none. The widget never pads the page itself.
const publishChatBar = () => {
  const atTop = hostBar.hasAttribute("data-edge");
  const height = hostBar.hidden ? chat.barHeight : atTop ? 0 : hostBar.getBoundingClientRect().height;
  const top = !hostBar.hidden && atTop ? hostBar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--chat-header-height", `${Math.ceil(top)}px`);
  document.documentElement.style.setProperty("--chat-bar-height", `${Math.ceil(height)}px`);
};
chat.addEventListener("ag-ui-bar-height", publishChatBar);
$("cfg-collapse-to").addEventListener("change", (event) => {
  const value = event.target.value;
  // "none-corner" is none with no anchor: the panel stands in its own corner,
  // and the host bar's button is still the way back.
  const target = value === "none-corner" ? "none" : value;
  if (target === "") {
    chat.removeAttribute("collapse-to");
  } else {
    chat.setAttribute("collapse-to", target);
  }
  hostBar.hidden = target !== "none";
  const header = value === "none-header" || value === "none-header-left";
  hostBar.toggleAttribute("data-edge", header);
  if (header) {
    hostBar.setAttribute("data-edge", "top");
  }
  hostBar.toggleAttribute("data-align", value === "none-header-left");
  if (value === "none-header-left") {
    hostBar.setAttribute("data-align", "left");
  }
  if (value === "none" || header) {
    chat.setAttribute("anchor", "#host-agent");
  } else {
    chat.removeAttribute("anchor");
  }
  publishChatBar();
  labelHostAgent();
});
hostAgent.addEventListener("click", () => {
  chat.toggleCollapsed();
});
chat.addEventListener("ag-ui-toggle", labelHostAgent);

// The unread badge is on by default; the checkbox writes the opt-out.
$("cfg-badge").addEventListener("change", (event) => {
  chat.setAttribute("data-unread-badge", event.target.checked ? "true" : "false");
});
// The badge counts only answers that land while the widget is collapsed, which
// is out of reach by hand: collapsing takes the composer with it. A slash
// token takes the server's short branch, so the badge ticks in about a second.
$("cfg-ping").addEventListener("click", () => {
  chat.setCollapsed(true);
  void chat.sendMessage("/ping");
});

// ── Greeting ─────────────────────────────────────────────────────────────────

bindOptional("cfg-greeting", "data-greeting");
// Live, like the attribute: every keystroke re-greets, and an empty field is
// the nameless greeting rather than an empty name.
$("cfg-user-name").addEventListener("input", (event) => {
  const name = event.target.value;
  if (name.trim() === "") {
    chat.removeAttribute("user-name");
  } else {
    chat.userName = name;
  }
});

// ── Themes ───────────────────────────────────────────────────────────────────

// The theme attribute is two words, a name and a scheme, so the two pickers
// compose it. The header toggle flips the scheme word on its own, so the
// scheme picker follows the attribute back.
const SCHEMES = ["light", "dark", "auto"];
const applyTheme = () => {
  const value = [$("cfg-theme").value, $("cfg-scheme").value].filter(Boolean).join(" ");
  if (value === "") {
    chat.removeAttribute("theme");
  } else {
    chat.setAttribute("theme", value);
  }
};
$("cfg-theme").addEventListener("change", applyTheme);
$("cfg-scheme").addEventListener("change", applyTheme);
new MutationObserver(() => {
  const words = (chat.getAttribute("theme") ?? "").split(/\s+/);
  const scheme = words.find((word) => SCHEMES.includes(word)) ?? "";
  $("cfg-scheme").value = scheme === "light" ? "" : scheme;
  $("cfg-theme").value = words.find((word) => !SCHEMES.includes(word) && word !== "") ?? "";
}).observe(chat, { attributes: true, attributeFilter: ["theme"] });
bind("cfg-density", "density");

// The accent recipe from the README, set on the element as a host would.
const ACCENT_RECIPE = {
  "--ag-ui-header-bg": "#3d5afe",
  "--ag-ui-header-fg": "#ffffff",
  "--ag-ui-launcher-bg": "#3d5afe",
  "--ag-ui-launcher-fg": "#ffffff",
  "--ag-ui-tool-fg": "#3d5afe",
};
$("cfg-accent-recipe").addEventListener("change", (event) => {
  for (const [token, value] of Object.entries(ACCENT_RECIPE)) {
    if (event.target.checked) {
      chat.style.setProperty(token, value);
    } else {
      chat.style.removeProperty(token);
    }
  }
});

// Header control icons: the glyphs are slot fallbacks, so projecting light-DOM
// markup into icon-* replaces them without touching the shadow styles.
const HEADER_ICONS = {
  "icon-history": "🗂",
  "icon-new": "🆕",
  "icon-collapse": "🔽",
};
$("cfg-icons").addEventListener("change", (event) => {
  for (const [slot, glyph] of Object.entries(HEADER_ICONS)) {
    const existing = chat.querySelector(`[slot="${slot}"]`);
    if (!event.target.checked) {
      existing?.remove();
      continue;
    }
    if (existing === null) {
      chat.append(el("span", { slot, textContent: glyph }));
    }
  }
});

// The focus ring token, set on the element where a host sets it; the readout
// says whether a group head is showing it.
const applyRing = () => {
  if ($("cfg-ring-on").checked) {
    chat.style.setProperty("--ag-ui-ring", $("cfg-ring").value);
    $("cfg-ring-out").textContent = $("cfg-ring").value;
  } else {
    chat.style.removeProperty("--ag-ui-ring");
    $("cfg-ring-out").textContent = "default";
  }
};
$("cfg-ring-on").addEventListener("change", applyRing);
$("cfg-ring").addEventListener("input", () => {
  $("cfg-ring-on").checked = true;
  applyRing();
});
$("cfg-ring-focus").addEventListener("click", () => {
  const groupHead = chat.shadowRoot.querySelector(".tool-group-head");
  if (groupHead === null) {
    $("cfg-ring-out").textContent = "no step group yet: send the Try prompt";
    return;
  }
  chat.setCollapsed(false);
  groupHead.focus({ focusVisible: true });
  const outline = getComputedStyle(groupHead).outlineStyle;
  $("cfg-ring-out").textContent = `${$("cfg-ring-on").checked ? $("cfg-ring").value : "default"}, outline ${outline}`;
});

// The header buttons' hover square.
const applyHeaderHover = () => {
  if ($("cfg-hover-on").checked) {
    chat.style.setProperty("--ag-ui-header-btn-hover", $("cfg-hover").value);
    $("cfg-hover-out").textContent = $("cfg-hover").value;
  } else {
    chat.style.removeProperty("--ag-ui-header-btn-hover");
    $("cfg-hover-out").textContent = "default";
  }
};
$("cfg-hover-on").addEventListener("change", applyHeaderHover);
$("cfg-hover").addEventListener("input", () => {
  $("cfg-hover-on").checked = true;
  applyHeaderHover();
});

// ── Answers ──────────────────────────────────────────────────────────────────

bind("cfg-text", "data-text-animation");
// The well is a boolean attribute (presence = on), so toggle rather than set.
$("cfg-well").addEventListener("change", (event) => {
  chat.toggleAttribute("data-answer-well", event.target.checked);
});

// ── Strings ──────────────────────────────────────────────────────────────────

const STRING_KEYS = ["title", "confirm", "cancel", "toolRunning", "mcpAppUnsupported"];
$("strings-out").textContent = STRING_KEYS.map((key) => `${key}: ${JSON.stringify(chat.uiStrings[key])}`).join("\n");
$("strings-out").style.whiteSpace = "pre-wrap";

// ── Composer ─────────────────────────────────────────────────────────────────

// The above-composer slot: host markup, filled and emptied live, so the
// "takes no space when empty" half of the contract can be looked at too.
let aboveStrip = null;
$("cfg-above").addEventListener("change", (event) => {
  if (event.target.checked) {
    aboveStrip = el(
      "div",
      { slot: "above-composer", className: "context-strip" },
      el("span", {}, "Context: ", el("b", {}, "Create Article"), ", 4 fields"),
      el("button", { type: "button", textContent: "Attach form" }),
    );
    aboveStrip.querySelector("button").addEventListener("click", () => {
      void chat.sendMessage("Summarize the current values of the article form.");
    });
    chat.append(aboveStrip);
    $("cfg-above-out").textContent = "filled";
  } else {
    aboveStrip?.remove();
    aboveStrip = null;
    $("cfg-above-out").textContent = "empty";
  }
});

// ── Threads ──────────────────────────────────────────────────────────────────

// A slow conversation store, for looking at what happens while a stored
// conversation loads. The built-in store answers in a microtask; a
// server-backed one costs a round trip on every restore. With the box ticked,
// every load the element asks for waits three seconds first. Patched onto the
// store the element holds now, and again whenever it is handed a new one.
let slowLoads = false;
const SLOW = Symbol("slow");
const slowStore = () => {
  const store = chat.conversationStore;
  if (store[SLOW]) {
    return;
  }
  const load = store.loadMessages.bind(store);
  store.loadMessages = async (threadId) => {
    if (slowLoads) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return load(threadId);
  };
  store[SLOW] = true;
};
$("cfg-slow-store").addEventListener("change", (event) => {
  slowLoads = event.target.checked;
  slowStore();
});
// A host's prompt fired as a restore starts: it waits for the conversation,
// then sends under it, and says what sendMessage resolved to.
$("cfg-restore-send").addEventListener("click", () => {
  slowStore();
  const out = $("cfg-restore-out");
  out.textContent = "waiting...";
  void chat.reload();
  void chat.sendMessage("/ping").then((sent) => {
    out.textContent = `sent: ${sent}`;
  });
});

const tail = (value) => (value === null || value === undefined ? "null" : String(value).slice(-6));
if (on("threads")) {
  const syncThreadReadout = () => {
    $("thr-id").textContent = chat.threadId === null ? "null" : tail(chat.threadId);
    $("thr-running").textContent = String(chat.running);
  };
  // Rebuilt only when what it lists changed: replacing the options of an open
  // select closes it under the pointer.
  let pickerSignature = "";
  const refreshThreadPicker = async () => {
    const pick = $("thr-pick");
    const threads = await chat.conversationStore.listThreads();
    const signature = JSON.stringify([chat.threadId, threads.map((t) => [t.threadId, t.title, t.preview])]);
    if (signature === pickerSignature) {
      return;
    }
    pickerSignature = signature;
    pick.replaceChildren(new Option("(stored threads)", ""));
    for (const thread of threads) {
      const label = `${tail(thread.threadId)} ${thread.title ?? thread.preview ?? ""}`.trim();
      pick.append(new Option(thread.threadId === chat.threadId ? `${label} (on screen)` : label, thread.threadId));
    }
  };
  chat.addEventListener(THREAD_EVENT, (event) => {
    const { threadId, previousThreadId, reason } = event.detail;
    const log = $("thr-log");
    log.prepend(el("li", {}, `${reason}: ${tail(previousThreadId)} -> ${tail(threadId)}`));
    while (log.children.length > 5) {
      log.lastElementChild.remove();
    }
    syncThreadReadout();
    void refreshThreadPicker();
  });
  // Messages sent land a thread in the store without a thread event, and
  // running changes with none either, so both readouts also tick.
  setInterval(() => {
    syncThreadReadout();
    void refreshThreadPicker();
  }, 600);
  syncThreadReadout();
  void refreshThreadPicker();
}
$("thr-new").addEventListener("click", () => {
  chat.newChat();
});
$("thr-pick").addEventListener("change", (event) => {
  if (event.target.value !== "") {
    void chat.switchThread(event.target.value);
  }
});
$("thr-reload").addEventListener("click", () => {
  void chat.reload();
});

// ── Ratings ──────────────────────────────────────────────────────────────────

// What a host files a rating under, ids shortened to their tails.
chat.addEventListener("ag-ui-feedback", (event) => {
  const { rating, messageId, threadId, runId } = event.detail;
  $("cfg-ratings-out").textContent =
    `${rating} msg ${tail(messageId)} thread ${tail(threadId)} ` +
    (runId === undefined ? "no run" : `run ${tail(runId)}`);
});

// ── Driving the page ─────────────────────────────────────────────────────────

// The overlay highlight: whether a dimmed page with a hole in it reads as
// "look here" or as a modal nobody opened. Inert, so the form stays usable.
$("cfg-spotlight").addEventListener("click", () => {
  const dismiss = showHighlightOverlay($("article-card"), { scrim: true, gradient: true });
  setTimeout(dismiss, 4000);
});

// ── Tool status parts ────────────────────────────────────────────────────────

bind("cfg-tools", "data-tool-display");
// How an opened group draws its calls; read only while Tool cards is grouped.
bind("cfg-group-tools", "data-tool-group-display");

// ::part() takes no attribute selector, so each status is its own part name,
// and one rule per name is the whole of the host's side.
const CARD_STATUSES = {
  pending: "#2563eb",
  deferred: "#d97706",
  done: "#059669",
  error: "#dc2626",
  declined: "#7c3aed",
  interrupted: "#6b7280",
};
const GROUP_STATES = {
  waiting: "#d97706",
  running: "#2563eb",
  done: "#059669",
  error: "#dc2626",
};
const statusSheet = () =>
  [
    ...Object.entries(CARD_STATUSES).flatMap(([name, color]) => [
      `ag-ui-chat::part(tool-card-${name}) { outline: 2px solid ${color}; outline-offset: -2px; }`,
      `ag-ui-chat::part(tool-card-status-${name}) { background: ${color}; color: #fff; border-radius: 999px; }`,
    ]),
    ...Object.entries(GROUP_STATES).map(
      ([name, color]) => `ag-ui-chat::part(tool-group-${name}) { box-shadow: inset 4px 0 0 ${color}; }`,
    ),
  ].join("\n");
const legend = $("status-legend");
for (const [kind, table] of [
  ["card", CARD_STATUSES],
  ["group", GROUP_STATES],
]) {
  for (const [name, color] of Object.entries(table)) {
    const swatch = el("span", { textContent: `${kind} ${name}` });
    swatch.style.setProperty("--swatch", color);
    legend.append(swatch);
  }
}
let statusStyle = null;
$("cfg-status-parts").addEventListener("change", (event) => {
  if (event.target.checked) {
    statusStyle = el("style", { textContent: statusSheet() });
    document.head.append(statusStyle);
  } else {
    statusStyle?.remove();
    statusStyle = null;
  }
});
// What the transcript carries right now, counted from the parts themselves.
if (on("tool-cards")) {
  const census = () => {
    const counts = new Map();
    for (const node of chat.shadowRoot.querySelectorAll("[part]")) {
      for (const name of node.getAttribute("part").split(/\s+/)) {
        const card = /^tool-card-status-(\w+)$/.exec(name);
        const group = /^tool-group-(waiting|running|done|error)$/.exec(name);
        const key = card ? `card ${card[1]}` : group ? `group ${group[1]}` : null;
        if (key !== null) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    $("status-census").textContent =
      counts.size === 0 ? "no tool cards yet" : [...counts].map(([key, count]) => `${key} ${count}`).join(", ");
  };
  new MutationObserver(census).observe(chat.shadowRoot, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["part"],
  });
  census();
}

// ── MCP Apps ─────────────────────────────────────────────────────────────────

// Registered on its own scenario only, so every other page shows the
// element's built-in notice: in 0.5.0 the two draw the same thing.
if (on("mcp-apps")) {
  registerMcpApps(chat, { url: "/mcp-apps/" });
  $("mcp-out").textContent = 'registerMcpApps(chat, { url: "/mcp-apps/" }) from /mcp-apps.bundle.js';
}

// ── The place chip ───────────────────────────────────────────────────────────

// The select stands in for the host's router: changing it changes what
// getPlace returns and calls refreshPlace(), as an app would after a pushState.
// A page map rides too, so withholding the place can be seen to withhold it.
const PLACES = {
  article: { label: "Create Article", detail: "Articles", href: "/articles/add/" },
  billing: { label: "Billing settings", detail: "Account", href: "/settings/billing/" },
  long: {
    label: "Purchase order #48213 for Northwind Traders International Holdings, shipping to Rotterdam",
    detail: "Procurement, awaiting approval",
    href: "/procurement/orders/48213/",
  },
  none: null,
};
const syncPlaceReadout = () => {
  const place = chat.getPlace?.() ?? null;
  $("cfg-place-out").textContent = place === null ? "no chip" : place.label;
};
if (on("place", "requests", "drive")) {
  chat.getPlace = () => PLACES[$("cfg-place").value] ?? null;
  chat.getPageMap = () => ({ form: "article", fields: ["title", "slug", "status", "featured"] });
  // Set after the element connected, so the first read is asked for here.
  chat.refreshPlace();
}
syncPlaceReadout();
$("cfg-place").addEventListener("change", () => {
  chat.refreshPlace();
  syncPlaceReadout();
});
$("cfg-place-ask").addEventListener("click", () => send("Where am I?"));

// ── Requests and run context ─────────────────────────────────────────────────

// The release form's run says which surface is open, after whatever
// getContext returns.
if (on("activities")) {
  chat.registerContext(() => [{ description: "demo_surface", value: "release_form" }]);
}
// The editor's writes go through chat.request, so the header read here is
// sent with each one; untick it to see the server refuse a write.
if (on("skill-editor")) {
  chat.getHeaders = () => ($("skills-csrf").checked ? { "X-CSRFToken": "demo-token" } : {});
  $("skills-open").addEventListener("click", () => chat.openSkillEditor());
}
if (on("requests")) {
  chat.headers = { "X-Demo-Static": "from chat.headers" };
  chat.getHeaders = () => ({ "X-Demo-Rotating": `token-${Math.floor(Date.now() / 1000) % 1000}` });
  $("req-send").addEventListener("click", async () => {
    $("req-out").textContent = "...";
    const response = await chat.request("/whoami/", { headers: { "X-Demo-Call": "from init.headers" } });
    $("req-out").textContent = JSON.stringify((await response.json()).headers);
  });
  const ENTRY = { description: "demo_scenario", value: "requests" };
  let unregister = null;
  const syncContext = () => {
    unregister?.();
    unregister = $("ctx-on").checked ? chat.registerContext(() => [ENTRY]) : null;
    $("ctx-out").textContent = unregister === null ? "none registered" : JSON.stringify(ENTRY);
  };
  $("ctx-on").addEventListener("change", syncContext);
  syncContext();
}

// ── After a Try or Reset ─────────────────────────────────────────────────────

// Controls come back in page order and fire the events their handlers listen
// for, so each one is applied the way a click or a keystroke would apply it.
if (restart !== null) {
  for (const [id, value] of restart.controls) {
    const control = $(id);
    if (control === null) {
      continue;
    }
    if (typeof value === "boolean") {
      if (control.checked === value) {
        continue;
      }
      control.checked = value;
    } else {
      if (control.value === value) {
        continue;
      }
      control.value = value;
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (restart.prompt !== null) {
    send(restart.prompt);
  }
}

// ── Runs that outlive their connection ───────────────────────────────────────

$("det-a").addEventListener("click", () => void chat.switchThread("detached-a"));
$("det-b").addEventListener("click", () => void chat.switchThread("detached-b"));
$("det-placement").addEventListener("change", (event) => {
  chat.setAttribute("placement", event.target.value);
});
const detachedState = () => {
  $("det-state").textContent =
    `thread ${chat.threadId ?? "-"}, ${chat.running ? "running" : "idle"}`;
};
chat.addEventListener("ag-ui-thread", detachedState);
new MutationObserver(detachedState).observe(chat, {
  attributes: true,
  attributeFilter: ["data-running"],
});

// ── Child sessions ───────────────────────────────────────────────────────────

$("cs-parent").addEventListener("click", () => void chat.switchThread("children-parent"));
$("cs-offsite").addEventListener("click", () => void chat.switchThread("children-offsite"));
$("cs-placement").addEventListener("change", (event) => {
  chat.setAttribute("placement", event.target.value);
});
chat.addEventListener("ag-ui-open-thread", (event) => {
  $("cs-last").textContent = JSON.stringify(event.detail);
  if ($("cs-route").checked) {
    event.preventDefault();
  }
});
