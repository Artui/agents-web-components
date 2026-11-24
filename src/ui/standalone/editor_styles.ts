import { ROUTINES_STYLES } from "../routines/routines_styles.js";
import { PANEL_VIEW_STYLES } from "../shell/panel_view_styles.js";
import { SKILL_EDITOR_STYLES } from "../skill_editor/skill_editor_styles.js";

// An editor element's shadow stylesheet: its own token block, then the very
// modules the chat draws the same views with, so the two cannot drift apart.
// Public --ag-ui-* tokens are read into --_* aliases on :host only, as the
// inbox and the thread list do, and every alias the modules use is declared
// here (a Chromium test holds that), so none inherits from the host page. It
// sets no color-scheme of its own: it sits in the host's page and follows the
// page's scheme unless the theme attribute names one.
const HOST_STYLES = `
:host {
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #161618));
  --_fg: var(--ag-ui-fg, light-dark(#1b1b1d, #ececee));
  --_accent: var(--ag-ui-accent, light-dark(#232326, #f0f0f2));
  --_ink-3: var(--ag-ui-ink-3, color-mix(in oklch, var(--_fg) 64%, var(--_bg)));
  --_line: var(--ag-ui-line, color-mix(in oklch, var(--_fg) 11%, var(--_bg)));
  --_wash: var(--ag-ui-wash, color-mix(in oklch, var(--_fg) 4.5%, var(--_bg)));
  --_ring: var(--ag-ui-ring, color-mix(in oklch, var(--_accent) 40%, var(--_fg)));
  --_hover: var(--ag-ui-hover, color-mix(in oklch, var(--_fg) 6%, var(--_bg)));
  --_input-bg: var(--ag-ui-input-bg, var(--_bg));
  --_border: var(--ag-ui-border, var(--_line));
  --_muted: var(--ag-ui-muted, var(--_ink-3));
  --_danger: var(--ag-ui-danger, light-dark(#b91c1c, #f87171));
  --_on-accent: var(--ag-ui-on-accent, light-dark(#ffffff, #111111));
  --_font: var(--ag-ui-font, Inter, ui-sans-serif, system-ui, sans-serif);
  --_code-font: var(--ag-ui-code-font, ui-monospace, "SF Mono", Menlo, monospace);
  --_text-xs: var(--ag-ui-text-xs, 11.5px);
  --_text-sm: var(--ag-ui-text-sm, 12.5px);
  --_text-md: var(--ag-ui-text-md, 14px);
  --_glyph-size: var(--ag-ui-glyph-size, 18px);
  --_glyph-stroke: var(--ag-ui-glyph-stroke, 1.75);
  --_header-btn-size: var(--ag-ui-header-btn-size, 30px);
  --_header-btn-hover: var(--ag-ui-header-btn-hover, var(--_hover));
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  background: var(--_bg);
  color: var(--_fg);
  font: var(--_text-md) / 1.45 var(--_font);
}

:host([hidden]) {
  display: none;
}

:host([theme~="light"]) {
  color-scheme: light;
}

:host([theme~="dark"]) {
  color-scheme: dark;
}

:host([theme~="auto"]) {
  color-scheme: light dark;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

/* The bar's controls, as the chat's header draws them. */
.header-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--_header-btn-size);
  height: var(--_header-btn-size);
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.85;
}

.header-btn:hover {
  opacity: 1;
  background: var(--_header-btn-hover);
}

/* The first screen has no back arrow; the display above beats the user-agent rule. */
.header-btn[hidden] {
  display: none;
}

.glyph {
  width: var(--_glyph-size);
  height: var(--_glyph-size);
  fill: none;
  stroke: currentColor;
  stroke-width: var(--_glyph-stroke);
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The heading takes focus only when the element is asked to show itself. */
.panel-view-title:focus:not(:focus-visible) {
  outline: none;
}
`;

export const EDITOR_STYLES: string = [
  HOST_STYLES,
  PANEL_VIEW_STYLES,
  SKILL_EDITOR_STYLES,
  ROUTINES_STYLES,
].join("");
