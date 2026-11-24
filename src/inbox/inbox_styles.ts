// The inbox's shadow stylesheet. Public --ag-ui-* tokens are read into --_*
// aliases on :host only, as the thread list does, so a theme set on an ancestor
// reaches it too. It sets no color-scheme: it sits in the host's own chrome.
export const INBOX_STYLES: string = `
:host {
  --_fg: var(--ag-ui-fg, light-dark(#1b1b1d, #ececee));
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #161618));
  --_accent: var(--ag-ui-accent, light-dark(#232326, #f0f0f2));
  --_ink-3: var(--ag-ui-ink-3, color-mix(in oklch, var(--_fg) 64%, var(--_bg)));
  --_line: var(--ag-ui-line, color-mix(in oklch, var(--_fg) 11%, var(--_bg)));
  --_hover: var(--ag-ui-hover, color-mix(in oklch, var(--_fg) 6%, var(--_bg)));
  --_ring: var(--ag-ui-ring, color-mix(in oklch, var(--_accent) 40%, var(--_fg)));
  --_danger: var(--ag-ui-danger, light-dark(#b42318, #f97066));
  --_waiting: var(--ag-ui-waiting, light-dark(#b54708, #fdb022));
  --_radius: var(--ag-ui-radius, 8px);
  --_font: var(--ag-ui-font, inherit);
  position: relative;
  display: inline-block;
  box-sizing: border-box;
  min-width: 0;
  color: var(--_fg);
  font: 14px/1.35 var(--_font);
}
:host([variant="list"]) {
  display: block;
}
:host([hidden]) {
  display: none;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
.badge[hidden],
.panel[hidden],
.count[hidden],
.list[hidden],
.empty[hidden] {
  display: none;
}
.badge {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--_radius);
  background: none;
  color: inherit;
  cursor: pointer;
}
.badge:hover,
.badge[aria-expanded="true"] {
  background: var(--_hover);
}
.badge svg {
  width: 20px;
  height: 20px;
}
.count {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-end: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--_waiting);
  color: var(--_bg);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.panel {
  position: absolute;
  z-index: calc(var(--ag-ui-z-index, 2147483000) + 1);
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  width: min(22rem, calc(100vw - 16px));
  max-height: min(28rem, 70vh);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--_line);
  border-radius: calc(var(--_radius) + 2px);
  background: var(--_bg);
  color: var(--_fg);
  box-shadow: 0 8px 24px color-mix(in oklch, var(--_fg) 18%, transparent);
}
:host([variant="list"]) .panel {
  position: static;
  width: auto;
  max-height: none;
  overflow: visible;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  box-shadow: none;
}
.heading {
  margin: 0;
  padding: 6px 10px 4px;
  color: var(--_ink-3);
  font-size: 12px;
  font-weight: 600;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  min-width: 0;
  border-radius: var(--_radius);
}
.row:hover {
  background: var(--_hover);
}
.row-main {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 2px;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: inherit;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 10px 8px 28px;
}
.action {
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid var(--_line);
  border-radius: calc(var(--_radius) - 2px);
  background: var(--_bg);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.approve {
  border-color: transparent;
  background: var(--_accent);
  color: var(--_bg);
}
.action:disabled {
  opacity: 0.55;
  cursor: default;
}
.answer-error {
  flex-basis: 100%;
  margin: 0;
  color: var(--_danger);
  font-size: 13px;
}
.badge:focus-visible,
.panel:focus-visible,
.row-main:focus-visible,
.action:focus-visible {
  outline: 2px solid var(--_ring);
  outline-offset: -2px;
}
.mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--_waiting);
}
.title,
.summary {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.title {
  font-weight: 600;
}
.agent {
  color: var(--_ink-3);
  font-weight: 400;
}
.summary {
  grid-column: 2;
  color: var(--_ink-3);
  font-size: 13px;
}
.kind {
  color: var(--_waiting);
  font-weight: 600;
}
.destructive {
  color: var(--_danger);
  font-weight: 600;
}
.empty {
  display: block;
  margin: 0;
  padding: 8px 10px;
  color: var(--_ink-3);
}
`;
