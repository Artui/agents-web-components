import { ROUTINES_OPEN_THREAD_EVENT, RUN_FINISHED_EVENT, THREAD_EVENT } from "../constants.js";
import type { OpenEditorDetail } from "../core/events/open_editor_detail.js";
import { RoutinesClient } from "../ui/routines/routines_client.js";
import { RoutinesView } from "../ui/routines/routines_view.js";
import { EditorElement } from "../ui/standalone/editor_element.js";
import { DEFAULT_AG_UI_ROUTINES_STRINGS } from "./routines_element_strings.js";
import type { AgUiRoutinesStrings, RoutinesChat } from "./types.js";

/**
 * `<ag-ui-routines>`: the caller's routines as an element of its own, for a
 * page that places them away from the chat: the list with each schedule,
 * next run and last result, Pause or Resume and Run now, and the form to
 * create or edit one. The same view `<ag-ui-chat>` opens in its panel.
 *
 * Reads `data-routines-url` (django-ag-ui's routines editor), its own or the
 * bound chat's; bound as every editor element is (see {@link EditorElement}).
 * Bound to a chat, Make this a routine fills a new routine from that chat's
 * conversation, and a last result opens its thread there; alone, the first is
 * absent and the second is the {@link ROUTINES_OPEN_THREAD_EVENT} alone.
 */
export class AgUiRoutines extends EditorElement<AgUiRoutinesStrings> {
  static readonly observedAttributes = ["for", "agents", "data-routines-url"];

  protected readonly urlAttribute = "data-routines-url";
  protected readonly entryKey = "routines_url";
  protected readonly editorName = "routines";
  readonly #routines: RoutinesView;
  #client: RoutinesClient | null = null;

  constructor() {
    super(DEFAULT_AG_UI_ROUTINES_STRINGS);
    this.#routines = new RoutinesView({
      view: this.view,
      element: this,
      strings: () => this.strings,
      fromConversation: () => (this.chat as RoutinesChat | null)?.routineSeed() ?? null,
      onOpenThread: (threadId) => this.openThread(ROUTINES_OPEN_THREAD_EVENT, threadId),
      onClose: () => undefined,
    });
  }

  /**
   * Open a new routine's form filled from the bound chat's conversation, as
   * the chat's Make this a routine does; with nothing bound or nothing said
   * yet, the list.
   */
  makeRoutine(): void {
    const client = this.#client;
    if (client !== null) {
      this.#routines.openFromConversation(client);
    }
  }

  protected get atRoot(): boolean {
    return this.#routines.atRoot;
  }

  protected back(): void {
    this.#routines.back();
  }

  protected open(url: string): void {
    this.#client = new RoutinesClient(url, (to, init) => this.request(to, init));
    this.#routines.open(this.#client);
  }

  protected reset(): void {
    this.#routines.reset();
    this.#client = null;
  }

  protected asked(detail: OpenEditorDetail): void {
    if (detail.fromConversation) {
      this.makeRoutine();
    }
  }

  protected override chatEvents(): readonly (readonly [string, (event: Event) => void])[] {
    return [
      [THREAD_EVENT, this.#onConversation],
      [RUN_FINISHED_EVENT, this.#onConversation],
    ];
  }

  /** The bound chat's conversation moved on: Make this a routine follows it. */
  readonly #onConversation = (): void => {
    this.#routines.refresh();
  };
}
