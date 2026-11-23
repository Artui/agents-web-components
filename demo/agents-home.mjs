// The server behind the agents home page: django-ag-ui 0.87.0's AgentsDirectory,
// over two of this demo's own servers.
//
// - GET /agents-home/agents/  the directory, with an ETag; If-None-Match gets a 304
// - GET /agents-home/inbox/   every agent's thread rows, each with its agent_id,
//                             with an ETag; Accept: text/event-stream a stream
//
// "status" is the thread-status server (its threads carry run marks); "echo" is
// the plain mock agent, which has no thread store and so lists nothing.
import { createHash } from "node:crypto";
import { listing as statusListing } from "./thread-status.mjs";

const AGENTS = "/agents-home/agents/";
const INBOX = "/agents-home/inbox/";
const NONE = {
  tools_url: null,
  threads_url: null,
  runs_url: null,
  skills_url: null,
  skill_editor_url: null,
  routines_url: null,
  attachments_url: null,
  transcribe_url: null,
};
const DIRECTORY = JSON.stringify({
  agents: [
    {
      ...NONE,
      id: "status",
      name: "Status",
      description: "A thread store with run status",
      endpoint: "/status/agent/",
      threads_url: "/status/threads/",
    },
    { ...NONE, id: "echo", name: "Echo", description: "The plain mock agent", endpoint: "/agent/" },
  ],
});

function tagged(body) {
  return { body, etag: `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"` };
}

function inbox() {
  const { threads } = JSON.parse(statusListing().body);
  return tagged(JSON.stringify({ threads: threads.map((row) => ({ ...row, agent_id: "status" })) }));
}

function answer(req, res, { body, etag }) {
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag }).end();
  } else {
    res.writeHead(200, { "content-type": "application/json", ETag: etag }).end(body);
  }
}

function follow(req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  let sent = req.headers["last-event-id"] ?? null;
  const tick = () => {
    const { body, etag } = inbox();
    res.write(etag === sent ? ": demo heartbeat\n\n" : `id: ${etag}\ndata: ${body}\n\n`);
    sent = etag;
  };
  tick();
  const timer = setInterval(tick, 1000);
  req.on("close", () => clearInterval(timer));
}

/** Answer an agents-home request; `false` when `path` is not one. */
export function agentsHomeRoute(req, res, path) {
  if (req.method !== "GET" || (path !== AGENTS && path !== INBOX)) {
    return false;
  }
  process.stdout.write(`agents-home ${req.method} ${req.url}\n`);
  if (path === AGENTS) {
    answer(req, res, tagged(DIRECTORY));
  } else if ((req.headers.accept ?? "").includes("text/event-stream")) {
    follow(req, res);
  } else {
    answer(req, res, inbox());
  }
  return true;
}
