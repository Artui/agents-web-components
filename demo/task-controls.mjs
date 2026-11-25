// The server behind the task-controls scenario: a run whose background task
// stays open until the user acts on it, and the three task routes django-ag-ui
// 0.91.0 serves beside a thread, under /tasks/ so the other demo servers are
// left alone.
//
// - GET  /tasks/threads/                         an empty thread list
// - GET  /tasks/threads/<id>/                    no stored messages
// - POST /tasks/agent/                           a run: one background task asks a question
// - POST /tasks/threads/<id>/tasks/<task>/steer/   {"message"}, 202
// - POST /tasks/threads/<id>/tasks/<task>/answer/  {"question_id", "answer"}, 202
// - POST /tasks/threads/<id>/tasks/<task>/cancel/  {"force"}, 202
//
// Each accepted control is answered 202 and then reported on the still-open
// stream as the step django-ag-ui writes for a user's act (source "user"), so
// the row changes only when that step lands. A message containing "refuse" is
// refused 409 not_running, to show a refusal's wording. A task nobody cancels
// finishes after two minutes.

const AGENT = "/tasks/agent/";
const THREADS = /^\/tasks\/threads\/(?:([^/]+)\/(?:tasks\/([^/]+)\/(steer|answer|cancel)\/)?)?$/;
const OPEN_FOR = 120_000;

/** The live tasks, by task id: the stream each one's steps go to. */
const live = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

function text(res, messageId, delta) {
  emit(res, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  emit(res, { type: "TEXT_MESSAGE_CONTENT", messageId, delta });
  emit(res, { type: "TEXT_MESSAGE_END", messageId });
}

function step(task, phase, said, fields) {
  emit(task.res, {
    type: "CUSTOM",
    name: "ag_ui.subagent",
    value: {
      delegationId: task.call,
      agent: "researcher",
      phase,
      status: `researcher: ${said}`,
      tool: null,
      task: { taskId: task.taskId, ...fields },
    },
  });
}

function close(task, event) {
  if (!live.has(task.taskId)) {
    return;
  }
  live.delete(task.taskId);
  emit(task.res, { subagentRunId: `subagent-${task.call}`, ...event });
  text(task.res, `${task.call}-done`, "The researcher's task is over.");
  emit(task.res, { type: "RUN_FINISHED", threadId: task.threadId, runId: task.runId });
  task.res.end();
}

function run(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    const { threadId, runId } = JSON.parse(raw);
    const stamp = Date.now().toString(36);
    const task = { threadId, runId, res, call: `call-${stamp}`, taskId: `task-${stamp}` };
    res.writeHead(200, { "content-type": "text/event-stream" });
    emit(res, { type: "RUN_STARTED", threadId, runId });
    const args = { agent_name: "researcher", task: "Find the settlement passages.", background: true };
    emit(res, { type: "TOOL_CALL_START", toolCallId: task.call, toolCallName: "delegate_task" });
    emit(res, { type: "TOOL_CALL_ARGS", toolCallId: task.call, delta: JSON.stringify(args) });
    emit(res, { type: "TOOL_CALL_END", toolCallId: task.call });
    emit(res, {
      type: "SUBAGENT_STARTED",
      subagentRunId: `subagent-${task.call}`,
      name: "researcher",
      parentToolCallId: task.call,
    });
    step(task, "backgrounded", "moved to the background", { reason: "requested" });
    emit(res, {
      type: "TOOL_CALL_RESULT",
      messageId: `${task.call}-result`,
      toolCallId: task.call,
      content: `Task ${task.taskId} is running in the background.`,
    });
    live.set(task.taskId, task);
    res.on("close", () => live.delete(task.taskId));
    await sleep(1200);
    if (live.has(task.taskId)) {
      step(task, "question", "asked a question", {
        questionId: "q-1",
        question: "Which year should I search: 2023 or 2024?",
      });
    }
    await sleep(OPEN_FOR);
    close(task, { type: "SUBAGENT_FINISHED" });
  });
}

function control(req, res, taskId, action) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    const body = JSON.parse(raw || "{}");
    const task = live.get(taskId);
    const refuse = (status, reason, error) =>
      res.writeHead(status, { "content-type": "application/json" }).end(
        JSON.stringify({ error, reason, task_id: taskId }),
      );
    if (task === undefined || String(body.message ?? body.answer ?? "").includes("refuse")) {
      refuse(409, "not_running", "the task is not running");
      return;
    }
    if (action === "answer" && body.question_id !== "q-1") {
      refuse(409, "not_waiting", "the task is not waiting on that question");
      return;
    }
    res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ task_id: taskId }));
    // The server's step follows the acknowledgement, a moment later, on the run's stream.
    await sleep(400);
    if (action === "steer") {
      step(task, "steered", "steered by you", { message: body.message, source: "user" });
    } else if (action === "answer") {
      step(task, "answered", "answered by you", {
        questionId: body.question_id,
        answer: body.answer,
        source: "user",
      });
    } else {
      step(task, "cancel_requested", "cancellation requested by you", {
        forced: body.force === true,
        source: "user",
      });
      await sleep(body.force === true ? 300 : 2500);
      close(task, { type: "SUBAGENT_ERROR", message: "researcher was cancelled", code: "cancelled" });
    }
  });
}

/** Answer a /tasks/ request; false for any other path. */
export function taskControlsRoute(req, res, path) {
  if (req.method === "POST" && path === AGENT) {
    process.stdout.write(`task-controls ${req.method} ${req.url}\n`);
    run(req, res);
    return true;
  }
  const match = THREADS.exec(path);
  if (match === null) {
    return false;
  }
  process.stdout.write(`task-controls ${req.method} ${req.url}\n`);
  const [, threadId, taskId, action] = match;
  if (action !== undefined && req.method === "POST") {
    control(req, res, decodeURIComponent(taskId), action);
  } else if (threadId === undefined) {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ threads: [] }));
  } else if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages: [] }));
  } else {
    res.writeHead(204).end();
  }
  return true;
}
