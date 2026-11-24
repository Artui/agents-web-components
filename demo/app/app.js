// The demo page, one document for every scenario. The URL names a scenario
// (/scenarios/<slug>/) or the start page (/), and following a link to either,
// Back, Forward, Try and Reset all mount it in place instead of loading a page:
// Safari blanks the frame between documents, which reads as a reload on every
// click. Each mount gets its own <ag-ui-chat>, whose id keys its stored
// conversation, so a thread started in one scenario is not waiting in the next.
//
// The nav is drawn once from scenarios.js. A mount swaps in fresh copies of the
// <section data-scenario> blocks from index.html, configures a new element before
// it connects and wires the controls; its teardown undoes all of it, so each
// mount starts as clean as a page load did.
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

// Taken before anything writes to them: what every mount starts from.
const PRISTINE_SECTIONS = [...document.querySelectorAll("section[data-scenario]")].map((s) => s.cloneNode(true));
const PRISTINE_HOST_BAR = $("host-bar").cloneNode(true);
const CHAT_SLOT = $("chat").parentElement;
const CHAT_ATTRS = [...$("chat").attributes].filter((a) => a.name !== "id").map((a) => [a.name, a.value]);
$("chat").remove();
defineChat();

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

// randomUUID exists only in a secure context, and the demo is also opened over
// plain HTTP on a LAN address.
const uuid = () =>
  crypto.randomUUID?.() ??
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ── The shell, drawn once ────────────────────────────────────────────────────

$("version").textContent = VERSION;

const navLinks = new Map();
for (const group of GROUPS) {
  const list = el("ul");
  for (const item of SCENARIOS.filter((s) => s.group === group)) {
    const link = el("a", { href: `/scenarios/${item.slug}/` }, item.title, el("small", {}, item.since));
    navLinks.set(item.slug, link);
    list.append(el("li", {}, link));
  }
  $("nav-groups").append(el("h2", {}, group), list);
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

// ── Mounting a scenario ──────────────────────────────────────────────────────

// Try and Reset start over: the scenario's stored state (its conversation,
// collapsed state, theme, size) is dropped and it mounts afresh, so nothing an
// earlier run left behind (a filled form, a pending approval, a readout) carries
// into the next. Try keeps the scenario's control values and sends its prompt
// once mounted; Reset leaves every control at its default. A scenario row with
// inPlace has Try send into the chat as it is.
const clearStorage = (slug, everything) => {
  for (const store of [sessionStorage, localStorage]) {
    for (const key of Object.keys(store)) {
      if (key.includes(`chat-${slug}`) || (everything && key.startsWith("demo:"))) {
        store.removeItem(key);
      }
    }
  }
};

function mount(pathname, restart) {
  const scenario = scenarioFor(pathname);
  const slug = scenario?.slug ?? "start";
  const on = (...slugs) => slugs.includes(slug);
  const teardown = new AbortController();
  const { signal } = teardown;
  const onTeardown = (undo) => signal.addEventListener("abort", undo, { once: true });
  const tracked = (observer) => {
    onTeardown(() => observer.disconnect());
    return observer;
  };

  for (const [index, live] of [...document.querySelectorAll("section[data-scenario]")].entries()) {
    live.replaceWith(PRISTINE_SECTIONS[index].cloneNode(true));
  }
  $("host-bar").replaceWith(PRISTINE_HOST_BAR.cloneNode(true));
  document.title =
    scenario === null ? "agents-web-components demo" : `${scenario.title} · agents-web-components demo`;
  for (const [key, link] of navLinks) {
    if (key === slug) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  const controlsOf = () => [
    ...document.querySelectorAll(`section[data-scenario="${slug}"] .controls :is(input, select, textarea)[id]`),
  ];
  const startOver = (prompt) => {
    const controls =
      prompt === null
        ? []
        : controlsOf().map((c) => [c.id, c.type === "checkbox" || c.type === "radio" ? c.checked : c.value]);
    show(pathname, { slug, prompt, controls });
  };

  // ── The element, configured before it connects ─────────────────────────────

  const chat = document.createElement("ag-ui-chat");
  for (const [name, value] of CHAT_ATTRS) {
    chat.setAttribute(name, value);
  }
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
  // data-strings is read once while connecting, so the checkbox remounts.
  if (on("strings") && sessionStorage.getItem("demo:i18n") === "1") {
    chat.setAttribute("data-strings", JSON.stringify(DE));
    $("cfg-i18n").checked = true;
  }
  $("cfg-i18n").addEventListener(
    "change",
    (event) => {
      sessionStorage.setItem("demo:i18n", event.target.checked ? "1" : "0");
      show(pathname);
    },
    { signal },
  );
  CHAT_SLOT.append(chat);
  onTeardown(() => chat.remove());

  const send = (text) => {
    chat.setCollapsed(false);
    void chat.sendMessage(text);
  };

  const head = $("scenario-head");
  head.replaceChildren();
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
      button.addEventListener("click", () => (scenario.inPlace === true ? send(text) : startOver(text)), { signal });
      tryRow.append(button);
    }
    const reset = el("button", { type: "button", className: "reset", title: "A fresh conversation, every control at its default" }, "Reset");
    reset.addEventListener("click", () => startOver(null), { signal });
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
          const runId = uuid();
          void chat.run({
            forwardedProps: { action: "submit_release", name: input.value },
            runId,
            message: { id: `${runId}-turn`, content: `Release name: ${input.value}` },
          });
        }, { signal });
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
  }, { signal });
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
  }, { signal });

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
    }, { signal });
  };
  // Absent is a value of its own for these: the attribute's default.
  const bindOptional = (id, attr) => {
    $(id).addEventListener("change", (event) => {
      if (event.target.value === "") {
        chat.removeAttribute(attr);
      } else {
        chat.setAttribute(attr, event.target.value);
      }
    }, { signal });
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
  }, { signal });
  $("cfg-width").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value === "") {
      chat.style.removeProperty("--ag-ui-width");
    } else {
      chat.style.setProperty("--ag-ui-width", value);
    }
  }, { signal });
  chat.addEventListener("ag-ui-maximize", (event) => {
    $("cfg-maximized").textContent = `maximized: ${event.detail.maximized}`;
  }, { signal });
  // resetSize() drops a dragged size and its stored copy, which otherwise
  // outlives the tab and confuses a comparison of placements.
  $("cfg-reset-size").addEventListener("click", () => {
    chat.resetSize();
  }, { signal });
  $("cfg-move").addEventListener("click", () => {
    const moved = chat.moveTo("top-left");
    const { movable, draggable } = chat.describeSurface();
    $("cfg-move-out").textContent = `moved: ${moved}, movable: ${movable}, draggable: ${draggable}`;
  }, { signal });

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
  chat.addEventListener("ag-ui-bar-height", publishChatBar, { signal });
  onTeardown(() => {
    document.documentElement.style.removeProperty("--chat-header-height");
    document.documentElement.style.removeProperty("--chat-bar-height");
  });
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
  }, { signal });
  hostAgent.addEventListener("click", () => {
    chat.toggleCollapsed();
  }, { signal });
  chat.addEventListener("ag-ui-toggle", labelHostAgent, { signal });

  // The unread badge is on by default; the checkbox writes the opt-out.
  $("cfg-badge").addEventListener("change", (event) => {
    chat.setAttribute("data-unread-badge", event.target.checked ? "true" : "false");
  }, { signal });
  // The badge counts only answers that land while the widget is collapsed, which
  // is out of reach by hand: collapsing takes the composer with it. A slash
  // token takes the server's short branch, so the badge ticks in about a second.
  $("cfg-ping").addEventListener("click", () => {
    chat.setCollapsed(true);
    void chat.sendMessage("/ping");
  }, { signal });

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
  }, { signal });

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
  $("cfg-theme").addEventListener("change", applyTheme, { signal });
  $("cfg-scheme").addEventListener("change", applyTheme, { signal });
  tracked(new MutationObserver(() => {
    const words = (chat.getAttribute("theme") ?? "").split(/\s+/);
    const scheme = words.find((word) => SCHEMES.includes(word)) ?? "";
    $("cfg-scheme").value = scheme === "light" ? "" : scheme;
    $("cfg-theme").value = words.find((word) => !SCHEMES.includes(word) && word !== "") ?? "";
  })).observe(chat, { attributes: true, attributeFilter: ["theme"] });
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
  }, { signal });

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
  }, { signal });

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
  $("cfg-ring-on").addEventListener("change", applyRing, { signal });
  $("cfg-ring").addEventListener("input", () => {
    $("cfg-ring-on").checked = true;
    applyRing();
  }, { signal });
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
  }, { signal });

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
  $("cfg-hover-on").addEventListener("change", applyHeaderHover, { signal });
  $("cfg-hover").addEventListener("input", () => {
    $("cfg-hover-on").checked = true;
    applyHeaderHover();
  }, { signal });

  // ── Answers ──────────────────────────────────────────────────────────────────

  bind("cfg-text", "data-text-animation");
  // The well is a boolean attribute (presence = on), so toggle rather than set.
  $("cfg-well").addEventListener("change", (event) => {
    chat.toggleAttribute("data-answer-well", event.target.checked);
  }, { signal });

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
  }, { signal });

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
  }, { signal });
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
  }, { signal });

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
    }, { signal });
    // Messages sent land a thread in the store without a thread event, and
    // running changes with none either, so both readouts also tick.
    const ticker = setInterval(() => {
      syncThreadReadout();
      void refreshThreadPicker();
    }, 600);
    onTeardown(() => clearInterval(ticker));
    syncThreadReadout();
    void refreshThreadPicker();
  }
  $("thr-new").addEventListener("click", () => {
    chat.newChat();
  }, { signal });
  $("thr-pick").addEventListener("change", (event) => {
    if (event.target.value !== "") {
      void chat.switchThread(event.target.value);
    }
  }, { signal });
  $("thr-reload").addEventListener("click", () => {
    void chat.reload();
  }, { signal });

  // ── Ratings ──────────────────────────────────────────────────────────────────

  // What a host files a rating under, ids shortened to their tails.
  chat.addEventListener("ag-ui-feedback", (event) => {
    const { rating, messageId, threadId, runId } = event.detail;
    $("cfg-ratings-out").textContent =
      `${rating} msg ${tail(messageId)} thread ${tail(threadId)} ` +
      (runId === undefined ? "no run" : `run ${tail(runId)}`);
  }, { signal });

  // ── Driving the page ─────────────────────────────────────────────────────────

  // The overlay highlight: whether a dimmed page with a hole in it reads as
  // "look here" or as a modal nobody opened. Inert, so the form stays usable.
  $("cfg-spotlight").addEventListener("click", () => {
    const dismiss = showHighlightOverlay($("article-card"), { scrim: true, gradient: true });
    const timer = setTimeout(dismiss, 4000);
    onTeardown(() => {
      clearTimeout(timer);
      dismiss();
    });
  }, { signal });

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
  onTeardown(() => statusStyle?.remove());
  $("cfg-status-parts").addEventListener("change", (event) => {
    if (event.target.checked) {
      statusStyle = el("style", { textContent: statusSheet() });
      document.head.append(statusStyle);
    } else {
      statusStyle?.remove();
      statusStyle = null;
    }
  }, { signal });
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
    tracked(new MutationObserver(census)).observe(chat.shadowRoot, {
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
  }, { signal });
  $("cfg-place-ask").addEventListener("click", () => send("Where am I?"), { signal });

  // ── Requests and run context ─────────────────────────────────────────────────

  // The release form's run says which surface is open, after whatever
  // getContext returns.
  if (on("activities")) {
    chat.registerContext(() => [{ description: "demo_surface", value: "release_form" }]);
  }
  // The editor's writes go through chat.request, so the header read here is
  // sent with each one; untick it to see the server refuse a write.
  // The routine form's slots: a host control slotted as routine-time or
  // routine-timezone replaces the built-in field and is read on save. The
  // form reads the step when it opens, so reopen it after changing either.
  if (on("routines")) {
    const PLUGGED = {
      "routine-time": ["07:00", "08:00", "12:30", "18:00"],
      "routine-timezone": ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo"],
    };
    $("rt-plugged").addEventListener("change", (event) => {
      for (const [slot, values] of Object.entries(PLUGGED)) {
        chat.querySelector(`[slot="${slot}"]`)?.remove();
        if (event.target.checked) {
          const options = values.map((value) => el("option", { value, textContent: value }));
          chat.append(el("select", { slot, ariaLabel: slot === "routine-time" ? "Run at" : "Zone" }, ...options));
        }
      }
    }, { signal });
    $("rt-step").addEventListener("change", (event) => {
      if (event.target.value === "") {
        chat.removeAttribute("data-routine-minute-step");
      } else {
        chat.setAttribute("data-routine-minute-step", event.target.value);
      }
    }, { signal });
    $("rt-dark").addEventListener("change", (event) => {
      if (event.target.checked) {
        chat.setAttribute("theme", "dark");
      } else {
        chat.removeAttribute("theme");
      }
    }, { signal });
  }
  if (on("skill-editor")) {
    chat.getHeaders = () => ($("skills-csrf").checked ? { "X-CSRFToken": "demo-token" } : {});
    $("skills-open").addEventListener("click", () => chat.openSkillEditor(), { signal });
  }
  if (on("requests")) {
    chat.headers = { "X-Demo-Static": "from chat.headers" };
    chat.getHeaders = () => ({ "X-Demo-Rotating": `token-${Math.floor(Date.now() / 1000) % 1000}` });
    $("req-send").addEventListener("click", async () => {
      $("req-out").textContent = "...";
      const response = await chat.request("/whoami/", { headers: { "X-Demo-Call": "from init.headers" } });
      $("req-out").textContent = JSON.stringify((await response.json()).headers);
    }, { signal });
    const ENTRY = { description: "demo_scenario", value: "requests" };
    let unregister = null;
    const syncContext = () => {
      unregister?.();
      unregister = $("ctx-on").checked ? chat.registerContext(() => [ENTRY]) : null;
      $("ctx-out").textContent = unregister === null ? "none registered" : JSON.stringify(ENTRY);
    };
    $("ctx-on").addEventListener("change", syncContext, { signal });
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

  $("det-a").addEventListener("click", () => void chat.switchThread("detached-a"), { signal });
  $("det-b").addEventListener("click", () => void chat.switchThread("detached-b"), { signal });
  $("det-placement").addEventListener("change", (event) => {
    chat.setAttribute("placement", event.target.value);
  }, { signal });
  const detachedState = () => {
    $("det-state").textContent =
      `thread ${chat.threadId ?? "-"}, ${chat.running ? "running" : "idle"}`;
  };
  chat.addEventListener("ag-ui-thread", detachedState, { signal });
  tracked(new MutationObserver(detachedState)).observe(chat, {
    attributes: true,
    attributeFilter: ["data-running"],
  });

  // ── Child sessions ───────────────────────────────────────────────────────────

  $("cs-parent").addEventListener("click", () => void chat.switchThread("children-parent"), { signal });
  $("cs-offsite").addEventListener("click", () => void chat.switchThread("children-offsite"), { signal });
  $("cs-placement").addEventListener("change", (event) => {
    chat.setAttribute("placement", event.target.value);
  }, { signal });
  chat.addEventListener("ag-ui-open-thread", (event) => {
    $("cs-last").textContent = JSON.stringify(event.detail);
    if ($("cs-route").checked) {
      event.preventDefault();
    }
  }, { signal });

  // ── Open threads (tabs) ──────────────────────────────────────────────────────

  if (on("tabs")) {
    const drawTabs = () => {
      const strip = $("tabs-strip");
      strip.replaceChildren();
      for (const { threadId, title } of chat.tabs) {
        const pick = el("button", { type: "button" }, title === "" ? "New chat" : title);
        pick.setAttribute("aria-pressed", String(threadId === chat.threadId));
        pick.addEventListener("click", () => void chat.switchThread(threadId), { signal });
        const close = el("button", { type: "button", title: "chat.closeTab" }, "x");
        close.addEventListener("click", () => chat.closeTab(threadId), { signal });
        strip.append(pick, close);
      }
    };
    chat.addEventListener("ag-ui-tabs", (event) => {
      $("tabs-out").textContent = `${event.detail.reason}: ${event.detail.tabs.length} open`;
      drawTabs();
    }, { signal });
    chat.addEventListener("ag-ui-thread", drawTabs, { signal });
    $("tabs-new").addEventListener("click", () => chat.newChat(), { signal });
    $("tabs-history").addEventListener("click", async () => {
      const open = new Set(chat.tabs.map((tab) => tab.threadId));
      const next = (await chat.conversationStore.listThreads()).find((row) => !open.has(row.threadId));
      if (next !== undefined) {
        chat.openTab(next.threadId, next.title);
      }
    }, { signal });
    if (chat.threadId !== null) {
      chat.openTab(chat.threadId);
    }
    drawTabs();
  }
  return () => teardown.abort();
}

// ── Moving between scenarios ─────────────────────────────────────────────────

// Mounts run one after another, so a second click waits for the first swap.
// Where the browser has same-document view transitions, the old frame fades
// into the new one rather than cutting.
let unmount = () => {};
let wanted = location.pathname;
let queue = Promise.resolve();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const transition = (update) => {
  if (typeof document.startViewTransition !== "function" || reducedMotion.matches) {
    return update();
  }
  const swap = document.startViewTransition(update);
  swap.ready.catch(() => {});
  return swap.updateCallbackDone;
};
function show(pathname, restart = null) {
  const moved = pathname !== wanted;
  wanted = pathname;
  const update = async () => {
    unmount();
    unmount = () => {};
    if (restart !== null) {
      // After the old element left: a run it cancelled on the way out may
      // still write what it had.
      await new Promise((resolve) => setTimeout(resolve));
      clearStorage(restart.slug, restart.prompt === null);
    }
    unmount = mount(pathname, restart);
    if (moved) {
      window.scrollTo(0, 0);
    }
  };
  queue = queue.then(() => transition(update)).catch((error) => console.error(error));
}

// A link to the start page or a scenario is followed in place; every other
// link (the full page route, the agents home, a modified click) navigates.
document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (
    link === null ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    link.target !== ""
  ) {
    return;
  }
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash !== "" || (url.pathname !== "/" && scenarioFor(url.pathname) === null)) {
    return;
  }
  event.preventDefault();
  setNav(false);
  if (url.pathname !== location.pathname) {
    history.pushState(null, "", url.pathname);
  }
  if (url.pathname !== wanted) {
    show(url.pathname);
  }
});
window.addEventListener("popstate", () => {
  if (location.pathname !== wanted) {
    show(location.pathname);
  }
});
history.scrollRestoration = "manual";
unmount = mount(location.pathname, null);
