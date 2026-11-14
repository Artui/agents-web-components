import { HIGHLIGHT_OVERLAY_Z_INDEX } from "../constants.js";
import { ringColor } from "./ring_color.js";

/** How the overlay is drawn around the element being pointed at. */
export interface HighlightOverlayOptions {
  /** Dim everything except the target. Default false. */
  readonly scrim?: boolean;
  /** Draw the ring as a moving gradient rather than a flat colour. Default false. */
  readonly gradient?: boolean;
  /**
   * Ring colour, and the flat fallback for the gradient. Default:
   * `--ag-ui-highlight-ring-color` on the target, then on the chat, then the
   * target's `--ag-ui-accent`, then the chat's accent, held to 3:1 against the
   * surface behind the target.
   */
  readonly color?: string;
  /** The chat whose ring colour and accent to use. Default: the latest connected. */
  readonly chat?: HTMLElement;
  /** Gap between the target's box and the ring. Default 4. */
  readonly padding?: number;
  /** Corner radius of the cut-out and the ring. Default: the target's own. */
  readonly radius?: number;
  /** Ring thickness. Default 3, or `--ag-ui-highlight-ring-width` on the target. */
  readonly ringWidth?: number;
  /** One pass of the gradient. Default 2400, or `--ag-ui-highlight-flow-ms`. */
  readonly flowMs?: number;
}

/**
 * Read a `--ag-ui-*` token from the target, not the overlay: the overlay sits in the body, so
 * a host that themes the widget on `ag-ui-chat` or a wrapper would never reach a `var()` there.
 */
function tokenOn(target: HTMLElement, name: string, fallback: string): string {
  const value = window.getComputedStyle(target).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

/** Default gap between the target's border box and the ring around it. */
const DEFAULT_PADDING_PX = 4;

/**
 * Draw an overlay that points at `target`, and return a function that removes it.
 *
 * An overlay rather than a style on the target: a flat highlight is an `outline` so an
 * `overflow: hidden` ancestor cannot clip it, but an outline takes a colour, never a
 * gradient, and a dim needs a surface larger than the target. Nothing here is a descendant
 * of the target, so none of it is clipped.
 *
 * It is inert: it never takes a pointer event, so the driver can still click what it
 * just pointed at.
 *
 * It follows: the cut-out is recomputed on scroll and resize.
 */
export function showHighlightOverlay(
  target: HTMLElement,
  options: HighlightOverlayOptions = {},
): () => void {
  const root = document.createElement("div");
  root.setAttribute("data-ag-ui-highlight", "");
  // Decoration: the agent's message is what announces that the element matters.
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position: fixed",
    "inset: 0",
    "pointer-events: none",
    // Above the widget's own default, since it points at the page the widget sits over.
    `z-index: ${tokenOn(target, "--ag-ui-highlight-z-index", String(HIGHLIGHT_OVERLAY_Z_INDEX))}`,
  ].join(";");

  const scrim = document.createElement("div");
  const ring = document.createElement("div");
  // Classes, since `::part` cannot reach the host document.
  root.className = "ag-ui-highlight";
  scrim.className = "ag-ui-highlight-scrim";
  ring.className = "ag-ui-highlight-ring";
  if (options.scrim === true) {
    root.append(scrim);
  }
  root.append(ring);

  const ringWidth =
    options.ringWidth ?? Number.parseFloat(tokenOn(target, "--ag-ui-highlight-ring-width", "3"));
  const flowMs =
    options.flowMs ?? Number.parseFloat(tokenOn(target, "--ag-ui-highlight-flow-ms", "2400"));

  const paint = (): void => {
    const box = target.getBoundingClientRect();
    const pad = options.padding ?? DEFAULT_PADDING_PX;
    // No fallback for an unparseable radius: it always resolves for an element in the document.
    const radius = options.radius ?? Number.parseFloat(getComputedStyle(target).borderRadius);
    const left = box.left - pad;
    const top = box.top - pad;
    const width = box.width + pad * 2;
    const height = box.height + pad * 2;

    if (options.scrim === true) {
      // One element with a hole; the opposite winding makes evenodd treat the inside as outside.
      scrim.style.cssText = [
        "position: absolute",
        "inset: 0",
        `background: ${tokenOn(target, "--ag-ui-highlight-scrim", "rgba(15, 15, 25, 0.45)")}`,
        `clip-path: path(evenodd, '${holePath(left, top, width, height, radius + pad)}')`,
      ].join(";");
    }

    ring.style.cssText = [
      "position: absolute",
      `left: ${left}px`,
      `top: ${top}px`,
      `width: ${width}px`,
      `height: ${height}px`,
      `border-radius: ${radius + pad}px`,
      `border: ${ringWidth}px solid transparent`,
      "box-sizing: border-box",
      ringPaint(target, options),
    ].join(";");
  };

  paint();
  // Animated from script: a keyframe would mean injecting a rule into the host stylesheet,
  // which is module-level state. Reduced motion draws the gradient but stops it travelling.
  let flow: Animation | null = null;
  if (options.gradient === true && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    flow = ring.animate([{ backgroundPosition: "100% 0" }, { backgroundPosition: "-100% 0" }], {
      duration: flowMs,
      iterations: Number.POSITIVE_INFINITY,
      easing: "linear",
    });
  }
  // Capture reaches a scroll in any container; passive, as this only reads geometry.
  const listen = { capture: true, passive: true } as const;
  window.addEventListener("scroll", paint, listen);
  window.addEventListener("resize", paint, listen);
  document.body.appendChild(root);

  return () => {
    window.removeEventListener("scroll", paint, listen);
    window.removeEventListener("resize", paint, listen);
    // An infinite animation never finishes, so cancel it rather than rely on the engine dropping it.
    flow?.cancel();
    root.remove();
  };
}

/**
 * A caller's colour, or `null` if it is not one: the value is joined into a `;`-separated
 * `cssText`, so a string carrying a semicolon would write further declarations, and the
 * colour can come from the agent.
 */
function safeColor(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return CSS.supports("color", value) ? value : null;
}

/** The ring's paint: a flat border, or a gradient masked to the frame (border box less padding box). */
function ringPaint(target: HTMLElement, options: HighlightOverlayOptions): string {
  const color = safeColor(options.color) ?? ringColor(target, options.chat);
  if (options.gradient !== true) {
    return `border-color: ${color}`;
  }
  const image = tokenOn(
    target,
    "--ag-ui-highlight-gradient",
    `linear-gradient(115deg, transparent 20%, ${color} 50%, transparent 80%)`,
  );
  const mask = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
  return [
    `background-image: ${image}`,
    "background-origin: border-box",
    "background-size: 300% 100%",
    `-webkit-mask: ${mask}`,
    `mask: ${mask}`,
    "-webkit-mask-composite: xor",
    "mask-composite: exclude",
    "background-position: 50% 0",
  ].join(";");
}

/**
 * A viewport-sized rectangle with a rounded rectangle cut out, as a path for
 * `clip-path: path(evenodd, ...)`. Absolute commands, closed explicitly: an unparseable
 * `clip-path` is dropped silently and the scrim would cover the target.
 */
function holePath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  const outer = `M 0 0 H ${window.innerWidth} V ${window.innerHeight} H 0 Z`;
  const hole = [
    `M ${x + r} ${y}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${y + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${bottom - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
  return `${outer} ${hole}`;
}
