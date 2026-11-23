// The server behind the child-sessions scenario: a thread store shaped like
// django-ag-ui 0.86.0's, whose rows carry `parent`, under /children/ so the
// other demo servers are left alone.
//
// - GET  /children/threads/            the list, with an ETag; If-None-Match a 304
// - GET  /children/threads/<id>/       one thread's messages
// - POST /children/threads/<id>/read/  records the read, 204
// - POST /children/agent/              a run: a prompt starts a child session,
//                                      a resume answers the waiting child
//
// The parent thread's two start_session calls returned receipts; one child is
// parked on an approval and reads "needs you" in the parent. The offsite plan
// is ten days old and its child is from today, which is what keeps the child in
// the parent's date group. The orphan's parent is not listed at all.
import { createHash } from "node:crypto";

const THREADS = /^\/children\/threads\/(?:([^/]+)\/(read\/)?)?$/;
const AGENT = "/children/agent/";
const DAY = 24 * 60 * 60 * 1000;
const started = Date.now();
const at = (offset) => new Date(started + offset).toISOString();

// The tool result django-spec-agents 0.25.0 returns, as pydantic-ai serialises it.
const NOTE =
  "The child session is running in its own thread. This is an acceptance receipt, not a result. Do not claim completion or invent findings. Its report will be delivered after it settles.";
const receipt = (agentId, threadId) =>
  JSON.stringify({ agent_id: agentId, thread_id: threadId, run_id: `run-${threadId}`, note: NOTE });

const start = (callId, agent, prompt) => ({
  id: callId,
  type: "function",
  function: { name: "start_session", arguments: JSON.stringify({ agent, prompt }) },
});

const WAITING = [
  {
    id: "int-child-call",
    reason: "tool_call",
    message: "delete_invoice",
    toolCallId: "child-call",
    metadata: { destructive: true, kind: "approval" },
  },
];

const threads = new Map([
  [
    "children-parent",
    {
      title: "Research the March invoices",
      updated: -60000,
      parent: null,
      status: "idle",
      messages: [
        { id: "p-u1", role: "user", content: "Research the March invoices and the suppliers behind them." },
        {
          id: "p-a1",
          role: "assistant",
          content: "",
          toolCalls: [
            start("p-call-1", "researcher", "Reconcile the March invoices"),
            start("p-call-2", "supplier-check", "Check the suppliers on the March invoices"),
          ],
        },
        { id: "p-r1", role: "tool", toolCallId: "p-call-1", content: receipt("researcher", "children-invoices") },
        { id: "p-r2", role: "tool", toolCallId: "p-call-2", content: receipt("supplier-check", "children-suppliers") },
        { id: "p-a2", role: "assistant", content: "Two child sessions are on it; each has its own thread." },
      ],
    },
  ],
  [
    "children-invoices",
    {
      title: "Reconcile the March invoices",
      updated: -30000,
      parent: "children-parent",
      status: "waiting",
      messages: [
        { id: "i-u1", role: "user", content: "Reconcile the March invoices" },
        {
          id: "i-a1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "child-call",
              type: "function",
              function: { name: "delete_invoice", arguments: '{"target":"invoice-7 (duplicate)"}' },
            },
          ],
        },
      ],
    },
  ],
  [
    "children-suppliers",
    {
      title: "Check the suppliers",
      updated: -45000,
      parent: "children-parent",
      status: "idle",
      messages: [
        { id: "s-u1", role: "user", content: "Check the suppliers on the March invoices" },
        { id: "s-a1", role: "assistant", content: "All four suppliers are registered and in good standing." },
      ],
    },
  ],
  [
    "children-venue",
    {
      title: "Shortlist the venues",
      updated: -20000,
      parent: "children-offsite",
      status: "idle",
      messages: [
        { id: "v-u1", role: "user", content: "Shortlist three venues" },
        { id: "v-a1", role: "assistant", content: "The boathouse, the old mill and the city library." },
      ],
    },
  ],
  [
    "children-offsite",
    {
      title: "Plan the team offsite",
      updated: -10 * DAY,
      parent: null,
      status: "idle",
      messages: [
        { id: "o-u1", role: "user", content: "Plan the team offsite" },
        {
          id: "o-a1",
          role: "assistant",
          content: "",
          toolCalls: [start("o-call-1", "researcher", "Shortlist three venues")],
        },
        { id: "o-r1", role: "tool", toolCallId: "o-call-1", content: receipt("researcher", "children-venue") },
      ],
    },
  ],
  [
    "children-orphan",
    {
      title: "A child whose parent was deleted",
      updated: -90000,
      parent: "children-gone",
      status: "idle",
      messages: [{ id: "x-u1", role: "user", content: "Summarise the archive" }],
    },
  ],
]);

function rows() {
  return [...threads.entries()]
    .sort(([, a], [, b]) => b.updated - a.updated)
    .map(([id, row]) => ({
      thread_id: id,
      title: row.title,
      updated_at: at(row.updated),
      preview: "",
      parent: row.parent === null ? null : { thread_id: row.parent, scope: "assistant" },
      status: row.status,
      last_read_at: at(row.updated),
      ...(row.status === "waiting" ? { interrupts: WAITING } : {}),
    }));
}

function listing() {
  const body = JSON.stringify({ threads: rows() });
  return { body, etag: `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"` };
}

const sse = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

function run(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    const input = JSON.parse(raw);
    const { threadId, runId } = input;
    const events = [{ type: "RUN_STARTED", threadId, runId }];
    if (input.resume !== undefined) {
      // The waiting child's approval, answered in the child's own thread.
      const approved = input.resume[0]?.payload?.approved === true;
      const content = approved ? "deleted invoice-7" : "declined";
      events.push(
        { type: "TOOL_CALL_RESULT", messageId: "child-result", toolCallId: "child-call", content, role: "tool" },
        { type: "TEXT_MESSAGE_START", messageId: "child-answer", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "child-answer", delta: approved ? "Deleted." : "Kept." },
        { type: "TEXT_MESSAGE_END", messageId: "child-answer" },
      );
      const row = threads.get(threadId);
      if (row !== undefined) {
        row.status = "idle";
        row.messages.push(
          { id: "child-result", role: "tool", toolCallId: "child-call", content },
          { id: "child-answer", role: "assistant", content: approved ? "Deleted." : "Kept." },
        );
      }
    } else {
      // A new child session, started live: the receipt is the call's result.
      const child = `children-live-${threads.size}`;
      const call = `live-call-${threads.size}`;
      const now = Date.now() - started;
      // The thread the prompt was sent in is the child's parent, and listed as
      // one, so the drawer nests the child under it and the breadcrumb names it.
      const asked = input.messages.findLast((message) => message.role === "user");
      const parent = threads.get(threadId) ?? {
        title: typeof asked?.content === "string" ? asked.content : "A live parent",
        parent: null,
        status: "idle",
        messages: [],
      };
      threads.set(threadId, {
        ...parent,
        updated: now,
        messages: [
          ...input.messages,
          {
            id: `${call}-a1`,
            role: "assistant",
            content: "",
            toolCalls: [start(call, "researcher", "Compare the supplier prices")],
          },
          { id: `${call}-result`, role: "tool", toolCallId: call, content: receipt("researcher", child) },
          { id: `${call}-answer`, role: "assistant", content: "A child session is comparing the prices." },
        ],
      });
      threads.set(child, {
        title: "Compare the supplier prices",
        updated: now,
        parent: threadId,
        status: "running",
        messages: [{ id: `${child}-u1`, role: "user", content: "Compare the supplier prices" }],
      });
      events.push(
        { type: "TOOL_CALL_START", toolCallId: call, toolCallName: "start_session" },
        {
          type: "TOOL_CALL_ARGS",
          toolCallId: call,
          delta: JSON.stringify({ agent: "researcher", prompt: "Compare the supplier prices" }),
        },
        { type: "TOOL_CALL_END", toolCallId: call },
        { type: "TOOL_CALL_RESULT", messageId: `${call}-result`, toolCallId: call, content: receipt("researcher", child), role: "tool" },
        { type: "TEXT_MESSAGE_START", messageId: `${call}-answer`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `${call}-answer`, delta: "A child session is comparing the prices." },
        { type: "TEXT_MESSAGE_END", messageId: `${call}-answer` },
      );
    }
    events.push({ type: "RUN_FINISHED", threadId, runId });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sse(events));
  });
}

/** Answer a /children/ request; false for any other path. */
export function childSessionsRoute(req, res, path) {
  if (req.method === "POST" && path === AGENT) {
    process.stdout.write(`child-sessions ${req.method} ${req.url}\n`);
    run(req, res);
    return true;
  }
  const match = THREADS.exec(path);
  if (match === null) {
    return false;
  }
  process.stdout.write(`child-sessions ${req.method} ${req.url}\n`);
  const [, id, route] = match;
  const row = id === undefined ? undefined : threads.get(decodeURIComponent(id));
  if (id === undefined) {
    const { body, etag } = listing();
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag }).end();
    } else {
      res.writeHead(200, { "content-type": "application/json", ETag: etag }).end(body);
    }
  } else if (row === undefined) {
    res.writeHead(404).end();
  } else if (route === "read/" && req.method === "POST") {
    res.writeHead(204).end();
  } else if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages: row.messages }));
  } else {
    res.writeHead(204).end();
  }
  return true;
}
