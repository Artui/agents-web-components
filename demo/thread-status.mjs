// The server behind the thread list's run marks: a thread store shaped like
// django-ag-ui 0.84.0's with a run store, under /status/ so the other demo
// servers are left alone.
//
// - GET  /status/threads/            the list, with an ETag; If-None-Match gets
//                                    a 304, Accept: text/event-stream a stream
//                                    that sends the list each time it changes
// - GET  /status/threads/<id>/       one thread's messages
// - POST /status/threads/<id>/read/  records the read, 204 or 404
// - POST /status/agent/              a run; one carrying `resume` runs the
//                                    approved delete and leaves the thread idle
// - POST /status/agent/resume/<id>/  the same, as the inbox answers a parked run
//                                    whose row carries its run_id
//
// One thread runs for twenty seconds after the server starts and then finishes
// away from the page, which is what turns it unread: watch its mark go from
// running to unread, and open it to read it. The waiting one is parked on an
// approval of a delete: open it and the card asks again.
import { createHash } from "node:crypto";

const THREADS = /^\/status\/threads\/(?:([^/]+)\/(read\/)?)?$/;
const AGENT = "/status/agent/";
const RESUME = /^\/status\/agent\/resume\/[^/]+\/$/;
const RUN_MS = 20000;
const started = Date.now();
const at = (offset) => new Date(started + offset).toISOString();

const threads = new Map([
  [
    "status-approve",
    {
      title: "Delete the duplicate invoice",
      status: "waiting",
      updated: -60000,
      read: -60000,
      interrupts: [
        {
          id: "int-call-1",
          reason: "tool_call",
          message: "delete_invoice",
          toolCallId: "call-1",
          metadata: { destructive: true, kind: "approval" },
        },
      ],
    },
  ],
  [
    "status-label",
    {
      title: "Label the March invoices as paid",
      status: "waiting",
      updated: -45000,
      read: -45000,
      runId: "run-label-1",
      interrupts: [
        {
          id: "int-call-2",
          reason: "tool_call",
          message: "label_invoices",
          toolCallId: "call-2",
          metadata: { destructive: false, kind: "approval" },
        },
      ],
    },
  ],
  ["status-failed", { title: "Import the price list", status: "failed", updated: -120000, read: -180000, reason: "error" }],
  ["status-running", { title: "Summarise the board minutes", status: "running", updated: 0, read: -240000 }],
  ["status-unread", { title: "Draft the welcome email", status: "idle", updated: -30000, read: -300000 }],
  ["status-read", { title: "Reconcile the March invoices", status: "idle", updated: -400000, read: -10000 }],
]);

function rows() {
  const running = threads.get("status-running");
  if (running.status === "running" && Date.now() - started > RUN_MS) {
    running.status = "idle";
    running.updated = RUN_MS;
  }
  return [...threads.entries()]
    .sort(([, a], [, b]) => b.updated - a.updated)
    .map(([id, row]) => ({
      thread_id: id,
      title: row.title,
      updated_at: at(row.updated),
      preview: "",
      agent_id: "helper",
      status: row.status,
      last_read_at: row.read === null ? null : at(row.read),
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      ...(row.status === "waiting" ? { interrupts: row.interrupts } : {}),
      ...(row.status === "waiting" && row.runId !== undefined ? { run_id: row.runId } : {}),
    }));
}

/** The list as GET /status/threads/ answers it: its JSON body and its ETag. */
export function listing() {
  const body = JSON.stringify({ threads: rows() });
  return { body, etag: `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"` };
}

function follow(req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  let sent = req.headers["last-event-id"] ?? null;
  const tick = () => {
    const { body, etag } = listing();
    res.write(etag === sent ? ": demo heartbeat\n\n" : `id: ${etag}\ndata: ${body}\n\n`);
    sent = etag;
  };
  tick();
  const timer = setInterval(tick, 1000);
  req.on("close", () => clearInterval(timer));
}

function run(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    const input = JSON.parse(raw);
    const row = threads.get(input.threadId);
    const approved = input.resume?.[0]?.payload?.approved === true;
    const call = row?.interrupts?.[0]?.toolCallId ?? "call-1";
    const text = input.resume === undefined ? "Nothing to do here." : approved ? "Deleted." : "Kept.";
    const events = [
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      ...(input.resume === undefined
        ? []
        : [
            {
              type: "TOOL_CALL_RESULT",
              messageId: "status-result",
              toolCallId: call,
              content: approved ? "deleted invoice-7" : "declined",
              role: "tool",
            },
          ]),
      { type: "TEXT_MESSAGE_START", messageId: "status-answer", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "status-answer", delta: text },
      { type: "TEXT_MESSAGE_END", messageId: "status-answer" },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ];
    if (row !== undefined && input.resume !== undefined) {
      row.status = "idle";
      row.updated = Date.now() - started;
      row.read = row.updated;
      row.answer = [
        { id: "status-result", role: "tool", toolCallId: call, content: events[1].content },
        { id: "status-answer", role: "assistant", content: text },
      ];
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
  });
}

/** Answer a /status/ request; false for any other path. */
export function statusRoute(req, res, path) {
  if (req.method === "POST" && (path === AGENT || RESUME.test(path))) {
    process.stdout.write(`thread-status ${req.method} ${req.url}\n`);
    run(req, res);
    return true;
  }
  const match = THREADS.exec(path);
  if (match === null) {
    return false;
  }
  process.stdout.write(`thread-status ${req.method} ${req.url}\n`);
  const [, id, route] = match;
  const row = id === undefined ? undefined : threads.get(decodeURIComponent(id));
  if (id === undefined) {
    if ((req.headers.accept ?? "").includes("text/event-stream")) {
      follow(req, res);
      return true;
    }
    const { body, etag } = listing();
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag }).end();
    } else {
      res.writeHead(200, { "content-type": "application/json", ETag: etag }).end(body);
    }
  } else if (row === undefined) {
    res.writeHead(404).end();
  } else if (route === "read/" && req.method === "POST") {
    row.read = Date.now() - started;
    res.writeHead(204).end();
  } else {
    const messages = [
      { id: `u-${id}`, role: "user", content: row.title },
      row.status === "waiting"
        ? {
            id: `a-${id}`,
            role: "assistant",
            toolCalls: [
              {
                id: row.interrupts[0].toolCallId,
                type: "function",
                function: { name: row.interrupts[0].message, arguments: '{"target":"invoice-7"}' },
              },
            ],
          }
        : { id: `a-${id}`, role: "assistant", content: `Its last run is ${row.status}.` },
      ...(row.answer === undefined ? [] : row.answer),
    ];
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages }));
  }
  return true;
}
