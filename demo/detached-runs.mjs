// The server behind the "Runs that outlive their connection" scenario: a run
// endpoint, a thread store and the two routes django-ag-ui 0.82.0+ serves
// beside each thread for a run that outlives its connection, all under
// /detached/ so the scripted agent in mock-server.mjs is left alone.
//
// - POST /detached/agent/                    starts a run, or answers 409 while
//                                            one holds the thread
// - POST /detached/queued/agent/             the same, as a firing_queue= mount:
//                                            200 {thread_id, run_id}, the run's
//                                            stream left to the run log
// - GET  /detached/threads/                  lists the threads
// - GET  /detached/threads/<id>/             one thread's messages
// - GET  /detached/threads/<id>/events/      the run log: JSON with limit=1 (the
//                                            probe), an SSE replay otherwise
// - POST /detached/threads/<id>/cancel/      records a cancel, 202 or 404
//
// A run lives in this process, not in its request: each answer is appended to
// the thread's log on a timer, and a request only tails the log. So a client
// that leaves (a thread switch, New chat, a reload) leaves the run going, and
// one that comes back replays the log from its start and follows it to the
// end. A turn that asks to be reported back to is answered, and a few
// seconds after that run ends the server starts another run on the thread by
// itself, as a child's report wakes its parent: the "A run the server starts"
// scenarios join it in the chat already showing the thread. A cancel lands about three seconds after it is asked for, standing in
// for the server's lease renewal, which is what lets Stop and then an
// immediate Send meet the 409.
import { randomUUID } from "node:crypto";

const AGENT = "/detached/agent/";
const QUEUED_AGENT = "/detached/queued/agent/";
const THREADS = /^\/detached\/threads\/(?:([^/]+)\/(events\/|cancel\/)?)?$/;
// Slow on purpose: long enough to switch away mid-answer and come back.
const CHUNK_MS = 600;
const CANCEL_LANDS_MS = 3000;
const ANSWER = [
  "This answer streams slowly on purpose, ",
  "a few words at a time, ",
  "for about twelve seconds. ",
  "Switch to the other thread now: ",
  "the request is aborted, ",
  "but the run carries on here on the server. ",
  "Come back and the element asks whether it is still going, ",
  "replays it from its start ",
  "and follows it live to the end. ",
  "Press Stop instead and it posts the thread's cancel, ",
  "which lands a few seconds later; ",
  "a Send in that window is refused with a 409, ",
  "so the element joins this run again ",
  "and sends your turn once it has finished. ",
  "That is the whole answer.",
];

const WAKE_MS = 4000;
const REPORT = [
  "A child reported back, ",
  "so the server started this run on the thread by itself, ",
  "and the chat already showing the thread joined it.",
];

/** Thread id to its title, messages, last update and the run it holds, if any. */
const threads = new Map();

function thread(threadId) {
  let row = threads.get(threadId);
  if (row === undefined) {
    row = { title: "New conversation", messages: [], updatedAt: Date.now(), run: null };
    threads.set(threadId, row);
  }
  return row;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

function write(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Append `event` to the run's log and hand it to every request following it. */
function append(run, event) {
  run.log.push(event);
  for (const res of run.tails) {
    write(res, event);
  }
}

function end(run, row) {
  run.done = true;
  clearInterval(run.timer);
  row.messages = [
    ...run.input,
    { id: run.messageId, role: "assistant", content: run.text },
  ];
  row.updatedAt = Date.now();
  for (const res of run.tails) {
    res.end();
  }
  run.tails.clear();
}

/** Follow the run from `from` in its log: what is logged now, then each event as it comes. */
function tail(run, res, from) {
  for (const event of run.log.slice(from)) {
    write(res, event);
  }
  if (run.done) {
    res.end();
    return;
  }
  run.tails.add(res);
  res.on("close", () => {
    run.tails.delete(res);
    // A run that did not ask to detach is stopped when its client leaves, as
    // a server cancels a run on disconnect.
    if (!run.detach && !run.done && res === run.origin) {
      run.cancelAt = Date.now();
    }
  });
}

/** Start a run; `res` is `null` for one the server starts by itself, which nobody streams. */
function startRun(res, body, queued = false, answer = ANSWER) {
  const threadId = body.threadId;
  const row = thread(threadId);
  if (row.run !== null && !row.run.done) {
    if (res === null) {
      return;
    }
    json(res, 409, {
      error: "the thread has a run in progress",
      thread_id: threadId,
      run_id: row.run.runId,
    });
    return;
  }
  const input = Array.isArray(body.messages) ? body.messages : [];
  const asked = input.filter((message) => message.role === "user").at(-1);
  if (row.messages.length === 0 && typeof asked?.content === "string" && asked.content !== "") {
    row.title = asked.content.slice(0, 60);
  }
  const run = {
    runId: randomUUID(),
    messageId: randomUUID(),
    input,
    log: [],
    tails: new Set(),
    text: "",
    done: false,
    detach: body.forwardedProps?.detach === true,
    cancelAt: null,
    origin: queued ? null : res,
    timer: null,
  };
  row.run = run;
  row.messages = input;
  row.updatedAt = Date.now();
  append(run, { type: "RUN_STARTED", threadId, runId: run.runId });
  append(run, { type: "TEXT_MESSAGE_START", messageId: run.messageId, role: "assistant" });
  let next = 0;
  run.timer = setInterval(() => {
    const cancelled = run.cancelAt !== null && Date.now() >= run.cancelAt;
    if (!cancelled && next < answer.length) {
      run.text += answer[next];
      append(run, { type: "TEXT_MESSAGE_CONTENT", messageId: run.messageId, delta: answer[next] });
      next += 1;
      return;
    }
    append(run, { type: "TEXT_MESSAGE_END", messageId: run.messageId });
    append(run, {
      type: "RUN_FINISHED",
      threadId,
      runId: run.runId,
      ...(cancelled ? {} : { outcome: { type: "success" } }),
    });
    end(run, row);
    if (!cancelled && answer !== REPORT && /report back/i.test(asked?.content ?? "")) {
      setTimeout(() => {
        const woken = { threadId, messages: row.messages, forwardedProps: { detach: true } };
        startRun(null, woken, true, REPORT);
      }, WAKE_MS);
    }
  }, CHUNK_MS);
  if (queued) {
    // A worker has the run now; the element follows it through events/?after=0.
    if (res !== null) {
      json(res, 200, { thread_id: threadId, run_id: run.runId });
    }
    return;
  }
  openStream(res);
  tail(run, res, 0);
}

/** The probe: one JSON page of the log, read by the element for its status. */
function probe(res, threadId, row) {
  if (row?.run == null) {
    json(res, 404, { error: "the thread has no run", thread_id: threadId });
    return;
  }
  const { run } = row;
  json(res, 200, {
    thread_id: threadId,
    run_id: run.runId,
    status: run.done ? "idle" : "running",
    events: [{ seq: 1, event: run.log[0] }],
    after: 1,
    done: false,
  });
}

/**
 * The replay: the run's start, the conversation as it stands, then the rest
 * of the log, followed live. The snapshot carries the run's own user turn,
 * which django-ag-ui's replay does not yet.
 */
function replay(res, row) {
  const { run } = row;
  openStream(res);
  write(res, run.log[0]);
  write(res, { type: "MESSAGES_SNAPSHOT", messages: run.input });
  tail(run, res, 1);
}

function cancel(res, threadId, row) {
  const run = row?.run;
  if (run == null || run.done) {
    json(res, 404, { error: "the thread has no run in progress", thread_id: threadId });
    return;
  }
  run.cancelAt ??= Date.now() + CANCEL_LANDS_MS;
  json(res, 202, { thread_id: threadId, cancel_requested: true });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

/** Answer a request under /detached/; false for any other path. */
export function detachedRoute(req, res, path) {
  if (path.startsWith("/detached/")) {
    // So the requests the element makes can be read off this process's output.
    process.stdout.write(`detached-runs ${req.method} ${req.url}\n`);
  }
  if (req.method === "POST" && (path === AGENT || path === QUEUED_AGENT)) {
    readBody(req).then((body) => startRun(res, JSON.parse(body), path === QUEUED_AGENT));
    return true;
  }
  const match = THREADS.exec(path);
  if (match === null) {
    return false;
  }
  const [, id, route] = match;
  const threadId = id === undefined ? undefined : decodeURIComponent(id);
  const row = threadId === undefined ? undefined : threads.get(threadId);
  if (threadId === undefined) {
    const rows = [...threads.entries()]
      .filter(([, listed]) => listed.messages.length > 0)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([listedId, listed]) => ({
        thread_id: listedId,
        title: listed.title,
        updated_at: new Date(listed.updatedAt).toISOString(),
        preview: "",
        status: listed.run !== null && !listed.run.done ? "running" : "idle",
      }));
    json(res, 200, { threads: rows });
  } else if (route === "events/" && req.method === "GET") {
    if (new URL(req.url, "http://demo").searchParams.get("limit") === "1") {
      probe(res, threadId, row);
    } else if (row?.run == null) {
      json(res, 404, { error: "the thread has no run", thread_id: threadId });
    } else {
      replay(res, row);
    }
  } else if (route === "cancel/" && req.method === "POST") {
    cancel(res, threadId, row);
  } else if (route === undefined && req.method === "GET") {
    if (row === undefined) {
      json(res, 404, { error: "no such thread" });
    } else {
      json(res, 200, { messages: row.messages });
    }
  } else if (route === undefined && req.method === "PATCH") {
    readBody(req).then((body) => {
      if (row !== undefined) {
        row.title = JSON.parse(body).title ?? row.title;
      }
      res.writeHead(204);
      res.end();
    });
  } else if (route === undefined && req.method === "DELETE") {
    threads.delete(threadId);
    res.writeHead(204);
    res.end();
  } else {
    json(res, 405, { error: "method not allowed" });
  }
  return true;
}
