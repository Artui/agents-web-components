/** The surface frame and the notice; only the --_* aliases, never a public token. */
export const CORE_STYLES: string = `
[part~="a2ui-surface"] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--_fg);
}
[part~="a2ui-notice"] {
  padding: 6px 10px;
  border: 1px dashed var(--_line-strong);
  border-radius: 6px;
  color: var(--_ink-3);
  font-size: 0.85em;
}
`;
