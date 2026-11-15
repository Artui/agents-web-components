/**
 * What an {@link ActivityRenderer} is told besides the content: which message
 * it is drawing, what it drew for that message last, and whether the draw comes
 * from the run in flight or from a stored conversation being put back.
 */
export interface ActivityRenderContext {
  /** The activity message's id, the same across every draw of one activity. */
  readonly messageId: string;
  /**
   * The node this renderer returned for {@link messageId} last, still on
   * screen, or `null` on the first draw. Returning it, updated in place, keeps
   * it where it is: focus, a typed value and a scroll position survive.
   */
  readonly previous: Node | null;
  /**
   * `true` when the draw comes from the current run's stream, `false` when it
   * replays a stored conversation (a reload, a thread picked from the drawer, a
   * retry redrawing what came before). A surface drawn with `live: false` must
   * be inert, since acting on it would send an action from a turn long past,
   * once per thread load.
   */
  readonly live: boolean;
}
