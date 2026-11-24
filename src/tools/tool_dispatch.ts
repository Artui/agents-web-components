import type { Context, Interrupt } from "@ag-ui/core";
import { READ_PAGE_TOOL, TOOL_CALL_STATUS, TOOL_OUTCOME, X_CONFIRM_KEY } from "../constants.js";
import type { AgUiToolCall, InterruptResponse, ToolExecution } from "../core/agui_client.js";
import type { ClientConversationStore } from "../core/conversation_store.js";
import { skillNameFrom } from "../skills/skill_name_from.js";
import { fillUiString } from "../ui/fill_ui_string.js";
import {
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "../ui/interrupts/approval_card.js";
import {
  type ConfirmationRequest,
  requestConfirmation,
} from "../ui/interrupts/confirmation_card.js";
import type { PendingDecision } from "../ui/interrupts/pending_decision.js";
import type { ToolCallCard } from "../ui/progress/tool_call_card.js";
import type { Transcript } from "../ui/transcript/transcript.js";
import type { UiStrings } from "../ui/ui_strings.js";
import type { ClientTool } from "./client_tool_registry.js";
import { confirmPhrase } from "./confirm_phrase.js";
import { isDestructive } from "./is_destructive.js";
import { isNavigates } from "./is_navigates.js";
import type { ToolCatalog } from "./tool_catalog.js";

/** What tool dispatch needs from the element that owns it. */
export interface ToolDispatchHost {
  /** The custom element, which a host's predicate and renderer are called on. */
  readonly element: HTMLElement;
  /** The transcript the cards and prompts are drawn in. */
  readonly transcript: Transcript;
  /** The tools this round advertised, and their implementations. */
  readonly tools: ToolCatalog;
  /** The decision a run is suspended on, which a Stop abandons. */
  readonly decision: PendingDecision;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Say one short thing to a screen reader. */
  readonly announce: (message: string) => void;
  /** The element's `autoConfirm`. */
  readonly autoConfirm: () => boolean;
  /** The element's `confirmPredicate`. */
  readonly confirmPredicate: () =>
    | ((toolName: string, args: Record<string, unknown>) => boolean | Promise<boolean>)
    | null;
  /** The element's `navigate`. */
  readonly navigate: () => ((path: string) => void) | null;
  /** The element's `approveWithEdits`. */
  readonly approveWithEdits: () => boolean;
  /** The element's `approvalRenderer`. */
  readonly approvalRenderer: () => ApprovalRenderer | null;
  /** The element's `getContext`, which a host may have replaced. */
  readonly getContext: () => Context[];
  /** The element's `conversationStore`, read per use. */
  readonly conversationStore: () => ClientConversationStore;
  /** The active thread's id. */
  readonly threadId: () => string;
  /** An identity replaced on every handover to another principal; only compared. */
  readonly tenure: () => object;
  /** An identity replaced whenever the transcript is cleared for another conversation; only compared. */
  readonly conversation: () => object;
}

/**
 * Running the frontend tool calls a round produced, and answering the server's
 * interrupts: the page each round's context described, the confirmation rules,
 * and the tools the user waived confirmation for.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ToolDispatch {
  readonly #host: ToolDispatchHost;
  /** Tool names the user waived confirmation for; never persisted, since that would be a permanent grant. */
  readonly #sessionApproved = new Set<string>();
  // The page the current round's context describes; `null` until the first round.
  #contextHref: string | null = null;

  constructor(host: ToolDispatchHost) {
    this.#host = host;
  }

  /** Forget every waiver: a logout is not a remount, so the next principal must not inherit one. */
  forgetWaivers(): void {
    this.#sessionApproved.clear();
  }

  /** Build a round's context, recording its page; the client calls this at the top of every tool round. */
  buildContext(): Context[] {
    this.#contextHref = window.location.href;
    return this.#host.getContext();
  }

  /**
   * Execute one frontend tool call the round produced, against its own card:
   * refused when the page moved under the round, asked about when a rule gates
   * it, and settled with what the handler returned or threw.
   *
   * Every await is a place the run can end, so each is followed by a check. A handover
   * leaves the call no transcript or store, so it draws and writes nothing; any other
   * reset (New chat, a drawer switch, `reload()`) still settles it but shows no pending
   * indicator in the new conversation.
   */
  async execute(call: AgUiToolCall): Promise<ToolExecution | null> {
    // A skill load is already a notice on the stream; it must not acquire a card here.
    if (skillNameFrom(call) !== null) {
      return null;
    }
    // Fixed at dispatch: read after the handler, they would be whoever is current by then.
    const tenure = this.#host.tenure();
    const conversation = this.#host.conversation();
    const threadId = this.#host.threadId();
    const card = this.#host.transcript.cardFor(call);
    this.#host.transcript.forgetCard(call.id);
    // A tool that renders into the transcript places itself against its card, no longer reachable by id.
    this.#host.transcript.setCardElement(call.id, card.element);
    this.#host.transcript.holdRunning(call.id, card);
    // A tool this round did not advertise is treated as an unknown name, so a hallucinated
    // or steered call cannot reach a handler that is merely registered mount-wide.
    const tool = this.#host.tools.wasAdvertised(call.name)
      ? this.#host.tools.resolve(call.name)
      : null;
    if (tool === null) {
      // A server tool's result arrives via `onToolResult` and already settled the card; with
      // none, neither side ran the call, so say it did not finish. No pending indicator:
      // no client round follows, so it would hang.
      if (!this.#host.transcript.isServerSettled(call.id)) {
        card.settle(TOOL_CALL_STATUS.INTERRUPTED, this.#host.strings().callNotFinished);
      }
      return null;
    }
    // The page moved under this round: a same-named control would match silently on the new
    // page. Precedes the confirmation prompt so no one approves a refused action. Navigating
    // tools and read_page (the recovery) are exempt; the refusal names read_page, so it
    // applies only when this round offered it.
    if (
      this.#host.tools.wasAdvertised(READ_PAGE_TOOL) &&
      call.name !== READ_PAGE_TOOL &&
      !isNavigates(tool.parameters) &&
      this.#pageMoved()
    ) {
      const message = this.#host.strings().pageMoved;
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      this.#host.transcript.showPending();
      // Returned so a reload settles this card the same way; the card's status lives only in the DOM.
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
    }
    // The run is suspended on the host's predicate (it may ask a server) as on a card, so a
    // Stop or handover aborts the wait.
    const asking = this.#host.decision.open();
    const rule = await this.#confirmationRule(call, tool);
    this.#host.decision.close();
    if (asking.aborted) {
      return this.#abandoned(card);
    }
    if (rule === "unanswered") {
      // A refusal, not a recorded decision: no person was asked.
      const message = this.#host.strings().confirmCheckFailed;
      card.settle(TOOL_CALL_STATUS.DECLINED, message);
      this.#host.transcript.showPending();
      return { content: message, outcome: TOOL_OUTCOME.DENIED };
    }
    if (rule !== null) {
      const request: ConfirmationRequest = { toolName: call.name, args: call.args };
      const confirmText = tool.parameters[X_CONFIRM_KEY];
      if (typeof confirmText === "string") {
        request.message = confirmText;
      }
      // Into the turn's answer group: appending to the message list put the prompt after later streamed content.
      // A Stop while the card is open aborts the signal, declining it.
      const signal = this.#host.decision.open();
      // Asking for as long as the prompt is open, so a step row reads "waiting for you".
      card.setAsking(true);
      let accepted: boolean;
      try {
        const decision = requestConfirmation(this.#host.transcript.ensureGroup(), request, {
          signal,
          strings: this.#host.strings(),
          // Only where it can be honoured: see `#confirmationRule`.
          ...(rule === "destructive"
            ? { onAlwaysAllow: () => this.#sessionApproved.add(call.name) }
            : {}),
        });
        this.#host.transcript.updateEmptyState();
        this.#host.transcript.follow();
        accepted = await decision;
      } finally {
        card.setAsking(false);
      }
      this.#host.decision.close();
      // A handover declines the card, but the transcript is the next principal's by now.
      if (this.#host.tenure() !== tenure) {
        return null;
      }
      card.recordDecision(accepted ? "approved" : "declined");
      if (!accepted) {
        const message = this.#host.strings().declinedAction;
        card.settle(TOOL_CALL_STATUS.DECLINED, message);
        // New chat or a drawer switch declines it too: skip only the drawing, not the refusal.
        if (this.#host.conversation() === conversation) {
          this.#host.transcript.showPending();
        }
        // The outcome annotation lets a reload show a refused action as denied.
        return { content: message, outcome: TOOL_OUTCOME.DENIED };
      }
      // Confirm and Stop in the same task: not declined, but the run is over, so it does not run
      // (the server-side gate treats approve-then-Stop the same way).
      if (signal.aborted) {
        return this.#abandoned(card);
      }
    }
    // With a host `navigate()` (SPA) a navigating tool routes in-page and the loop continues.
    const navigates = isNavigates(tool.parameters) && this.#host.navigate() === null;
    if (navigates) {
      // Checkpoint before the reload; the result is supplied on the next mount via the resume path.
      this.#host.conversationStore().saveCheckpoint(threadId, { toolCallId: call.id });
    }
    try {
      const result = await tool.handler(call.args, call.id);
      // A Stop keeps the result (the action happened); a handover leaves it no one to reach.
      if (this.#host.tenure() !== tenure) {
        return null;
      }
      // Drawn from the arguments, so live and replay render the same.
      if (tool.render !== undefined) {
        this.#host.transcript.renderToolOutput(tool.render, call);
      }
      if (navigates) {
        card.settle(TOOL_CALL_STATUS.DONE, this.#host.strings().navigating);
        return { content: "", halt: true };
      }
      const content = JSON.stringify(result ?? null);
      card.settle(TOOL_CALL_STATUS.DONE, content);
      // A reset that is not a handover keeps the result but shows no run waiting there.
      if (this.#host.conversation() === conversation) {
        this.#host.transcript.showPending();
      }
      return { content };
    } catch (error) {
      // Also guards a write: after a handover the store is the next principal's.
      if (this.#host.tenure() !== tenure) {
        return null;
      }
      if (navigates) {
        // The navigation never happened; drop the checkpoint from the thread it was written to.
        this.#host.conversationStore().saveCheckpoint(threadId, null);
      }
      // Verbatim, on the card and in the result replayed to the model: a real reason lets it recover.
      const message = error instanceof Error ? error.message : String(error);
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      if (this.#host.conversation() === conversation) {
        this.#host.transcript.showPending();
      }
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
    }
  }

  /**
   * Render an approval card per server-side-tool interrupt and collect the
   * user's decisions (approve → run it, deny → decline it).
   *
   * One card per gated call, in that call's own tool card, all at once: the prompt is
   * identical for every call of a tool, so position tells them apart, and serial asking
   * hides that more are coming. Each is marked `deferred` for the wait, else it reads
   * "running...". A Stop aborts the shared decision, denying every open card. An approved
   * tool runs on the resume run into the same card; a denied one settles here.
   */
  async resolveInterrupts(
    interrupts: readonly Interrupt[],
  ): Promise<Record<string, InterruptResponse>> {
    const signal = this.#host.decision.open();
    // The transcript is not a live region, so a screen reader needs this to know the run awaits a person.
    this.#host.announce(
      fillUiString(this.#host.strings().announceAwaitingDecision, { count: interrupts.length }),
    );
    this.#host.transcript.hidePending();
    const answered = await Promise.all(
      interrupts.map(async (interrupt) => {
        const card =
          interrupt.toolCallId !== undefined
            ? this.#host.transcript.card(interrupt.toolCallId)
            : undefined;
        const request: ApprovalRequest = {};
        const phrase = confirmPhrase(interrupt) ?? interrupt.message;
        if (phrase !== undefined) {
          request.message = phrase;
        }
        const toolName = card?.element.getAttribute("data-tool-name");
        if (toolName !== null && toolName !== undefined) {
          request.toolName = toolName;
        }
        // Only where honoured: the agent accepts `editedArgs` and we hold the call's arguments.
        let editedArgs: Record<string, unknown> | undefined;
        const editable = this.#host.approveWithEdits() && card !== undefined;
        if (editable) {
          request.args = card.args;
        }
        card?.mark(TOOL_CALL_STATUS.DEFERRED);
        // Before either renderer: a folded step group has no box to focus in.
        if (card !== undefined) {
          this.#host.transcript.revealStep(card);
        }
        // Falls back to the answer group when the interrupt names no call we hold.
        const builtIn = (): Promise<boolean> =>
          requestApproval(card?.approvalSlot ?? this.#host.transcript.ensureGroup(), request, {
            signal,
            strings: this.#host.strings(),
            ...(editable
              ? {
                  onEdit: (args: Record<string, unknown>) => {
                    editedArgs = args;
                  },
                }
              : {}),
          });
        const renderer = this.#host.approvalRenderer();
        let approved: boolean;
        if (renderer === null) {
          approved = await builtIn();
        } else {
          // Awaited here, not in a helper, to keep the microtask count of an answering renderer.
          try {
            approved = await renderer.call(this.#host.element, request, { signal });
          } catch (error) {
            approved = await this.#afterRendererFailed(error, signal, interrupt.id, builtIn);
          }
        }
        // The same annotation as the client-side gate, so both read alike.
        card?.recordDecision(approved ? "approved" : "declined");
        if (approved) {
          card?.mark(TOOL_CALL_STATUS.PENDING);
        } else {
          // No TOOL_CALL_RESULT will stream for a denied tool.
          card?.settle(TOOL_CALL_STATUS.DECLINED, this.#host.strings().declinedAction);
        }
        return { id: interrupt.id, approved, editedArgs };
      }),
    );
    this.#host.transcript.updateEmptyState();
    this.#host.transcript.follow();
    this.#host.decision.close();
    const responses: Record<string, InterruptResponse> = {};
    for (const { id, approved, editedArgs } of answered) {
      // `editedArgs` rides only when changed, so "approved as proposed" differs from "approved, but like this".
      responses[id] = approved
        ? {
            status: "resolved",
            payload: editedArgs === undefined ? { approved: true } : { approved: true, editedArgs },
          }
        : { status: "cancelled" };
    }
    return responses;
  }

  /**
   * Answer an interrupt whose host renderer failed: the built-in card asks instead.
   *
   * A renderer is presentation, not a guard; uncaught, its failure would reject the whole
   * batch. A rejection after a Stop is the signal working: it resolves as not approved,
   * silently.
   */
  #afterRendererFailed(
    error: unknown,
    signal: AbortSignal,
    interruptId: string,
    builtIn: () => Promise<boolean>,
  ): Promise<boolean> {
    if (signal.aborted) {
      return Promise.resolve(false);
    }
    // Named by interrupt id: a batch can gate several calls of one tool.
    console.warn(
      `ag-ui-chat: approvalRenderer failed for interrupt ${interruptId}, so the built-in approval card asks instead`,
      error,
    );
    return builtIn();
  }

  /**
   * Which rule gates `call`, or `null` when it runs straight through, or
   * `"unanswered"` when the host's predicate threw instead of deciding.
   *
   * The rule decides whether the prompt may be waived for the session: only the default
   * `x-destructive` gate is, since `confirmPredicate` is authoritative.
   */
  async #confirmationRule(call: AgUiToolCall, tool: ClientTool): Promise<ConfirmationRule | null> {
    if (this.#host.autoConfirm()) {
      return null;
    }
    const predicate = this.#host.confirmPredicate();
    if (predicate !== null) {
      try {
        return (await predicate.call(this.#host.element, call.name, call.args)) === true
          ? "predicate"
          : null;
      } catch (error) {
        // Fails closed: a guard that cannot answer has not said the call is safe. The message
        // goes to the console, not the endpoint, since it was never written for the model.
        console.warn(
          `ag-ui-chat: confirmPredicate failed for tool ${call.name}, so the call was refused`,
          error,
        );
        return "unanswered";
      }
    }
    if (this.#sessionApproved.has(call.name)) {
      return null;
    }
    return isDestructive(tool.parameters) ? "destructive" : null;
  }

  /**
   * Settle a call whose run ended while it waited, and give the loop nothing.
   *
   * Dispatch took the card out of the end-of-run sweep, so nothing else settles it. `null`
   * because a stopped run has no next round; the client answers the call as not finished
   * on the next request, in the card's words.
   */
  #abandoned(card: ToolCallCard): null {
    card.settle(TOOL_CALL_STATUS.INTERRUPTED, this.#host.strings().callNotFinished);
    return null;
  }

  /**
   * Whether the page moved since the current round's context was built.
   *
   * `null` means no round has built context yet (nothing to compare), which is
   * not a move.
   */
  #pageMoved(): boolean {
    return this.#contextHref !== null && this.#contextHref !== window.location.href;
  }
}

/**
 * Why a client tool call is gated behind the confirmation card, or refused
 * before one is drawn.
 *
 * Only `"destructive"` -- the default `x-destructive` gate -- may be waived for
 * the session. `confirmPredicate` is documented as authoritative, so a call it
 * gates keeps asking. `"unanswered"` is a predicate that threw instead of
 * answering, and the call it was asked about is refused without a card.
 */
type ConfirmationRule = "destructive" | "predicate" | "unanswered";
