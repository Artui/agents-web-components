import { X_SUMMARY_KEY } from "../constants.js";
import type { CollapseTarget } from "../ui/placement/surface_for.js";
import type { ClientTool } from "./client_tool_registry.js";

/** Every corner the panel can be sent to, in the order the schema states them. */
export const CHAT_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** A corner the panel can be sent to. */
export type ChatCorner = (typeof CHAT_CORNERS)[number];

/** What the agent is told about the surface it is speaking from. */
export interface ChatSurfaceReport {
  /** The placement in force, or `null` when the host set none. */
  readonly placement: string | null;
  /**
   * What the panel collapses to: `launcher`, `rail`, `header`, `bar` (the
   * bottom bar it rises from), `none` (hidden, brought back by the host's own
   * control), or `null` when it cannot collapse.
   */
  readonly collapseTo: CollapseTarget;
  /** Whether the panel is currently collapsed. */
  readonly collapsed: boolean;
  /** Whether this placement has a collapsed state at all. */
  readonly collapsible: boolean;
  /**
   * Whether the reader maximized the panel with its header control. Read-only:
   * no tool changes it, and it is not kept across a reload.
   */
  readonly maximized: boolean;
  /** Whether the panel can be moved, or the placement owns its position. */
  readonly movable: boolean;
  /**
   * Whether this page allows the panel to be moved at all: true for every
   * placement unless the host set `data-launcher-drag="false"`. It is the
   * page's setting alone and does not vary with the placement or `collapse-to`;
   * whether this panel moves is {@link ChatSurfaceReport.movable}. Kept apart because
   * the two refusals need different sentences.
   */
  readonly draggable: boolean;
  /** Whether the panel currently covers the whole viewport. */
  readonly fullBleed: boolean;
  /** The panel's box, in viewport coordinates. */
  readonly box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * The part of the viewport the panel may rest in, with an origin: a host can reserve
   * edges for its own chrome, so it is not always the screen's.
   */
  readonly viewport: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Whether a string names one of the four corners. */
export function isChatCorner(value: string): value is ChatCorner {
  return (CHAT_CORNERS as readonly string[]).includes(value);
}

/** The part of the widget these tools drive: a port, since the element imports this module. */
export interface ChatSurface {
  describeSurface(): ChatSurfaceReport;
  /** `announce` writes a transcript notice with an undo; the tools always pass it. */
  moveTo(corner: ChatCorner, options?: { readonly announce?: boolean }): boolean;
  setCollapsed(collapsed: boolean, options?: { readonly announce?: boolean }): void;
}

/**
 * Tools that let the agent move or collapse the panel it is speaking from.
 *
 * They report what happened, not what was asked: `move_chat` answers `moved: false`
 * with the reason when the panel cannot move, rather than succeeding on a panel that
 * did not budge.
 */
export function createChatSurfaceTools(surface: ChatSurface): ClientTool[] {
  return [
    {
      name: "read_chat_surface",
      description:
        "Describe the chat panel you are speaking from: its placement, whether it is " +
        "collapsed, whether it can be moved, and the box it occupies. Read this before " +
        "moving or minimising yourself, since a full-screen panel has nowhere to move to. " +
        "Read-only.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Read the chat's own position",
      },
      handler: () => surface.describeSurface(),
    },
    {
      name: "move_chat",
      description:
        "Move your own panel to a corner, to uncover something the user needs to see. " +
        "`corner` is top-left, top-right, bottom-left or bottom-right. Answers " +
        "`moved: false` with a reason when the placement owns its position or the panel " +
        "fills the screen; check `read_chat_surface` first, and prefer minimise_chat when " +
        "there is nowhere to move to.",
      parameters: {
        type: "object",
        properties: {
          corner: {
            type: "string",
            enum: [...CHAT_CORNERS],
          },
        },
        required: ["corner"],
        [X_SUMMARY_KEY]: "Move the chat out of the way",
      },
      handler: (args) => {
        const asked = String(args["corner"] ?? "");
        const report = surface.describeSurface();
        // `required` is advisory: an unknown corner would send the panel bottom-right yet report success.
        if (!isChatCorner(asked)) {
          return {
            moved: false,
            reason: `"${asked}" is not a corner; use one of ${CHAT_CORNERS.join(", ")}`,
          };
        }
        if (!report.movable) {
          // A fact the agent can act on (minimise instead), not a malformed call.
          return {
            moved: false,
            reason: report.fullBleed
              ? "the panel fills the screen, so there is nowhere to move it to"
              : report.draggable === false
                ? "this page has turned off moving the panel"
                : `the "${report.placement ?? ""}" placement owns the panel's position`,
            suggestion: report.collapsible ? "minimise_chat" : null,
          };
        }
        return { moved: surface.moveTo(asked, { announce: true }), corner: asked };
      },
    },
    {
      name: "minimise_chat",
      description:
        "Collapse your own panel, so the user can see the whole page. The user reopens " +
        "it from where it collapsed to (a launcher, a rail, a bottom bar or the page's " +
        "own control). Answers `minimised: false` when the placement has no collapsed " +
        "state, which is the case for a full-page chat.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Minimise the chat",
      },
      handler: () => {
        const report = surface.describeSurface();
        if (!report.collapsible) {
          return {
            minimised: false,
            reason: "this placement has no collapsed state, so there is nothing to minimise to",
          };
        }
        surface.setCollapsed(true, { announce: true });
        return { minimised: true };
      },
    },
    {
      name: "restore_chat",
      description: "Open your own panel again after minimising it.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Restore the chat",
      },
      handler: () => {
        // No notice: the user sees the panel come back.
        surface.setCollapsed(false);
        return { restored: true };
      },
    },
  ];
}
