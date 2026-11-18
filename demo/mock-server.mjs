// Self-contained demo server. `make demo` installs, builds the vendored bundles
// the pages load, and runs this; then open http://localhost:5173 for the
// scenario index (app/index.html), one page per feature.
//
// It binds every interface, so the addresses it prints are reachable from other
// devices on the same network — which is the only way to look at the
// small-viewport layout on a real phone, keyboard and all, rather than at a
// resized desktop window pretending to be one. It serves a scripted mock agent
// and the demo pages, and holds nothing but what the page puts in the browser's
// own storage. Set HOST=127.0.0.1 to keep it to this machine.
//
// Speaks just enough of the AG-UI wire protocol for @ag-ui/client's HttpAgent:
// a POST of RunAgentInput is answered with an SSE stream of AG-UI events. The
// scripted agent fills an article form via frontend tools, pausing on the
// destructive "save" for the inline confirmation card.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.PORT ?? 5173);
// The unspecified IPv6 address, which on a dual-stack host also accepts IPv4 --
// so this reaches the local network and `http://[::1]:5173` still answers.
// Plain "0.0.0.0" is IPv4-only and quietly drops the IPv6 loopback, which is
// what `localhost` resolves to first on most machines.
const HOST = process.env.HOST ?? "::";

const HTML = "text/html; charset=utf-8";
// The scenario index is one page: `/` is the start page and `/scenarios/<name>/` a
// scenario, each its own URL and its own stored conversation (see app/app.js).
// The full page is the chat as a route of its own (see page/index.html), which
// is the layout the greeting on an empty conversation is for.
const APP_PAGE = { path: "app/index.html", contentType: HTML };
const SCENARIO_PATH = /^\/scenarios\/[a-z0-9-]+\/$/;
// Static files are served from these directories only, by extension.
const STATIC_DIRS = ["app", "page", "threads"];
const TYPES = new Map([
  [".html", HTML],
  [".js", "text/javascript"],
  [".css", "text/css; charset=utf-8"],
]);
const PAGE_ASSETS = new Map([
  ["/page/", { path: "page/index.html", contentType: HTML }],
  // The thread list in a host's own chrome: pills in a bar, rows in a rail.
  ["/threads/", { path: "threads/index.html", contentType: HTML }],
  // Every page loads it; it does nothing unless the URL carries `?readout`.
  ["/viewport-readout.js", { path: "viewport-readout.js", contentType: "text/javascript" }],
]);
// The vendored bundles the pages import, each under a short name.
const BUNDLES = new Map([
  ["/bundle.js", "agents-web-components.bundle.js"],
  ["/a2ui.bundle.js", "agents-web-components.a2ui.bundle.js"],
  ["/mcp-apps.bundle.js", "agents-web-components.mcp-apps.bundle.js"],
  ["/threads.bundle.js", "agents-web-components.threads.bundle.js"],
]);

/** The page or file a GET path names, or undefined. */
function pageAsset(path) {
  if (path === "/" || path === "/index.html" || SCENARIO_PATH.test(path)) {
    return APP_PAGE;
  }
  const known = PAGE_ASSETS.get(path);
  if (known !== undefined) {
    return known;
  }
  const match = /^\/([a-z]+)\/([a-z0-9-]+(\.[a-z]+))$/.exec(path);
  if (match === null || !STATIC_DIRS.includes(match[1]) || !TYPES.has(match[3])) {
    return undefined;
  }
  return { path: `${match[1]}/${match[2]}`, contentType: TYPES.get(match[3]) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fresh ids per message and per tool call, as a real server issues.
//
// This mattered more than it looks. The scripted answers used to stream under
// fixed ids ("m-done", "tc1"...), and @ag-ui/client keys assistant messages by
// messageId: a TEXT_MESSAGE_START for an id already in the history appends to
// that message rather than starting a new one. So repeating the same prompt
// concatenated every answer onto one entry, which then replayed out of order on
// reload (a single grown message sitting where it was first created, with the
// later prompts after it) and tripped the unfinished-run notice. Three symptoms
// that all read as component bugs, from one line of harness.
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

function emit(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function streamText(res, messageId, chunks) {
  emit(res, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  for (const delta of chunks) {
    emit(res, { type: "TEXT_MESSAGE_CONTENT", messageId, delta });
    await sleep(110);
  }
  emit(res, { type: "TEXT_MESSAGE_END", messageId });
}

function emitToolCall(res, id, name, args, parentMessageId) {
  emit(res, { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name, parentMessageId });
  emit(res, { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) });
  emit(res, { type: "TOOL_CALL_END", toolCallId: id });
}

// A server-side tool's own result, which is how an approved gated call settles:
// nothing runs in the browser, so the card is waiting on this event.
function emitToolResult(res, toolCallId, content) {
  emit(res, { type: "TOOL_CALL_RESULT", toolCallId, messageId: id("m"), content });
}

// A denied gated call's result, as django-ag-ui streams it. The agent answers
// a denial with a tool return carrying the denial's message, and the server
// stamps how the call ended on both carriers: `metadata` for a 1.0 client, the
// top-level key for a 0.x one. Without it the call has no result at all, so the
// next request answers it as not finished and a reload shows that instead of
// the decline the person made.
function emitDeniedResult(res, toolCallId, content) {
  emit(res, {
    type: "TOOL_CALL_RESULT",
    toolCallId,
    messageId: id("m"),
    content,
    outcome: "denied",
    metadata: { outcome: "denied" },
  });
}

// The message the agent's AG-UI adapter denies an answer with: Deny sends
// `cancelled`, and anything else that is not an approval is denied by default.
function denialMessage(answer) {
  if (answer.status === "cancelled") {
    return "Cancelled by user.";
  }
  const reason = answer.payload?.reason;
  return typeof reason === "string" && reason !== "" ? reason : "The tool call was denied.";
}

// Whether an answer approves its call. The adapter denies by default: only a
// `resolved` answer whose payload says `approved: true` runs the tool.
function isApproval(answer) {
  return answer.status === "resolved" && answer.payload?.approved === true;
}

// A reasoning model's streamed chain-of-thought: the web component
// renders it as a collapsible "thinking" region that folds on the first answer.
async function streamReasoning(res, messageId, chunks) {
  emit(res, { type: "REASONING_START", messageId });
  emit(res, { type: "REASONING_MESSAGE_START", messageId, role: "reasoning" });
  let buffer = "";
  for (const delta of chunks) {
    buffer += delta;
    emit(res, { type: "REASONING_MESSAGE_CONTENT", messageId, delta });
    await sleep(90);
  }
  emit(res, { type: "REASONING_MESSAGE_END", messageId });
  emit(res, { type: "REASONING_END", messageId });
}

/** The most recent user turn, which is what the scripted agent dispatches on. */
function lastUserText(messages) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return typeof last?.content === "string" ? last.content.trim() : "";
}

/** Action run ids refused once, so the Retry that sends the same run id goes through. */
const REFUSED_ACTIONS = new Set();

/** Prompts that end the run in RUN_ERROR, and the code each sends. */
const RUN_ERROR_PROMPTS = [
  [/\btime ?out\b/i, "timed_out"],
  [/\binterrupted\b/i, "interrupted"],
  [/\btoo long\b/i, "identifier_too_long"],
  [/\bcrash\b/i, "error"],
];

/**
 * The scripted agent.
 *
 * Dispatches on the latest user turn so each scenario can exercise its
 * surface on its own, rather than replaying one canned script for everything.
 */
async function handleAgent(res, body) {
  const input = JSON.parse(body);
  const { threadId, runId, messages } = input;
  const prompt = lastUserText(messages);

  // A run POST the server refuses before streaming, as a 400 with a JSON body.
  if (/\brefuse\b/i.test(prompt)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "thread_id is longer than the 255 characters allowed" }));
    return;
  }

  // A release named "refuse" is refused before streaming the first time its run id is seen, as
  // django-ag-ui refuses one; Retry sends the same run id, and that request goes through.
  if (input.forwardedProps?.name === "refuse" && !REFUSED_ACTIONS.has(runId)) {
    REFUSED_ACTIONS.add(runId);
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Refused once; Retry sends the same action again." }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  emit(res, { type: "RUN_STARTED", threadId, runId });

  // A run the server cancels: RUN_FINISHED with a cancelled outcome, as
  // an agent's adapter sends when the agent cancels its own run or a deadline
  // passes. The chat ends it as a stop, so the call it streamed never settles.
  if (/\bcancel\b/i.test(prompt)) {
    const parent = id("msg");
    await streamText(res, parent, ["Looking that up… "]);
    emitToolCall(res, id("call"), "lookup_docs", { query: "deadline" }, parent);
    await sleep(900);
    emit(res, { type: "RUN_FINISHED", threadId, runId, outcome: { type: "cancelled" } });
    res.end();
    return;
  }

  // Two activities: one a host renderer answers with an empty fragment (nothing
  // to draw, by design), one nobody registered, which unhandledActivityTypes names.
  if (/\bnothing to draw\b/i.test(prompt)) {
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "host_marker", content: { at: "nothing-to-draw" } });
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "mystery_widget", content: { shape: "unknown" } });
    await streamText(res, id("msg"), ["Two activities arrived before this line, and neither drew anything."]);
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }

  // An MCP App view, in the mcp-apps activity shape. With a server id the
  // ./mcp-apps entry frames it from /mcp-apps/; without one it is the notice.
  if (/\bmcp app\b/i.test(prompt)) {
    const named = !/\bwithout\b/i.test(prompt);
    const content = {
      resourceUri: "ui://sales/week.html",
      toolInput: { week: "current" },
      result: { content: [{ type: "text", text: "12 orders this week" }] },
      ...(named ? { serverId: "sales", serverHash: "sales" } : {}),
    };
    await streamText(res, id("msg"), [named ? "The sales app's weekly view:" : "A view from a toolset with no id:"]);
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "mcp-apps", content });
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }

  // A RUN_ERROR with each code django-ag-ui sends; the bubble words each one.
  const code = RUN_ERROR_PROMPTS.find(([pattern]) => pattern.test(prompt))?.[1];
  if (code !== undefined) {
    await streamText(res, id("msg"), ["Working on it…"]);
    const message =
      code === "identifier_too_long"
        ? "thread_id is 300 characters long; at most 255 are allowed."
        : "The run failed. The failure has been recorded.";
    emit(res, { type: "RUN_ERROR", message, code });
    res.end();
    return;
  }

  // A surface the page redraws in place, and the run its button starts. The
  // second snapshot reuses the message id after a pause long enough to type.
  if (input.forwardedProps?.action === "submit_release") {
    await streamText(res, id("msg"), [`Release "${input.forwardedProps.name}" noted. `, "No user message came with it: the props carried it."]);
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }
  // An A2UI surface in the shape django-ag-ui's render_a2ui sends, for the
  // catalog registerA2ui posts; its button's action comes back as props.
  const a2uiAction = input.forwardedProps?.a2uiAction?.userAction;
  if (a2uiAction !== undefined) {
    const { name, context } = a2uiAction;
    await streamText(res, id("msg"), [`Action "${name}" arrived with `, `${JSON.stringify(context)}.`]);
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }
  // A surface that breaks the protocol: the renderer reports it to the host's
  // onError, draws a notice, and starts no run.
  if (/\ba2ui\b/i.test(prompt) && /\bbroken\b/i.test(prompt)) {
    await streamText(res, id("msg"), ["This surface speaks the wrong protocol version."]);
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("a2ui-surface"),
      activityType: "a2ui-surface",
      replace: true,
      content: { a2ui_operations: [{ version: "0.9", createSurface: { surfaceId: id("broken"), catalogId: "x" } }] },
    });
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }
  if (/\ba2ui\b/i.test(prompt)) {
    await streamText(res, id("msg"), ["Here is a small A2UI form."]);
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("a2ui-surface"),
      activityType: "a2ui-surface",
      replace: true,
      content: { a2ui_operations: a2uiSurface(input.context) },
    });
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }
  if (/\brelease form\b/i.test(prompt)) {
    const surface = id("m");
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: surface, activityType: "release_form", content: { step: "Step 1 of 2: name the release" } });
    await streamText(res, id("msg"), ["Type a name; the form is redrawn in five seconds."]);
    await sleep(5000);
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: surface, activityType: "release_form", replace: true, content: { step: "Step 2 of 2: submit it" } });
    emit(res, { type: "RUN_FINISHED", threadId, runId });
    res.end();
    return;
  }

  // Answers to a previous round's approval interrupts. Every answered call gets
  // a result, as it does from django-ag-ui: an approved one its tool's return,
  // a denied one the denial, marked as such.
  const resume = Array.isArray(input.resume) ? input.resume : [];
  // The *last* message, not any message: a thread that has ever run a tool
  // keeps those results in history forever, so `some()` made every later turn
  // look like a tool follow-up and answer "Done" to everything.
  const isFollowUp = messages.at(-1)?.role === "tool";

  if (resume.length > 0) {
    const approved = resume.filter(isApproval);
    for (const answer of resume) {
      const toolCallId = answer.interruptId.replace("int-", "");
      if (!isApproval(answer)) {
        emitDeniedResult(res, toolCallId, denialMessage(answer));
        continue;
      }
      // Echo what was actually approved. A server that accepts `editedArgs`
      // has to run the edited call rather than the one it proposed, and
      // reflecting it here is what makes that visible in the demo.
      const edited = answer.payload?.editedArgs;
      emitToolResult(
        res,
        toolCallId,
        JSON.stringify(edited === undefined ? { created: true } : { created: true, as: edited }),
      );
    }
    await streamText(res, id("msg"), [
      `Added ${approved.length} of ${resume.length}`,
      approved.length === resume.length ? " — all of them." : ", and left the rest alone.",
    ]);
  } else if (/\bwhere am i\b/i.test(prompt)) {
    // The place chip's other half: quote the place entry this round carried,
    // so the chip and what the agent was told can be compared side by side.
    // Withholding the place drops the page map too, which the answer says.
    const context = Array.isArray(input.context) ? input.context : [];
    const entry = context.find((item) => item.description === "place");
    const page = context.some((item) => item.description === "page_map");
    const place = entry === undefined ? null : JSON.parse(entry.value);
    const where =
      place === null
        ? "I was not told where you are"
        : `You are on **${place.label}**${place.detail ? ` (${place.detail})` : ""}` +
          (place.href ? `, at \`${place.href}\`` : "");
    await streamText(res, id("msg"), [
      `${where}. `,
      page ? "I was given the page map too." : "I was not given the page map.",
    ]);
  } else if (/\bshow context\b/i.test(prompt)) {
    // What this round's context carried, by description, so an entry a host
    // added with registerContext can be seen arriving.
    const context = Array.isArray(input.context) ? input.context : [];
    const clip = (text) => (text.length > 48 ? `${text.slice(0, 48)}…` : text);
    const lines = context.map((item) => `- **${clip(item.description)}**: \`${clip(String(item.value))}\``);
    await streamText(res, id("msg"), [
      `This run carried ${context.length} context entries:\n\n`,
      lines.length === 0 ? "(none)" : lines.join("\n"),
    ]);
  } else if (/\breason\b/i.test(prompt)) {
    // Reasoning first, then an answer in markdown: the thinking region folds
    // when the answer starts, and the answer shows what the renderer draws.
    await streamReasoning(res, id("reasoning"), [
      "A short answer would do, ",
      "but a heading, a list and some code ",
      "show more of the renderer.",
    ]);
    await streamText(res, id("msg"), [
      "### Release checklist\n\n",
      "1. Bump the version in `src/version.ts`\n",
      "2. Fill the **CHANGELOG** section\n",
      "3. Open the PR\n\n",
      "> Merging to main publishes it.\n\n",
      "```bash\nmake release-bump VERSION=0.6.0\n```\n",
    ]);
  } else if (/\becho\b/i.test(prompt)) {
    // A plain answer and nothing else, which is the shape most turns have and
    // the one every other branch here dresses up. Sending, the queue behind a
    // run, ArrowUp recall and Retry are about turns rather than tools, and
    // looking at them through the article script put a confirmation card in
    // the way of every run. The pause keeps the run in flight for over a
    // second, long enough to type and queue a second turn behind it.
    //
    // "note" adds an activity of that type ahead of the answer, which no
    // renderer here draws: a page that registers one for it can look at what
    // a host's renderer does while the element replays a conversation.
    await sleep(1200);
    if (/\bnote\b/i.test(prompt)) {
      emit(res, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: id("note"),
        activityType: "note",
        content: { text: prompt },
      });
    }
    await streamText(res, id("msg"), ["You said: ", ...prompt.split(/\s+/).map((w) => `${w} `)]);
  } else if (/\bimport\b/i.test(prompt)) {
    // Three gated calls in one run: the case a single approval never shows. Each
    // interrupt is answered independently, and every prompt is the same sentence
    // because a confirmation is written per *tool*, so the card has to say which
    // call it belongs to some other way.
    const parent = id("msg");
    await streamText(res, parent, ["Three rows — ", "each needs your approval."]);
    const rows = [
      { title: "Design sync", day: "2026-08-14", start_hour: 14 },
      { title: "Retro", day: "2026-08-15", start_hour: 10 },
      { title: "One-on-one", day: "2026-08-15", start_hour: 16 },
    ];
    const interrupts = rows.map((row) => {
      const callId = id("call");
      emitToolCall(res, callId, "create_event", row, parent);
      return {
        id: `int-${callId}`,
        reason: "tool_call",
        toolCallId: callId,
        message: `Approve create_event(${JSON.stringify(row)})?`,
        metadata: { "x-confirm": "Add this event to the board?" },
      };
    });
    emit(res, {
      type: "RUN_FINISHED",
      threadId,
      runId,
      outcome: { type: "interrupt", interrupts },
    });
    res.end();
    return;
  } else if (/\bdelegate\b/i.test(prompt) || /\bsub-?agent\b/i.test(prompt)) {
    // Two delegations, narrated. The point of the scenario is the wait: each
    // sleep below is time a `delegate_task` card used to spend at "running…"
    // with nothing on screen, which is the stall the nested row exists to end.
    //
    // The shape follows the fixture the tests replay, which means **two
    // carriers**: the delegation's own lifetime rides the protocol's
    // SUBAGENT_STARTED / _FINISHED / _ERROR, and each tool call the child makes
    // rides a CUSTOM `ag_ui.subagent` event keyed on the parent's call id.
    //
    // The lifecycle is where the protocol's own client is strict, so this
    // scenario has to be too, or it streams something a browser rejects rather
    // than something a server writes: exactly one open and one close per
    // delegation, no reused subagentRunId, and no RUN_FINISHED while either is
    // still open. The failure carries no exception text on the lifecycle event
    // -- only on the tool result underneath it.
    //
    // `subagentRunId` is derived from the delegation's call id the way the
    // server derives it, rather than minted here, so the id on screen is
    // traceable to the card it belongs to.
    const parent = id("msg");
    await streamText(res, parent, ["Handing this to two sub-agents."]);

    const progress = (value) => emit(res, { type: "CUSTOM", name: "ag_ui.subagent", value });
    const opened = (call, name) =>
      emit(res, {
        type: "SUBAGENT_STARTED",
        subagentRunId: `subagent-${call}`,
        name,
        parentToolCallId: call,
      });
    // Optional fields are omitted rather than sent as null: the protocol's own
    // client refuses an explicit null on every one of them.
    const closed = (call) =>
      emit(res, { type: "SUBAGENT_FINISHED", subagentRunId: `subagent-${call}` });
    const errored = (call, message) =>
      emit(res, { type: "SUBAGENT_ERROR", subagentRunId: `subagent-${call}`, message });

    const first = id("call");
    emitToolCall(res, first, "delegate_task", {
      agent_name: "researcher",
      task: "Find settlement passages.",
    });
    opened(first, "researcher");
    for (const [step, outcome] of [
      ["sub-1", true],
      ["sub-2", false],
      ["sub-3", true],
    ]) {
      await sleep(700);
      progress({
        delegationId: first,
        agent: "researcher",
        phase: "tool_call",
        status: "researcher: calling lookup_docs",
        tool: { toolCallId: step, name: "lookup_docs", ok: null },
      });
      await sleep(900);
      progress({
        delegationId: first,
        agent: "researcher",
        phase: "tool_result",
        status: `researcher: lookup_docs ${outcome ? "returned" : "failed"}`,
        tool: { toolCallId: step, name: "lookup_docs", ok: outcome },
      });
    }
    await sleep(600);
    closed(first);
    emitToolResult(res, first, "Three passages mention settlement.");

    const second = id("call");
    emitToolCall(res, second, "delegate_task", {
      agent_name: "auditor",
      task: "Check them against the ledger.",
    });
    opened(second, "auditor");
    await sleep(900);
    errored(second, "auditor failed");
    emitToolResult(
      res,
      second,
      "Sub-agent 'auditor' failed: the auditor model went away",
    );

    await streamText(res, id("msg"), [
      "The handbook mentions settlement three times; ",
      "the ledger check did not run.",
    ]);
  } else if (/\bchart\b/i.test(prompt) && !isFollowUp) {
    // Both routes and every kind, driven from one prompt so they can be
    // compared on the page rather than in the abstract.
    const parent = id("msg");
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const series = [
      { label: "new", points: [12, 19, 9, 24, 17] },
      { label: "returning", points: [5, 7, 11, 6, 14] },
    ];

    await streamText(res, parent, ["The agent asks the page to draw it:"]);
    const callId = id("call");
    emitToolCall(res, callId, "render_chart", { kind: "bar", title: "Weekly signups", labels, series }, parent);
    await sleep(500);
    emitToolResult(res, callId, "chart rendered");

    await streamText(res, id("msg"), ["And the server pushes one, then revises it live:"]);
    // A stable message id, so the second and third sends *replace* the chart
    // rather than stacking three copies -- the capability the tool route has no
    // way to express, since a tool call returns once.
    const live = id("m");
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: live,
      activityType: "chart",
      content: { kind: "line", title: "Signups (live)", labels, series },
    });
    for (const kind of ["scatter", "stacked"]) {
      await sleep(900);
      emit(res, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: live,
        activityType: "chart",
        replace: true,
        content: { kind, title: `Signups (live, ${kind})`, labels, series },
      });
    }
    await sleep(700);
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("m"),
      activityType: "chart",
      content: { kind: "pie", title: "Share by day", labels, series: [series[0]] },
    });
    await streamText(res, id("msg"), [
      "The line, scatter and stacked views are one chart redrawn in place. ",
      "I can only discuss the first — the pushed ones never reached me.",
    ]);
  } else if (isFollowUp && /\bfail|error|break\b/i.test(prompt)) {
    await streamText(res, id("msg"), ["It failed, so I stopped there."]);
  } else if (isFollowUp) {
    await streamText(res, id("msg"), ["Done — ", "the article ", "is filled in ", "and saved. ✅"]);
    // Follow-up chips, pushed after the work rather than configured up front --
    // which is the whole difference from the static skill chips above the
    // composer. Clicking one sends it as the user's next message.
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("suggestions"),
      activityType: "suggestions",
      replace: true,
      content: {
        prompts: [
          "Publish it now",
          "Change the slug",
          "Show me what changed",
        ],
      },
    });
  } else if (prompt.startsWith("/")) {
    // A server-resolved skill: the client sent only the token, so this is the
    // first point at which the prompt behind it exists at all. Answering here
    // is what demonstrates that the wording never left the server.
    await streamText(res, id("msg"), [
      `Resolved **${prompt}** server-side. `,
      "The browser only ever sent the token — ",
      "the prompt behind it lives here.",
    ]);
  } else if (/\bbuilt-in activit/i.test(prompt)) {
    // The bookkeeping activity types the element draws without a renderer, in
    // the shapes they arrive in on the wire. Four are records for the model and draw nothing; the
    // enqueued message is a user bubble inside this answer, captioned; the MCP
    // App is a notice naming its view. None of them lands in
    // unhandledActivityTypes, which the page logs after the run.
    const parent = id("msg");
    const callId = id("call");
    emitToolCall(res, callId, "show_sales_app", { week: "current" }, parent);
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "pydantic_ai_capability_load_delta", content: { loaded: ["sales_reports"], tool_call_id: null } });
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "pydantic_ai_tool_availability_delta", content: { added: ["compare_weeks"], tool_call_id: null } });
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "pydantic_ai_model_settings_delta", content: { settings: { thinking: "high" }, top_level: false } });
    await sleep(500);
    emitToolResult(res, callId, "12 orders this week");
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("m"),
      activityType: "mcp-apps",
      content: { resourceUri: "ui://sales/week.html", toolInput: { week: "current" }, result: { content: [{ type: "text", text: "12 orders this week" }] }, serverId: "sales", serverHash: "sales" },
    });
    await sleep(500);
    emit(res, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: id("m"),
      activityType: "pydantic_ai_enqueued_messages",
      content: { messages: [{ id: id("u"), role: "user", content: "Compare with <b>last</b> week, and keep it short" }] },
    });
    emit(res, { type: "ACTIVITY_SNAPSHOT", messageId: id("m"), activityType: "pydantic_ai_compaction", content: { content: "Earlier turns, summarised." } });
    await streamText(res, id("msg"), ["Twelve orders this week, ", "the same as last week."]);
  } else if (/\bask\b/i.test(prompt)) {
    // Drives the built-in ask_user frontend tool, so the question card is
    // reachable without a real agent.
    const parent = id("msg");
    await streamText(res, parent, ["Before I continue —"]);
    emitToolCall(
      res,
      id("call"),
      "ask_user",
      {
        question: "Which status should the article go out with?",
        options: ["draft", "published"],
        allowCustom: true,
      },
      parent,
    );
  } else if (/\bfail|error|break\b/i.test(prompt)) {
    // A tool that throws, so the card's error region is reachable.
    const parent = id("msg");
    await streamText(res, parent, ["Trying the flaky one…"]);
    emitToolCall(res, id("call"), "break_something", {}, parent);
  } else if (/\bthink silently\b/i.test(prompt)) {
    // Reasoning that carries no text, the way a provider sends redacted
    // thinking or reasoning with its summaries off: a start and an end and
    // nothing between. The block settles to a plain timed label, not a toggle
    // over an empty box. Long enough to be timed rather than read as a blink.
    const reasoning = id("reasoning");
    emit(res, { type: "REASONING_START", messageId: reasoning });
    await sleep(2300);
    emit(res, { type: "REASONING_END", messageId: reasoning });
    await streamText(res, id("msg"), ["Thought it over ", "without a word."]);
  } else if (/\bping\b/i.test(prompt)) {
    // One server-side call with no arguments that returns nothing: the card or
    // the step row is a plain status line, with nothing to open.
    const parent = id("msg");
    const call = id("call");
    emitToolCall(res, call, "ping", {}, parent);
    await sleep(600);
    emitToolResult(res, call, "");
    await streamText(res, id("msg"), ["Pinged."]);
  } else if (!/\b(article|form|fill|save|summari[sz]e)/i.test(prompt)) {
    // Anything else gets the list of what this scripted agent answers, rather
    // than the article run, whose tools drive a form only one scenario shows.
    await streamText(res, id("msg"), [
      "I am the demo's scripted agent, so I answer a few phrases. ",
      "Each scenario's **Try** buttons send them; the full list is on the demo's start page.",
    ]);
  } else {
    await streamReasoning(res, id("reasoning"), [
      "The user wants the article filled. ",
      "I'll set the title and slug, ",
      "publish it, mark it featured, ",
      "then save.",
    ]);
    const parent = id("msg");
    await streamText(res, parent, ["On it — ", "filling in ", "the article form ", "now."]);
    emitToolCall(res, id("call"), "fill_field", { field: "title", value: "Hello, AG-UI" }, parent);
    emitToolCall(res, id("call"), "fill_field", { field: "slug", value: "hello-ag-ui" }, parent);
    emitToolCall(res, id("call"), "select_option", { field: "status", value: "published" }, parent);
    emitToolCall(res, id("call"), "toggle_checkbox", { field: "featured", value: true }, parent);
    emitToolCall(res, id("call"), "click_save", {}, parent);
  }

  // Usage as django-ag-ui's include_usage sends it; drawn under show-usage.
  emit(res, {
    type: "RUN_FINISHED",
    threadId,
    runId,
    usage: [{ provider: "demo", model: "mock", inputTokens: 1234, outputTokens: 567 }],
  });
  res.end();
}

/** The operations of the demo's A2UI surface, under the catalog id the page posted. */
function a2uiSurface(context) {
  const posted = (context ?? []).find((entry) => entry.description.startsWith("A2UI Component Schema"));
  const catalogId = posted === undefined ? "unknown" : JSON.parse(posted.value).catalogId;
  const surfaceId = id("release");
  const components = [
    { id: "root", component: "Card", child: "body" },
    { id: "body", component: "Column", children: ["title", "name", "channel", "notify", "send"] },
    { id: "title", component: "Text", text: "Name the release", variant: "body" },
    {
      id: "name",
      component: "TextField",
      label: "Release name",
      value: { "@path": "/release/name" },
      "@checks": [
        {
          condition: { "@call": "required", args: { value: { "@path": "/release/name" } } },
          message: "A release needs a name.",
        },
      ],
    },
    {
      id: "channel",
      component: "ChoicePicker",
      label: "Channel",
      options: [
        { label: "Stable", value: "stable" },
        { label: "Beta", value: "beta" },
      ],
      value: { "@path": "/release/channel" },
    },
    { id: "notify", component: "CheckBox", label: "Notify subscribers", value: { "@path": "/release/notify" } },
    { id: "send-label", component: "Text", text: "Submit" },
    {
      id: "send",
      component: "Button",
      child: "send-label",
      variant: "primary",
      action: {
        event: {
          name: "submit_release",
          userMessage: {
            "@call": "formatString",
            args: { value: "Submit release ${/release/name}" },
          },
          context: { release: { "@path": "/release" } },
        },
      },
    },
  ];
  return [
    { version: "1.0", createSurface: { surfaceId, catalogId } },
    { version: "1.0", updateComponents: { surfaceId, components } },
    {
      version: "1.0",
      updateDataModel: { surfaceId, path: "/", value: { release: { name: "", channel: ["stable"], notify: true } } },
    },
  ];
}

// The sales app's view, as an MCP server would serve it: a page that speaks the
// view's end of the MCP Apps bridge by hand, so the demo shows what the host's
// end answers. It themes itself from the host context's style variables.
const MCP_APP_VIEW = `<!doctype html>
<html><head><style>
  body { margin: 0; font: 14px var(--font-sans, system-ui); color: var(--color-text-primary, #222);
    background: var(--color-background-primary, #fff); }
  #root { padding: 12px 14px; display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 15px; }
  .muted { color: var(--color-text-secondary, #666); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; padding: 6px 10px; border-radius: var(--border-radius-md, 8px);
    border: 1px solid var(--color-border-primary, #ccc); background: var(--color-background-secondary, #f4f4f4);
    color: inherit; cursor: pointer; }
  pre { margin: 0; white-space: pre-wrap; font-size: 12px; }
</style></head>
<body><div id="root">
  <h3>Weekly sales</h3>
  <div id="status" class="muted">Waiting for ui/initialize...</div>
  <div>Input: <code id="input">-</code></div>
  <div>Result: <strong id="result">-</strong></div>
  <div class="row">
    <button id="refresh">Refresh (tools/call)</button>
    <button id="ask">Ask the agent (ui/message)</button>
  </div>
  <pre id="log" class="muted"></pre>
</div>
<script>
  let next = 1;
  const waiting = new Map();
  const $ = (id) => document.getElementById(id);
  const post = (message) => parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      post({ id, method, params });
    });
  const text = (result) => (result.content || []).map((block) => block.text).join(" ");
  const size = () =>
    post({ method: "ui/notifications/size-changed",
      params: { width: $("root").scrollWidth, height: $("root").scrollHeight } });
  const theme = (context) => {
    for (const [name, value] of Object.entries((context.styles || {}).variables || {})) {
      document.documentElement.style.setProperty(name, value);
    }
    if (context.theme) document.documentElement.style.colorScheme = context.theme;
  };
  addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.jsonrpc !== "2.0") return;
    if (data.method === undefined) {
      const entry = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) entry?.reject(data.error); else entry?.resolve(data.result);
      return;
    }
    if (data.method === "ui/notifications/tool-input") $("input").textContent = JSON.stringify(data.params.arguments);
    if (data.method === "ui/notifications/tool-result") $("result").textContent = text(data.params);
    if (data.method === "ui/notifications/host-context-changed") theme(data.params);
    if (data.method === "ui/resource-teardown") post({ id: data.id, result: {} });
    size();
  });
  $("refresh").addEventListener("click", async () => {
    try {
      const result = await call("tools/call", { name: "weekly_sales", arguments: { week: "current" } });
      $("result").textContent = text(result);
      $("log").textContent = "tools/call answered at " + new Date().toLocaleTimeString();
    } catch (error) {
      $("log").textContent = "tools/call refused: " + error.message;
    }
    size();
  });
  $("ask").addEventListener("click", async () => {
    try {
      const result = await call("ui/message",
        { role: "user", content: [{ type: "text", text: "What sold best this week?" }] });
      $("log").textContent = result.isError ? "ui/message was not sent" : "ui/message sent";
    } catch (error) {
      $("log").textContent = "ui/message refused: " + error.message;
    }
    size();
  });
  call("ui/initialize", { appInfo: { name: "sales", version: "1.0.0" }, appCapabilities: {},
    protocolVersion: "2026-01-26" }).then((result) => {
      theme(result.hostContext);
      $("status").textContent = "Initialised by " + result.hostInfo.name + " " + result.hostInfo.version +
        " (" + result.hostContext.theme + ", " + result.hostContext.locale + ")";
      post({ method: "ui/notifications/initialized", params: {} });
      size();
    });
</script></body></html>`;

let salesCalls = 0;

// The host's mcp-apps/ route: the view's resource, and the tool it calls.
function handleMcpApps(res, body) {
  const { method, params } = JSON.parse(body || "{}");
  const json = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  if (method === "resources/read") {
    json(200, { contents: [{ uri: params?.uri, mimeType: "text/html;profile=mcp-app", text: MCP_APP_VIEW }] });
    return;
  }
  if (method === "tools/call") {
    salesCalls += 1;
    json(200, { content: [{ type: "text", text: `${12 + salesCalls} orders this week (refreshed ${salesCalls}x)` }] });
    return;
  }
  json(404, { error: `no ${method} here` });
}

async function serveFile(res, path, contentType) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

// Fixed ids so a row's short id is stable across reloads while you look at it;
// timestamps are relative to boot so the labels stay honest.
const BOOTED = Date.now();
const RUNS = [
  {
    run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    preview: "Fill in the article form and publish it",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 22 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "5087f329-a842-473f-b16b-881f7c91668d",
    preview: "Import these three events onto the board",
    thread_id: "t-demo",
    parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    started_at: new Date(BOOTED - 4_000).toISOString(),
    continuable: true,
  },
  // Two runs that opened on the same sentence, which is what a real index
  // produces once a board has been asked about twice. The words no longer tell
  // these two apart, so they carry the short id and the rows above still do not.
  {
    run_id: "a7c31d90-58b4-42ee-9f0c-6d2a1b3e77c5",
    preview: "What is on the board?",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 13 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "e02f4a17-9c65-4b38-8ad1-70f9c5e2b4aa",
    preview: "What is on the board?",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 14 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  // No preview at all: an index older than the field, or a run opened with an
  // image and no caption. Falls back to the time plus the id, as every row was.
  {
    run_id: "b46d8e52-0f19-4c77-83b2-1d5ae9f30c68",
    preview: null,
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 3 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "c14b8a02-7d1e-4f77-9a30-2b6e5f0c8d41",
    preview: "Move standup to Friday at 11:00",
    thread_id: "t-demo",
    parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    started_at: new Date(BOOTED - 2_000).toISOString(),
    // No snapshot to seed from, so the panel must not offer it: the client
    // filters on this field, and a row without it would resume from nothing.
    continuable: false,
  },
];

async function streamContinuation(res, verb, runId) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const threadId = "t-demo";
  const runIdOut = id("run");
  emit(res, { type: "RUN_STARTED", threadId, runId: runIdOut });
  await streamText(res, id("m"), [
    verb === "fork" ? "Forked " : "Continued ",
    `from run ${runId.slice(0, 8)}`,
    ", seeded from its snapshot.",
  ]);
  emit(res, { type: "RUN_FINISHED", threadId, runId: runIdOut });
  res.end();
}

const server = createServer((req, res) => {
  // The pages are matched on their path alone, so `/page/?readout` is the same
  // page as `/page/`. The API routes below still match the whole URL.
  const path = req.url.split("?")[0];
  if (req.method === "POST" && req.url === "/viewport-readout/") {
    // What viewport-readout.js measured on a device, one line per settled
    // reading, so the numbers can be read off this process's output instead of
    // transcribed from a phone screenshot.
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      process.stdout.write(`viewport-readout ${body}\n`);
      res.writeHead(204);
      res.end();
    });
    return;
  }
  if (req.method === "POST" && req.url === "/agent/") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      handleAgent(res, body).catch((error) => {
        res.writeHead(500);
        res.end(String(error));
      });
    });
    return;
  }
  if (req.method === "POST" && req.url === "/mcp-apps/") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => handleMcpApps(res, body));
    return;
  }
  if (req.method === "POST" && req.url === "/attachments/") {
    // Uploads: a real backend would store the file and hand back a durable
    // ref; the demo buffers the body and echoes one, so the composer's
    // paperclip and the pending-attachment tray are both reachable.
    //
    // The ref has to carry name and mime as well as id and size: the client
    // rejects a body missing any of the four, and while this handler answered
    // with only id/size every demo upload settled into an error chip. Both live
    // in the multipart part headers, so read them from there rather than
    // inventing them.
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = body.subarray(0, 1024).toString("latin1");
      const name = /filename="([^"]*)"/.exec(headers)?.[1] || "upload.bin";
      const mime = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: id("file"),
          url: `/uploads/${id("f")}`,
          name,
          mime,
          size: body.length,
        }),
      );
    });
    return;
  }
  if (req.method === "POST" && req.url === "/transcribe/") {
    // Voice input: a real backend would run STT on the posted clip;
    // the demo just drains the body and returns a canned transcript.
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "Draft an article about sea otters." }));
    });
    return;
  }
  if (req.method === "GET" && req.url === "/runs/") {
    // The run index behind the header's checkpoint control. Without this route
    // the button is not built at all — the element only offers it when a host
    // sets `data-runs-url` — so the panel had no way to be looked at.
    //
    // Every row shape on purpose: a root run, a branch off it seconds later, a
    // pair that opened on the same sentence, a run the server sent no preview
    // for, and one it reports as having no snapshot. Between them they cover
    // each identity the row can lead with, and each case where it needs a
    // second one.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ runs: RUNS }));
    return;
  }
  const continuation = /^\/(resume|fork)\/([^/]+)\/$/.exec(req.url ?? "");
  if (req.method === "POST" && continuation) {
    // A real server seeds the new run from the picked run's snapshot and streams
    // the continuation. The demo answers in one sentence naming what it did, so
    // that picking a row visibly lands in the transcript.
    const [, verb, runId] = continuation;
    req.on("data", () => {});
    req.on("end", () => {
      streamContinuation(res, verb, runId).catch((error) => {
        res.writeHead(500);
        res.end(String(error));
      });
    });
    return;
  }
  // What chat.request sent, so the scenario can show the element's headers
  // arriving on a request the host made.
  if (req.method === "GET" && path === "/whoami/") {
    const sent = Object.fromEntries(
      Object.entries(req.headers).filter(([name]) => name.startsWith("x-") || name === "cookie"),
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ headers: sent }));
    return;
  }
  const bundle = req.method === "GET" && BUNDLES.get(path);
  if (bundle) {
    serveFile(res, join(ROOT, "dist", bundle), "text/javascript");
    return;
  }
  const asset = req.method === "GET" && pageAsset(path);
  if (asset) {
    serveFile(res, join(HERE, asset.path), asset.contentType);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

/**
 * The addresses this machine can be reached on, for typing into a phone.
 *
 * IPv4 and non-internal only: a link-local IPv6 address carries a zone index
 * that no phone browser will accept, and the loopback entry is the one already
 * printed above it.
 */
function networkUrls() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic && nic.family === "IPv4" && !nic.internal)
    .map((nic) => `http://${nic.address}:${PORT}`);
}

server.listen(PORT, HOST, () => {
  process.stdout.write(`agents-web-components demo: http://localhost:${PORT}\n`);
  process.stdout.write(`  full page: http://localhost:${PORT}/page/\n`);
  process.stdout.write(`  thread list: http://localhost:${PORT}/threads/\n`);
  // Any wildcard bind reaches the LAN, so the addresses are worth printing for
  // both spellings rather than only the one this file happens to default to.
  if (HOST === "::" || HOST === "0.0.0.0") {
    for (const url of networkUrls()) {
      process.stdout.write(`  on this network: ${url}\n`);
    }
  }
});
