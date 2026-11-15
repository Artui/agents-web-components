import type { ActivityRenderContext } from "./activity_render_context.js";

/**
 * Draw one activity, from its content and the context it is drawn in.
 *
 * The contract is {@link ClientTool.render}'s, and for the same reason rather
 * than by analogy. An activity is materialised into a `role: "activity"`
 * message, persisted with the transcript, and re-fired on every restore -- so a
 * renderer that writes to the page instead of returning DOM fires again on
 * every thread load, which is exactly the bug the tool registry's purity rule
 * was written to make unmakeable.
 *
 * - a pure function of the content and the context -- no host state, no
 *   network, no clock;
 * - deterministic, so a reload reproduces what was there before;
 * - free of effects outside the node it returns, which the component places.
 *
 * `context.previous` is the node drawn for the same message id last. A
 * renderer may update it in place and return it, and the component then leaves
 * it where it is rather than replacing it, so a surface the user is typing into
 * keeps its value and its focus across a redraw. Returning a new node replaces
 * the old one, as a one-argument renderer always does.
 *
 * **A surface drawn with `context.live` false must be inert**: no button that
 * acts, every input disabled. A restored surface is redrawn on every thread
 * load, so a control on it that sends something would re-send an action from a
 * turn the conversation has moved past.
 *
 * Return `null` for content that could not be drawn. Anything already drawn
 * under that message id is then removed, with a console warning: live and
 * reload should agree, and the stored content is the version that could not be
 * drawn.
 *
 * Return an empty `DocumentFragment` for content that is fine and has nothing
 * to show, by design (a record meant for the model, a message list with no user
 * text). Nothing is drawn, nothing is logged, the type is not reported in
 * `unhandledActivityTypes`, and anything drawn under that message id before is
 * removed. A registration whose renderer always does this is how a type is
 * known and deliberately drawn as nothing.
 */
export type ActivityRenderer = (content: unknown, context: ActivityRenderContext) => Node | null;
