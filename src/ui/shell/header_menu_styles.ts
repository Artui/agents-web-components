// The header's More menu: the controls the row has no room for, as labelled rows.
export const HEADER_MENU_STYLES: string = `
/* A sibling of the header rather than inside it, so a press on its padding never
   starts a panel drag; placed under the header by an inline inset the menu sets
   as it opens. */
.header-menu {
  position: absolute;
  inset-inline-end: 8px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  max-width: calc(100% - 16px);
  padding: 4px;
  border: 1px solid var(--_border);
  border-radius: 8px;
  background: var(--_bg);
  color: var(--_fg);
  box-shadow: 0 6px 24px rgb(0 0 0 / 16%);
}

/* The display above beats the user-agent rule for the hidden attribute. */
.header-menu[hidden] {
  display: none;
}

/* A control in the menu is a row: its glyph, then its name, in the panel's ink
   rather than the header's, since the menu sits on the panel. The leading :host
   is there for weight, not scope: each theme restates the header button's ink
   at this weight, and this module comes after the themes. */
:host .header-menu .header-btn {
  width: auto;
  height: 32px;
  justify-content: flex-start;
  gap: 10px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--_fg);
  opacity: 1;
  font-size: 0.875rem;
  text-align: start;
}

:host .header-menu .header-btn:hover,
:host .header-menu .header-btn:focus-visible {
  color: var(--_fg);
  background: var(--_hover);
}

/* The header button's line-height is one font size, which the clip would cut
   the descenders at. */
.header-menu .header-btn::after {
  content: attr(aria-label);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
