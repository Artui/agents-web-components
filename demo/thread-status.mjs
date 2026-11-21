// The server behind the thread list's run marks: a thread store shaped like
// django-ag-ui 0.84.0's with a run store, under /status/ so the other demo
// servers are left alone.
//
// - GET  /status/threads/            the list, with an ETag; If-None-Match gets
//                                    a 304, Accept: text/event-stream a stream
//                                    that sends the list each time it changes
// - GET  /status/threads/<id>/       one thread's messages
// - POST /status/threads/<id>/read/  records the read, 204 or 404
//
// One thread runs for twenty seconds after the server starts and then finishes
// away from the page, which is what turns it unread: watch its mark go from
// running to unread, and open it to read it.
import { createHash } from "node:crypto";

const THREADS = /^\/status\/threads\/(?:([^/]+)\/(read\/)?)?$/;
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
    }));
}

function listing() {
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

/** Answer a /status/ request; false for any other path. */
export function statusRoute(req, res, path) {
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
      { id: `a-${id}`, role: "assistant", content: `Its last run is ${row.status}.` },
    ];
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages }));
  }
  return true;
}
