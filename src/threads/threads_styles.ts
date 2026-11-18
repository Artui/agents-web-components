// The list's shadow stylesheet. Public --ag-ui-* tokens are read into --_*
// aliases on :host only, as the chat's token styles do, so a theme set on an
// ancestor reaches the list too.
export const THREADS_STYLES: string = `
:host {
  color-scheme: light dark;
  --_fg: var(--ag-ui-fg, light-dark(#1b1b1d, #ececee));
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #161618));
  --_accent: var(--ag-ui-accent, light-dark(#232326, #f0f0f2));
  --_ink-3: var(--ag-ui-ink-3, color-mix(in oklch, var(--_fg) 64%, var(--_bg)));
  --_line: var(--ag-ui-line, color-mix(in oklch, var(--_fg) 11%, var(--_bg)));
  --_hover: var(--ag-ui-hover, color-mix(in oklch, var(--_fg) 6%, var(--_bg)));
  --_ring: var(--ag-ui-ring, color-mix(in oklch, var(--_accent) 40%, var(--_fg)));
  --_danger: var(--ag-ui-danger, light-dark(#b42318, #f97066));
  --_radius: var(--ag-ui-radius, 8px);
  --_font: var(--ag-ui-font, inherit);
  display: block;
  box-sizing: border-box;
  min-width: 0;
  color: var(--_fg);
  font: 14px/1.35 var(--_font);
}
:host([hidden]) {
  display: none;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
.list[hidden],
.empty[hidden],
.confirm[hidden],
.row-main[hidden],
.delete[hidden] {
  display: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  border-radius: var(--_radius);
}
.row:hover,
.row[data-active] {
  background: var(--_hover);
}
.row-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: inherit;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.row-main:focus-visible,
.delete:focus-visible,
.confirm button:focus-visible {
  outline: 2px solid var(--_ring);
  outline-offset: -2px;
}
.title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.row[data-active] .title {
  font-weight: 600;
}
.delete {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-inline-end: 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--_ink-3);
  font: inherit;
  cursor: pointer;
  opacity: 0;
}
.row:hover .delete,
.row:focus-within .delete {
  opacity: 1;
}
.delete:hover {
  color: var(--_danger);
}
.confirm {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 10px;
}
.confirm span {
  flex: 1 1 auto;
}
.confirm button {
  padding: 3px 10px;
  border: 1px solid var(--_line);
  border-radius: 6px;
  background: var(--_bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.confirm .yes {
  border-color: var(--_danger);
  color: var(--_danger);
}
.empty {
  display: block;
  padding: 8px 10px;
  color: var(--_ink-3);
}
:host([variant="pills"]) .list {
  flex-direction: row;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}
:host([variant="pills"]) .row {
  flex: none;
  max-width: 14rem;
  border: 1px solid var(--_line);
  border-radius: 999px;
}
:host([variant="pills"]) .row[data-active] {
  border-color: var(--_accent);
}
:host([variant="pills"]) .row-main {
  gap: 6px;
  padding: 4px 12px;
}
:host([variant="pills"]) .delete {
  width: 22px;
  height: 22px;
  margin-inline: -6px 4px;
  border-radius: 50%;
}
:host([variant="pills"]) .row[data-confirming] {
  max-width: none;
}
:host([variant="pills"]) .confirm {
  flex-wrap: nowrap;
  padding: 3px 4px 3px 12px;
  white-space: nowrap;
}
:host([variant="pills"]) .confirm button {
  padding: 1px 8px;
  border-radius: 999px;
}
`;
