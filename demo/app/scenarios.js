// Every scenario the demo has, in navigation order. The nav, the start page
// and each scenario's header are drawn from this list; a scenario's controls
// are its <section data-scenario> in index.html.
//
// A new feature gets a row here (or a prompt on an existing row) and, if it has
// controls, a section. `since` is the release that brought it to this package;
// 0.1.0 marks what came over from the predecessor line.
//
// `prompts` are [label, text] pairs the scenario's Try buttons send. The text
// is what the mock agent (mock-server.mjs) matches on, so it is the
// documentation of that agent too: the start page lists every one. Try starts
// over from a fresh load, unless the row sets `inPlace`, whose walkthrough
// carries one conversation into the next: then Try sends into the chat as it is.

export const GROUPS = [
  "Layout",
  "Look",
  "Conversation",
  "Tools and approvals",
  "Server-drawn content",
  "Host seams",
];

export const SCENARIOS = [
  // Layout
  {
    slug: "placements",
    group: "Layout",
    title: "Placements and size",
    since: "0.1.0",
    summary:
      "Where the panel lives: floating, sidebar, page, embedded and the three undocumented placements, with resize, maximize and the host's own move. Narrow the panel to watch the header move its optional controls into the More menu (0.11.0).",
    prompts: [["Send a turn", "echo hello"]],
  },
  {
    slug: "collapse",
    group: "Layout",
    title: "Collapse, launcher and bar",
    since: "0.1.0",
    summary:
      "What a collapsed panel becomes: the round launcher, a bottom bar, or nothing behind the host's own button, plus the unread badge.",
    prompts: [],
  },
  {
    slug: "greeting",
    group: "Layout",
    title: "Greeting and the full page",
    since: "0.1.0",
    summary:
      "The empty conversation greets the user by name with the composer centred. The full page route is the same chat as a host's own /chat page, in the page placement.",
    prompts: [["Send something", "echo hello"]],
    link: ["Open the full page", "/page/"],
  },
  // Look
  {
    slug: "themes",
    group: "Look",
    title: "Themes and tokens",
    since: "0.1.0",
    summary:
      "The five themes in light, dark and auto, density, the brand-accent recipe and the tokens a host sets on the element.",
    prompts: [["A turn with tools", "delegate this"]],
  },
  {
    slug: "text",
    group: "Look",
    title: "Answers and reasoning",
    since: "0.1.0",
    summary:
      "How an answer arrives: incoming-text animation, the answer well, markdown, and a model's reasoning folding away when the answer starts.",
    prompts: [
      ["Reason, then answer", "reason about a release checklist"],
      ["Reason silently", "think silently"],
      ["A plain echo", "echo hello there"],
    ],
  },
  {
    slug: "strings",
    group: "Look",
    title: "Strings and localisation",
    since: "0.1.0",
    summary:
      "Every label comes from one string table. Swap it for German, and read the table back through chat.uiStrings (0.5.0).",
    prompts: [["Fail a tool", "break something"]],
  },
  // Conversation
  {
    slug: "composer",
    group: "Conversation",
    title: "Composer and skills",
    since: "0.1.0",
    summary:
      "Prompt chips and the slash palette, a server-resolved skill, a template skill, attachments, voice input, the above-composer slot and quoting a selection.",
    prompts: [["Server-resolved skill", "/triage"]],
    skills: true,
  },
  {
    slug: "skill-editor",
    group: "Conversation",
    title: "The skill editor",
    since: "0.7.0",
    summary:
      "A caller's own stored skills: the Skills button and the palette's Manage skills row open a full-panel editor, writes carry the live CSRF header, and a skill the agent saves reaches the palette without a reload (0.7.0).",
    prompts: [["Draft one with the agent", "/create-skill"]],
    attrs: {
      "data-skills-url": "/skills/",
      "data-skill-editor-url": "/skills/editor/",
      "data-skill-editor-button": "",
      "data-slash-commands": "true",
    },
  },
  {
    slug: "threads",
    group: "Conversation",
    title: "Threads and durability",
    since: "0.1.0",
    summary:
      "The thread API, the history drawer, restoring a conversation after a reload, a slow store, and resuming or forking a stored run.",
    prompts: [["Start a thread", "echo first message"]],
  },
  {
    slug: "message-actions",
    group: "Conversation",
    title: "Message actions and ratings",
    since: "0.1.0",
    summary:
      "Copy, retry and the rating pair under an answer, and what a rating names: the message, its thread and the run that streamed it.",
    prompts: [["Echo hello", "echo hello"]],
    attrs: { "data-message-actions": "copy,retry,feedback" },
  },
  {
    slug: "failures",
    group: "Conversation",
    title: "Failures, stops and usage",
    since: "0.2.0",
    summary:
      "A failed run's bubble by RUN_ERROR code (0.2.0), a refused POST (0.2.1), a run the server cancels ending as a stop (0.2.1), and the opt-in token-usage line (0.2.0).",
    prompts: [
      ["Time out", "time out"],
      ["Interrupted", "interrupted"],
      ["Crash", "crash"],
      ["Id too long", "too long"],
      ["Refused POST", "refuse"],
      ["Server cancels", "cancel"],
      ["Usage line", "echo hello"],
    ],
  },
  // Tools and approvals
  {
    slug: "drive",
    group: "Tools and approvals",
    title: "Driving the page",
    since: "0.1.0",
    summary:
      "Frontend tools fill a host form with the animated DOM primitives, and a destructive save stops for an inline confirmation.",
    prompts: [["Fill and save", "Create an article titled \"Hello, AG-UI\", slug hello-ag-ui, status published and featured, then save."]],
    skills: true,
  },
  {
    slug: "tool-cards",
    group: "Tools and approvals",
    title: "Tool cards and step groups",
    since: "0.1.0",
    summary:
      "The five tool display modes, the step group a run's calls fold into, a failed tool, a call with nothing to open, and the status parts a host styles.",
    prompts: [
      ["A group of approvals", "import three rows"],
      ["A failing tool", "break something"],
      ["Nothing to open", "ping"],
      ["Sub-agents", "delegate this"],
    ],
  },
  {
    slug: "approvals",
    group: "Tools and approvals",
    title: "Approvals and questions",
    since: "0.1.0",
    summary:
      "Three server-side approvals in one run, each answered on its own and editable before approving, the built-in ask_user question card, and calls a reviewer model or a routine approved with no one asked (0.7.0).",
    prompts: [
      ["Three approvals", "import three rows"],
      ["A question", "ask me something"],
      ["Approved without asking", "approved without asking"],
    ],
  },
  {
    slug: "subagents",
    group: "Tools and approvals",
    title: "Delegated sub-agents",
    since: "0.1.0",
    summary:
      "A delegate_task card grows a live row for the child agent's work; open it for the child's own calls. The second delegation fails.",
    prompts: [["Delegate", "delegate this"]],
  },
  // Server-drawn content
  {
    slug: "charts",
    group: "Server-drawn content",
    title: "Charts",
    since: "0.1.0",
    summary:
      "A chart drawn from a tool call and from an activity, every kind side by side, then follow-up suggestions.",
    prompts: [["Draw charts", "Draw a chart of weekly signups"]],
  },
  {
    slug: "activities",
    group: "Server-drawn content",
    title: "Activity renderers",
    since: "0.3.0",
    summary:
      "A surface redrawn in place that keeps your typing (0.3.0), a run started from its button with chat.run (0.3.0), the activity types an agent framework sends for its own bookkeeping (0.3.0), and a renderer that draws nothing by design (0.3.0).",
    prompts: [
      ["Release form", "release form"],
      ["Built-in activity types", "built-in activity types"],
      ["Nothing to draw", "nothing to draw"],
    ],
  },
  {
    slug: "a2ui",
    group: "Server-drawn content",
    title: "A2UI surfaces",
    since: "0.4.0",
    summary:
      "A form drawn from A2UI 1.0 components by the ./a2ui entry, its action sent back as forwarded props, and a broken surface reported to the host.",
    prompts: [
      ["A2UI form", "a2ui"],
      ["Broken surface", "a2ui broken"],
    ],
  },
  {
    slug: "mcp-apps",
    group: "Server-drawn content",
    title: "MCP Apps",
    since: "0.5.0",
    summary:
      "The ./mcp-apps entry frames a view in a sandbox and answers its bridge: the view initialises, shows its tool input and result, calls a tool and sends a message, each once you allow it in a card under the view.",
    prompts: [
      ["A view with a server", "mcp app"],
      ["A view that calls on load", "mcp app that calls on load"],
      ["A view without one", "mcp app without a server"],
    ],
  },
  // Host seams
  {
    slug: "place",
    group: "Host seams",
    title: "The place chip and page map",
    since: "0.1.0",
    summary:
      "getPlace names where the user is; the chip in the composer draws it and the next run sends it, with the page map, unless the user withholds it.",
    prompts: [["Where am I?", "Where am I?"]],
  },
  {
    slug: "requests",
    group: "Host seams",
    title: "Requests and run context",
    since: "0.3.0",
    summary:
      "chat.request sends the element's headers on a host's own fetch (0.5.0); chat.registerContext adds entries to every run (0.3.0).",
    prompts: [["Show the context", "show context"]],
  },
  {
    slug: "detached-runs",
    group: "Conversation",
    title: "Runs that outlive their connection",
    since: "0.8.0",
    summary:
      "With data-detach-runs and data-threads-url, a thread switch lets go of a run instead of stopping it, opening the thread again joins it, Stop posts the thread's cancel, and a Send the server refuses while the run holds the thread waits for it.",
    prompts: [["Ask for a slow answer", "Tell me something slowly"]],
    attrs: {
      endpoint: "/detached/agent/",
      "data-threads-url": "/detached/threads/",
      "data-detach-runs": "",
    },
  },
  {
    slug: "detached-queued-start",
    group: "Conversation",
    title: "A start a queued mount takes off its request",
    since: "0.9.0",
    summary:
      "A mount with a firing_queue= answers a detached start with 200 {thread_id, run_id} and runs it on a worker; the element follows the run through its log and streams it as it would have streamed the start, with the turn kept in the history.",
    prompts: [["Ask for a slow answer", "Tell me something slowly"]],
    attrs: {
      endpoint: "/detached/queued/agent/",
      "data-threads-url": "/detached/threads/",
      "data-detach-runs": "",
    },
  },
  {
    slug: "child-sessions",
    group: "Conversation",
    title: "Child sessions",
    since: "0.10.0",
    summary:
      "A start_session card links to the child session it started, read from the receipt in its result, so the link survives a reload; a child parked on a person reads needs-you in the parent and is answered only in its own thread; a child thread opens with a breadcrumb back to its parent; the drawer nests children under their parents.",
    prompts: [["Start a child session", "Compare the supplier prices"]],
    attrs: {
      endpoint: "/children/agent/",
      "data-threads-url": "/children/threads/",
      "data-thread-status": "poll",
      "data-threads-search": "always",
      "data-tool-display": "full",
    },
  },
  {
    slug: "tabs",
    group: "Conversation",
    title: "Open threads (tabs)",
    since: "0.10.0",
    summary:
      "chat.tabs, openTab and closeTab keep the open conversations apart from history; the element draws nothing, so the strip here is the host's own, drawn from ag-ui-tabs.",
    prompts: [
      ["Send a turn", "echo hello"],
      ["Send another", "echo a second thread"],
    ],
    inPlace: true,
  },
];

/** The scenario a path names, or null for the start page. */
export function scenarioFor(pathname) {
  const match = /^\/scenarios\/([a-z0-9-]+)\/$/.exec(pathname);
  return match === null ? null : (SCENARIOS.find((s) => s.slug === match[1]) ?? null);
}
