import type { AgUiAgents } from "../../agents/ag_ui_agents.js";
import type { AgentEntry } from "../../agents/types.js";
import {
  AGENT_CHANGE_EVENT,
  AGENTS_TAG,
  OPEN_EDITOR_EVENT,
  THREAD_EVENT,
} from "../../constants.js";
import type { AgUiChat } from "../../core/ag_ui_chat.js";
import type { OpenEditorDetail } from "../../core/events/open_editor_detail.js";
import { PanelView } from "../shell/panel_view.js";
import { csrfHeaders } from "./csrf_headers.js";
import { EDITOR_STYLES } from "./editor_styles.js";

/** The part of `<ag-ui-chat>` an editor element reads and drives, kept structural so no editor entry imports the chat. */
export type EditorChat = HTMLElement & Pick<AgUiChat, "request" | "switchThread">;

/** The part of `<ag-ui-agents>` an editor element reads and drives, kept structural likewise. */
export type EditorProvider = HTMLElement &
  Pick<AgUiAgents, "chat" | "agent" | "agents" | "request" | "openThread">;

/** The text every editor element draws besides its view's own. */
export interface EditorStrings {
  /** The bar's back arrow, from a form to the list. */
  readonly back: string;
}

/** `detail` shape of an editor element's open-thread event. */
export interface EditorOpenThreadDetail {
  /** The conversation to open. */
  readonly threadId: string;
}

/** The directory keys an editor element may take its URL from under a provider. */
export type EditorEntryKey = "routines_url" | "skill_editor_url";

const CREDENTIALS_MODES: readonly string[] = ["omit", "same-origin", "include"];

/**
 * The base of an editor that stands on the page as an element of its own
 * (`<ag-ui-routines>`, `<ag-ui-skills>`): an inline block that fills its
 * container, drawing the same view the chat draws in its panel.
 *
 * Bound to a chat by `for="<chat id>"` (looked up in the element's own root)
 * or by setting {@link chat}; else to the `<ag-ui-agents>` provider named by
 * `agents="<provider id>"`, or the nearest one around it, following it as it
 * moves between agents. Bound to nothing, it works alone.
 *
 * Its URL is its own attribute when set, else the bound chat's same
 * attribute, else the provider's entry for the agent on screen. Its requests
 * go through the bound chat's or provider's `request()`, so their headers and
 * cookie policy are the ones the page already set; alone, through `fetch`
 * with the `credentials` attribute (`same-origin` by default). Its own
 * `data-csrf-*` attributes are sent either way and win per header.
 */
export abstract class EditorElement<S extends EditorStrings> extends HTMLElement {
  /** The panel the editor's view draws into, filling the element. */
  protected readonly view: PanelView;
  readonly #defaults: S;
  #strings: S;
  /** The chat set by property, which wins over `for` and any provider. */
  #explicit: EditorChat | null = null;
  /** The chat the element listens on: the one bound directly, or the provider's. */
  #chat: EditorChat | null = null;
  #provider: EditorProvider | null = null;
  #root: Node | null = null;
  /** The URL the view was last opened on, so a rebind that changes nothing reloads nothing. */
  #opened: string | null = null;
  /** The chat or provider the view was opened through, so a request is never left on a route since replaced. */
  #through: EditorChat | EditorProvider | null = null;
  /** Elements found before their class was defined, each waited on once. */
  readonly #awaited = new WeakSet<Element>();

  /** The attribute holding the editor's URL, on this element and on the chat alike. */
  protected abstract readonly urlAttribute: string;
  /** The directory key the provider's entry names the URL under. */
  protected abstract readonly entryKey: EditorEntryKey;
  /** The name a chat's {@link OPEN_EDITOR_EVENT} asks for this editor by. */
  protected abstract readonly editorName: string;

  constructor(defaults: S) {
    super();
    this.#defaults = defaults;
    this.#strings = defaults;
    const root = this.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(EDITOR_STYLES);
    root.adoptedStyleSheets = [sheet];
    this.view = new PanelView(
      () => this.#strings.back,
      () => this.back(),
      { atRoot: () => this.atRoot },
    );
    root.append(this.view.element);
  }

  /** Whether the view shows its first screen, where the bar has no back arrow. */
  protected abstract get atRoot(): boolean;
  /** Step back from a form to the list. */
  protected abstract back(): void;
  /** Open the view on `url`, through {@link request}. */
  protected abstract open(url: string): void;
  /** Forget what the view held and drop any answer in flight. */
  protected abstract reset(): void;
  /** The bound chat asked for this editor ({@link OPEN_EDITOR_EVENT}); the element has focus already. */
  protected abstract asked(detail: OpenEditorDetail): void;

  /** Events of the bound chat the subclass reacts to, added and removed with the binding. */
  protected abstract chatEvents(): readonly (readonly [string, (event: Event) => void])[];

  /**
   * The chat this element is bound to: the one set here or named by `for`,
   * else its provider's. Setting it binds to that element, over `for`.
   */
  get chat(): EditorChat | null {
    return this.#chat;
  }

  set chat(chat: EditorChat | null) {
    this.#explicit = chat;
    this.#bind();
  }

  /** The provider this element follows, while it binds through one. */
  get provider(): EditorProvider | null {
    return this.#provider;
  }

  /** The text the element draws, merged over the English defaults. */
  get strings(): S {
    return this.#strings;
  }

  set strings(strings: Partial<S>) {
    this.#strings = { ...this.#defaults, ...strings };
    this.reload();
  }

  /** The URL the editor reads: its own attribute, else the bound chat's, else the provider's entry. */
  get url(): string | null {
    const own = this.getAttribute(this.urlAttribute);
    if (own !== null && own !== "") {
      return own;
    }
    if (this.#direct) {
      const chats = this.#chat?.getAttribute(this.urlAttribute) ?? null;
      return chats === "" ? null : chats;
    }
    const provider = this.#provider;
    const entry: AgentEntry | undefined = provider?.agents.find(
      (agent) => agent.id === provider.agent,
    );
    return entry?.[this.entryKey] ?? null;
  }

  /** The cookie policy of a request made alone, as on `<ag-ui-chat>`; `same-origin` when unset. */
  get credentials(): RequestCredentials {
    const mode = this.getAttribute("credentials");
    return mode !== null && CREDENTIALS_MODES.includes(mode)
      ? (mode as RequestCredentials)
      : "same-origin";
  }

  connectedCallback(): void {
    this.#root = this.getRootNode();
    this.#root.addEventListener(THREAD_EVENT, this.#onRootThread);
    this.#bind();
  }

  disconnectedCallback(): void {
    this.#root?.removeEventListener(THREAD_EVENT, this.#onRootThread);
    this.#root = null;
    this.#follow(null);
    this.#listen(null);
    this.#close();
  }

  attributeChangedCallback(): void {
    this.#bind();
  }

  /** Read the editor's URL again from the start: the list loaded fresh, an open form dropped. */
  reload(): void {
    this.#close();
    this.#load();
  }

  /**
   * `fetch(url, init)` as this element authenticates: through the bound
   * chat's or provider's `request()`, or alone with {@link credentials}; its
   * own `data-csrf-*` header set over `init.headers` either way.
   */
  request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(csrfHeaders(this))) {
      headers.set(name, value);
    }
    const sent = { ...init, headers };
    const through = this.#route;
    if (through !== null) {
      return through.request(url, sent);
    }
    return fetch(url, { ...sent, credentials: init.credentials ?? this.credentials });
  }

  /**
   * Fire `type` for `threadId`, cancelable, then, unless a host prevented it,
   * open the thread in the bound chat or through the provider.
   */
  protected openThread(type: string, threadId: string): void {
    const proceed = this.dispatchEvent(
      new CustomEvent<EditorOpenThreadDetail>(type, {
        detail: { threadId },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (!proceed) {
      return;
    }
    const provider = this.#provider;
    if (this.#direct) {
      this.#chat?.switchThread(threadId).catch(() => undefined);
    } else if (provider !== null && provider.agent !== null) {
      provider.openThread(provider.agent, threadId).catch(() => undefined);
    }
  }

  /** Whether the element is bound to a chat itself (property or `for`), not through a provider. */
  get #direct(): boolean {
    return this.#explicit !== null || this.hasAttribute("for");
  }

  /** What its requests go through now: the bound chat, or the provider, else nothing (alone). */
  get #route(): EditorChat | EditorProvider | null {
    return this.#direct ? this.#chat : this.#provider;
  }

  #bind(): void {
    if (this.#root === null) {
      return;
    }
    this.#follow(this.#direct ? null : this.#findProvider());
    this.#listen(this.#explicit === null ? this.#lookup() : this.#upgraded(this.#explicit));
    this.#load();
  }

  #load(): void {
    if (this.#root === null) {
      return;
    }
    const url = this.url;
    const route = this.#route;
    if (url === this.#opened && route === this.#through) {
      return;
    }
    this.#close();
    this.#opened = url;
    this.#through = route;
    if (url !== null) {
      this.open(url);
    }
  }

  #close(): void {
    this.reset();
    this.view.close();
    this.#opened = null;
    this.#through = null;
  }

  /** `found` once defined; before that, nothing, and a bind when it is (never, for a plain tag). */
  #upgraded<T extends HTMLElement>(found: T | null): T | null {
    if (found === null || typeof (found as Partial<EditorChat>).request === "function") {
      return found;
    }
    if (found.localName.includes("-") && !this.#awaited.has(found)) {
      this.#awaited.add(found);
      void customElements.whenDefined(found.localName).then(() => this.#bind());
    }
    return null;
  }

  #lookup(): EditorChat | null {
    const id = this.getAttribute("for");
    if (id === null) {
      return this.#upgraded((this.#provider?.chat ?? null) as EditorChat | null);
    }
    return this.#upgraded(
      (this.#root as Document | ShadowRoot).getElementById(id) as EditorChat | null,
    );
  }

  /** The provider named by `agents`, else the nearest `<ag-ui-agents>` around the element. */
  #findProvider(): EditorProvider | null {
    const id = this.getAttribute("agents");
    if (id === null) {
      return this.#upgraded(this.closest<EditorProvider>(AGENTS_TAG));
    }
    return this.#upgraded(
      (this.#root as Document | ShadowRoot).getElementById(id) as EditorProvider | null,
    );
  }

  #follow(provider: EditorProvider | null): void {
    if (provider === this.#provider) {
      return;
    }
    this.#provider?.removeEventListener(AGENT_CHANGE_EVENT, this.#onAgentChange);
    this.#provider = provider;
    provider?.addEventListener(AGENT_CHANGE_EVENT, this.#onAgentChange);
  }

  #listen(chat: EditorChat | null): void {
    if (chat === this.#chat) {
      return;
    }
    for (const target of [this.#chat, chat]) {
      if (target === null) {
        continue;
      }
      const add = target === chat;
      for (const [type, handler] of [
        [OPEN_EDITOR_EVENT, this.#onAsked] as const,
        ...this.chatEvents(),
      ]) {
        if (add) {
          target.addEventListener(type, handler);
        } else {
          target.removeEventListener(type, handler);
        }
      }
    }
    this.#chat = chat;
  }

  /** The provider moved its chat to another agent: another agent's URL, so the list again. */
  readonly #onAgentChange = (): void => {
    this.#bind();
  };

  /** A chat that was not there when the element connected, reporting in. */
  readonly #onRootThread = (): void => {
    if (this.#chat === null || !this.#chat.isConnected) {
      this.#bind();
    }
  };

  readonly #onAsked = (event: Event): void => {
    const detail = (event as CustomEvent<OpenEditorDetail>).detail;
    if (event.defaultPrevented || detail.editor !== this.editorName) {
      return;
    }
    event.preventDefault();
    this.view.focusHeading();
    this.asked(detail);
  };
}
