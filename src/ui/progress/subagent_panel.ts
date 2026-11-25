import { SUBAGENT_PHASE } from "../../constants.js";
import type { TaskControlAction, TaskControlResult } from "../../core/task_controls.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "../ui_strings.js";

/** The longest text the task routes take; longer is refused with `invalid`. */
const TASK_TEXT_LIMIT = 8000;

/** What the reply field sends: a steer, or an answer to the question open when it opened. */
type ReplyMode =
  | { readonly kind: "steer" }
  | { readonly kind: "answer"; readonly questionId: string };

/** Refusal reasons that mean the task is no longer there to control. */
const GONE: ReadonlySet<string> = new Set(["not_running", "no_task", "no_run"]);
/** Refusal reasons that mean this server cannot reach the task from here. */
const UNREACHABLE: ReadonlySet<string> = new Set(["not_live_here", "remote"]);

/** The phases that close a delegation; nothing about it is still pending after one. */
const SETTLED: ReadonlySet<string> = new Set([
  SUBAGENT_PHASE.FINISHED,
  SUBAGENT_PHASE.FAILED,
  SUBAGENT_PHASE.CANCELLED,
  SUBAGENT_PHASE.UNFINISHED,
]);

/** One phase of a delegation's life, as the server spells it. */
export type SubAgentPhase = (typeof SUBAGENT_PHASE)[keyof typeof SUBAGENT_PHASE];

/**
 * One tool call the child made, as the two tool phases report it.
 *
 * `ok` is a tri-state and stays one here rather than collapsing to a boolean:
 * `null` is the call in flight, `true` a result the child accepted, `false` a
 * result that came back to it. Flattening `null` into `false` would draw a
 * running call as a failed one for as long as it runs.
 */
export interface SubAgentTool {
  readonly toolCallId: string;
  readonly name: string;
  readonly ok: boolean | null;
}

/**
 * The task a task-control step names, and what that step adds to it.
 *
 * `taskId` is on every task step; each other key is `null` unless its phase
 * carries it: `reason` on `backgrounded` (`requested`, `auto`, `question`),
 * `questionId` on `question` and `answered`, `forced` on `cancel_requested`,
 * `attempt` on `retried`. From django-ag-ui 0.91.0 a step also says what was
 * said (`message` on `steered`, `question`, `answer` on `answered`, with
 * `truncated` when the server cut it) and who acted (`source`, `user` for a
 * task route and `model` for the run itself, on `steered`, `answered` and
 * `cancel_requested`).
 */
export interface SubAgentTask {
  readonly taskId: string;
  readonly reason: string | null;
  readonly questionId: string | null;
  readonly forced: boolean | null;
  readonly attempt: number | null;
  readonly message: string | null;
  readonly question: string | null;
  readonly answer: string | null;
  readonly source: "user" | "model" | null;
  readonly truncated: boolean;
}

/**
 * How a panel sends a task control, given by the element that owns it.
 *
 * `available` is read on every step, so the controls follow the element's
 * `data-threads-url` rather than the value it had when the panel was made.
 */
export interface TaskControlPort {
  readonly available: () => boolean;
  readonly send: (taskId: string, action: TaskControlAction) => Promise<TaskControlResult>;
}

/**
 * One narrowed progress announcement about a delegation.
 *
 * Every field but `phase` and `delegationId` is nullable because the wire's
 * `value` is `unknown` and a malformed announcement must not take the run down
 * with it. `null` means "said nothing about this", never "said nothing was
 * there" — the panel leaves what it already shows alone.
 */
export interface SubAgentUpdate {
  /** The **parent's** `delegate_task` tool-call id, not the child's run id. */
  readonly delegationId: string;
  /** The child agent's name, for a host that wants to style or select by it. */
  readonly agent: string | null;
  readonly phase: SubAgentPhase;
  /** The server's pre-rendered line. The collapsed row needs nothing else. */
  readonly status: string | null;
  /** Present on the two tool phases only. */
  readonly tool: SubAgentTool | null;
  /** Present on the task-control phases only. */
  readonly task: SubAgentTask | null;
}

/**
 * The nested surface for one delegation: a collapsed status row that expands
 * onto the child agent's own tool calls.
 *
 * ## Where it goes and why
 *
 * Into {@link ToolCallCard.subagentSlot} — the card the parent's own
 * `delegate_task` call already drew. The wire keys progress on the *parent's*
 * tool-call id, so the thing being narrated is already on screen; a floating
 * element would have duplicated its identity and then had to explain the
 * relationship. Attaching instead means the delegation reuses how tool cards
 * already behave, and there is no second visual language to learn.
 *
 * ## The shape
 *
 * One row per delegation, live, carrying nothing but the server's own `status`
 * line — which is what makes a ten-step child cost one row until somebody opens
 * it. Two alternatives were rejected on the way here and both are worth naming:
 * a bare status line is cheaper and gives up the detail entirely, and inline
 * child cards in the transcript interleave parent and child with nothing marking
 * whose is whose, in an order the persisted transcript will not reproduce.
 *
 * A child's steps are keyed by the child's own `toolCallId`, so the `tool_call`
 * that opens one and the `tool_result` that settles it are the same row updated
 * in place rather than two rows stacked.
 *
 * ## What it never does
 *
 * It never renders failure text. A `failed` phase carries none, on purpose; the
 * detail arrives on the ordinary `TOOL_CALL_RESULT` and lands in the same card's
 * result region, a few pixels below. Anything invented here would be this
 * component guessing at words the server declined to send.
 *
 * ## A task's state
 *
 * `data-phase` is the latest moment, and a task step is a moment: a `steered`
 * gives way to the next `tool_call`. What outlasts its moment is stamped on its
 * own, for a host to style: `data-task-id` (the task the steps name),
 * `data-background` (the task left the foreground; its value is the server's
 * reason), `data-awaiting-answer` (a question is open, from `question` to
 * `answered` or the close), `data-answerable` (the open question's id, only
 * while Answer is offered, which the enclosing group reads to open itself),
 * `data-cancel` (`requested` or `forced`), and `data-attempt` (a remote
 * task's retry), and `data-source` (`user` or `model`, who acted on the latest
 * steer, answer or cancel).
 *
 * ## The task's controls
 *
 * Given a {@link TaskControlPort} that is available, a live task offers Steer
 * and Cancel, and Answer while a question is open, with the question's text
 * beside it. They sit in their own region beside the row, since the row is a
 * button. A control only asks: it never stamps a state, and the row changes
 * when the server's step for the act arrives on the stream. Cancel asks the
 * task to stop before its next model request; once that request is on the
 * stream it offers to stop the task at once (`force`). A refusal is worded from
 * its reason code, and the controls are withdrawn when the task settles.
 *
 * Nothing here is persisted: the events ride the imperative carrier, so a thread
 * restore rebuilds the tool card and not the delegation under it.
 *
 * Pure DOM, like the other widgets: the host appends {@link element}, and all
 * chrome text comes from {@link UiStrings}. The status line is server text and
 * is set with `textContent`, never parsed as markup.
 */
export class SubAgentPanel {
  /** The panel's root; append this into the delegating card's slot. */
  readonly element: HTMLDivElement;

  /**
   * The child agent's name, as the last update that carried one gave it.
   *
   * Read back rather than only written to the DOM, because the two carriers
   * split the name away from the close: `SUBAGENT_STARTED` names the agent and
   * `SUBAGENT_FINISHED` carries only an id, so whoever words the closing line
   * has to recover the name from what the delegation already told it.
   */
  get agent(): string | null {
    return this.#agent;
  }

  /**
   * The collapsed row, which is the expander as well as the status.
   *
   * Disabled while the child has called nothing, so a delegation that failed
   * before it started offers no control that expands onto an empty region —
   * the same refusal the card's own Details toggle already makes.
   */
  readonly #row: HTMLButtonElement;
  readonly #status: HTMLSpanElement;
  readonly #steps: HTMLDivElement;
  /** The child's tool calls, keyed by the child's own call id. */
  readonly #stepRows = new Map<string, HTMLDivElement>();
  #agent: string | null = null;

  readonly #strings: UiStrings;
  readonly #port: TaskControlPort | null;
  readonly #controls: HTMLDivElement;
  readonly #question: HTMLParagraphElement;
  readonly #steer: HTMLButtonElement;
  readonly #answer: HTMLButtonElement;
  readonly #cancel: HTMLButtonElement;
  readonly #reply: HTMLFormElement;
  readonly #replyInput: HTMLInputElement;
  readonly #replySend: HTMLButtonElement;
  readonly #error: HTMLParagraphElement;
  #taskId: string | null = null;
  /** The open question, kept from its own step: the steps after it do not name it. */
  #openQuestion: { readonly id: string; readonly text: string | null } | null = null;
  #settled = false;
  /** What the stream said of a cancel, mirrored in data-cancel. */
  #cancelAsked: "requested" | "forced" | null = null;
  /** The open reply: a steer, or an answer to the question open when it was opened. */
  #mode: ReplyMode | null = null;

  constructor(strings: UiStrings = DEFAULT_UI_STRINGS, port: TaskControlPort | null = null) {
    this.#strings = strings;
    this.#port = port;
    this.element = document.createElement("div");
    this.element.className = "subagent";
    this.element.setAttribute("part", "subagent");

    this.#row = document.createElement("button");
    this.#row.type = "button";
    this.#row.className = "subagent-row";
    this.#row.setAttribute("part", "subagent-row");
    this.#row.setAttribute("aria-expanded", "false");
    this.#row.disabled = true;

    // Left empty in the DOM, like the tool card's: the shadow CSS draws a
    // spinner or a settled mark from the panel's data-phase, so a host themes
    // the glyph without either side reaching into the other's stylesheet.
    const icon = document.createElement("span");
    icon.className = "subagent-icon";
    icon.setAttribute("part", "subagent-icon");
    icon.setAttribute("aria-hidden", "true");

    this.#status = document.createElement("span");
    this.#status.className = "subagent-status";
    this.#status.setAttribute("part", "subagent-status");
    // Seeded rather than left blank: an announcement whose status field is
    // unusable must still leave a readable row, since the row is the control.
    this.#status.textContent = strings.subAgentWorking;

    this.#row.append(icon, this.#status);

    this.#steps = document.createElement("div");
    this.#steps.className = "subagent-steps";
    this.#steps.setAttribute("part", "subagent-steps");
    this.#steps.setAttribute("role", "list");
    this.#steps.setAttribute("aria-label", strings.subAgentSteps);
    this.#steps.hidden = true;

    // The attribute is the state, as it is on the tool card: one place holds
    // whether the region is open, and it is the one a screen reader reads.
    this.#row.addEventListener("click", () => {
      this.#setExpanded(this.#row.getAttribute("aria-expanded") !== "true");
    });

    this.#controls = document.createElement("div");
    this.#controls.className = "subagent-controls";
    this.#controls.setAttribute("part", "subagent-controls");
    this.#controls.setAttribute("role", "group");
    this.#controls.setAttribute("aria-label", strings.subAgentControls);
    this.#controls.hidden = true;

    this.#question = document.createElement("p");
    this.#question.className = "subagent-question";
    this.#question.setAttribute("part", "subagent-question");
    this.#question.hidden = true;

    const actions = document.createElement("div");
    actions.className = "subagent-actions";
    actions.setAttribute("part", "subagent-actions");
    this.#steer = controlButton("subagent-steer", strings.subAgentSteer);
    this.#answer = controlButton("subagent-answer", strings.subAgentAnswer);
    this.#cancel = controlButton("subagent-cancel", strings.subAgentCancelTask);
    this.#steer.setAttribute("part", "subagent-steer");
    this.#answer.setAttribute("part", "subagent-answer");
    this.#cancel.setAttribute("part", "subagent-cancel");
    this.#steer.setAttribute("aria-expanded", "false");
    this.#answer.setAttribute("aria-expanded", "false");
    actions.append(this.#steer, this.#answer, this.#cancel);

    this.#reply = document.createElement("form");
    this.#reply.className = "subagent-reply";
    this.#reply.setAttribute("part", "subagent-reply");
    this.#reply.hidden = true;
    this.#replyInput = document.createElement("input");
    this.#replyInput.type = "text";
    this.#replyInput.className = "subagent-reply-input";
    this.#replyInput.setAttribute("part", "subagent-reply-input");
    this.#replyInput.maxLength = TASK_TEXT_LIMIT;
    this.#replySend = controlButton("subagent-reply-send", strings.subAgentSend);
    this.#replySend.setAttribute("part", "subagent-reply-send");
    this.#replySend.type = "submit";
    this.#reply.append(this.#replyInput, this.#replySend);

    this.#error = document.createElement("p");
    this.#error.className = "subagent-control-error";
    this.#error.setAttribute("part", "subagent-control-error");
    this.#error.setAttribute("role", "alert");
    this.#error.hidden = true;

    this.#controls.append(this.#question, actions, this.#reply, this.#error);

    this.#steer.addEventListener("click", () => this.#toggleReply({ kind: "steer" }));
    this.#answer.addEventListener("click", () => {
      const question = this.#openQuestion;
      if (question !== null) {
        this.#toggleReply({ kind: "answer", questionId: question.id });
      }
    });
    this.#cancel.addEventListener("click", () => {
      const force = this.#cancelAsked === "requested";
      void this.#send(this.#cancel, { kind: "cancel", force });
    });
    this.#reply.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#submitReply();
    });

    this.element.append(this.#row, this.#controls, this.#steps);
  }

  /**
   * Fold one announcement in.
   *
   * Every field is applied only when the update actually carried it, so a phase
   * that says nothing about the agent or the status leaves both as they stand.
   * That is what lets `finished` be two keys wide on the wire without blanking
   * the row it closes.
   */
  report(update: SubAgentUpdate): void {
    this.element.setAttribute("data-phase", update.phase);
    if (update.agent !== null) {
      this.#agent = update.agent;
      this.element.setAttribute("data-agent", update.agent);
    }
    if (update.status !== null) {
      this.#status.textContent = update.status;
    }
    if (update.tool !== null) {
      this.#recordStep(update.tool);
    }
    if (update.task !== null) {
      this.#recordTask(update.phase, update.task);
    }
    if (SETTLED.has(update.phase)) {
      this.element.removeAttribute("data-awaiting-answer");
      this.#settled = true;
      this.#openQuestion = null;
    }
    this.#refreshControls();
  }

  /** Stamp what a task step leaves standing after its moment has passed. */
  #recordTask(phase: SubAgentPhase, task: SubAgentTask): void {
    this.element.setAttribute("data-task-id", task.taskId);
    this.#taskId = task.taskId;
    if (task.source !== null) {
      this.element.setAttribute("data-source", task.source);
    }
    if (phase === SUBAGENT_PHASE.BACKGROUNDED) {
      this.element.setAttribute("data-background", task.reason ?? "");
    } else if (phase === SUBAGENT_PHASE.QUESTION) {
      this.element.setAttribute("data-awaiting-answer", "");
      this.#openQuestion =
        task.questionId === null ? null : { id: task.questionId, text: task.question };
    } else if (phase === SUBAGENT_PHASE.ANSWERED) {
      this.element.removeAttribute("data-awaiting-answer");
      this.#openQuestion = null;
    } else if (phase === SUBAGENT_PHASE.CANCEL_REQUESTED) {
      this.#cancelAsked = task.forced === true ? "forced" : "requested";
      this.element.setAttribute("data-cancel", this.#cancelAsked);
    } else if (phase === SUBAGENT_PHASE.RETRIED && task.attempt !== null) {
      this.element.setAttribute("data-attempt", String(task.attempt));
    }
  }

  /**
   * Open or settle one of the child's calls, keyed by its own id.
   *
   * The absence of `data-ok` is what "still running" looks like, mirroring the
   * wire's `null` rather than inventing a third value for it — so the attribute
   * is removed on the way in and written on the way out.
   */
  #recordStep(tool: SubAgentTool): void {
    const row = this.#stepRows.get(tool.toolCallId) ?? this.#createStep(tool);
    if (tool.ok === null) {
      row.removeAttribute("data-ok");
      return;
    }
    row.setAttribute("data-ok", String(tool.ok));
  }

  #createStep(tool: SubAgentTool): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "subagent-step";
    row.setAttribute("part", "subagent-step");
    row.setAttribute("role", "listitem");
    row.setAttribute("data-tool-call-id", tool.toolCallId);

    const icon = document.createElement("span");
    icon.className = "subagent-step-icon";
    icon.setAttribute("part", "subagent-step-icon");
    icon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "subagent-step-name";
    name.setAttribute("part", "subagent-step-name");
    // The child's raw tool name. Not prettified and not looked up in the tool
    // catalog: a sub-agent's tools are its own and never reached the browser's
    // schema, and the status line above quotes the same raw name, so relabelling
    // here would make the two lines disagree about one call.
    name.textContent = tool.name;

    row.append(icon, name);
    this.#steps.appendChild(row);
    this.#stepRows.set(tool.toolCallId, row);
    // There is something behind the row now, so it becomes a control.
    this.#row.disabled = false;
    return row;
  }

  /** Show the controls the task's current state allows, from the stream alone. */
  #refreshControls(): void {
    const live = this.#port?.available() && this.#taskId !== null && !this.#settled;
    this.#controls.hidden = !live;
    const question = this.#openQuestion;
    this.#answer.hidden = question === null;
    if (live && question !== null) {
      this.element.setAttribute("data-answerable", question.id);
    } else {
      this.element.removeAttribute("data-answerable");
    }
    this.#question.hidden = question?.text == null;
    this.#question.textContent = question?.text ?? "";
    const cancel = this.#cancelAsked;
    this.#cancel.hidden = cancel === "forced";
    this.#cancel.textContent =
      cancel === "requested" ? this.#strings.subAgentForceCancel : this.#strings.subAgentCancelTask;
    if (!live || (this.#mode?.kind === "answer" && this.#mode.questionId !== question?.id)) {
      this.#closeReply();
    }
  }

  #toggleReply(mode: ReplyMode): void {
    if (this.#mode?.kind === mode.kind) {
      this.#closeReply();
      return;
    }
    this.#mode = mode;
    this.#reply.hidden = false;
    this.#reply.setAttribute("data-mode", mode.kind);
    const label =
      mode.kind === "steer"
        ? this.#strings.subAgentSteerPlaceholder
        : this.#strings.subAgentAnswerPlaceholder;
    this.#replyInput.placeholder = label;
    this.#replyInput.setAttribute("aria-label", label);
    this.#steer.setAttribute("aria-expanded", String(mode.kind === "steer"));
    this.#answer.setAttribute("aria-expanded", String(mode.kind === "answer"));
    this.#replyInput.focus();
  }

  #closeReply(): void {
    this.#mode = null;
    this.#reply.hidden = true;
    this.#reply.removeAttribute("data-mode");
    this.#steer.setAttribute("aria-expanded", "false");
    this.#answer.setAttribute("aria-expanded", "false");
  }

  /** Send the reply form's text as a steer or an answer; blank text is not sent. */
  async #submitReply(): Promise<void> {
    const text = this.#replyInput.value;
    const mode = this.#mode;
    if (mode === null || text.trim() === "") {
      return;
    }
    const action: TaskControlAction =
      mode.kind === "steer"
        ? { kind: "steer", message: text }
        : { kind: "answer", questionId: mode.questionId, answer: text };
    if (await this.#send(this.#replySend, action)) {
      this.#replyInput.value = "";
      this.#closeReply();
    }
  }

  /**
   * Send one control, with `control` disabled while it is in flight. Changes no
   * state on the panel: an accepted control shows when its step arrives.
   */
  async #send(control: HTMLButtonElement, action: TaskControlAction): Promise<boolean> {
    const taskId = this.#taskId;
    if (this.#port === null || taskId === null) {
      return false;
    }
    control.disabled = true;
    this.#error.hidden = true;
    const result = await this.#port.send(taskId, action);
    control.disabled = false;
    if (result.ok) {
      return true;
    }
    this.#error.textContent = this.#refusal(result.status, result.reason);
    this.#error.hidden = false;
    return false;
  }

  /** A refusal in the user's words, from the route's reason code. */
  #refusal(status: number, reason: string | null): string {
    if (reason !== null && GONE.has(reason)) {
      return this.#strings.subAgentControlFinished;
    }
    if (reason === "not_waiting") {
      return this.#strings.subAgentControlNotWaiting;
    }
    // A 404 or 405 with no reason is a server without the routes.
    if (
      (reason !== null && UNREACHABLE.has(reason)) ||
      (reason === null && (status === 404 || status === 405))
    ) {
      return this.#strings.subAgentControlUnavailable;
    }
    return this.#strings.subAgentControlFailed;
  }

  #setExpanded(expanded: boolean): void {
    this.#steps.hidden = !expanded;
    this.#row.setAttribute("aria-expanded", String(expanded));
  }
}

/** One of the task's control buttons; the caller sets its part, so the parts stay literal. */
function controlButton(className: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}
