/** The input components' shadow styles; only the --_* aliases, never a public token. */
export const INPUT_STYLES: string = `
[part~="a2ui-button"] {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
[part~="a2ui-button-control"] {
  padding: 6px 14px;
  border: 1px solid var(--_border);
  border-radius: 8px;
  background: var(--_bg);
  color: var(--_fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
[data-variant="primary"] > [part~="a2ui-button-control"] {
  border-color: var(--_accent);
  background: var(--_accent);
  color: var(--_on-accent);
}
[data-variant="borderless"] > [part~="a2ui-button-control"] {
  padding: 2px 4px;
  border-color: transparent;
  background: transparent;
}
[part~="a2ui-button-control"]:hover:not(:disabled) {
  filter: brightness(0.96);
}
[part~="a2ui-button-control"]:focus-visible {
  outline: 2px solid var(--_ring);
  outline-offset: 1px;
}
[part~="a2ui-button-control"]:disabled {
  cursor: default;
  opacity: 0.6;
}
[part~="a2ui-text-field"],
[part~="a2ui-check-box"] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
[part~="a2ui-choice-picker"] {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
[part~="a2ui-text-field-label"],
[part~="a2ui-choice-picker-label"] {
  padding: 0;
  color: var(--_ink-2);
  font-size: var(--_text-sm);
}
[part~="a2ui-text-field-input"],
[part~="a2ui-choice-picker-filter"] {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_input-bg);
  color: var(--_fg);
  font: inherit;
}
textarea[part~="a2ui-text-field-input"] {
  min-height: 4.5em;
  resize: vertical;
}
[part~="a2ui-text-field-input"][aria-invalid="true"] {
  border-color: var(--_danger);
}
[part~="a2ui-text-field-input"]:focus-visible,
[part~="a2ui-choice-picker-filter"]:focus-visible,
[part~="a2ui-check-box-input"]:focus-visible,
[part~="a2ui-choice-picker-input"]:focus-visible,
[data-display="chips"] [part~="a2ui-choice-picker-option"]:has(:focus-visible) {
  outline: 2px solid var(--_ring);
  outline-offset: 1px;
}
[part~="a2ui-check-box-label"],
[part~="a2ui-choice-picker-option"] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
[part~="a2ui-check-box-input"],
[part~="a2ui-choice-picker-input"] {
  margin: 0;
  accent-color: var(--_accent);
}
[part~="a2ui-choice-picker-options"] {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
[data-display="chips"] [part~="a2ui-choice-picker-options"] {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}
[data-display="chips"] [part~="a2ui-choice-picker-option"] {
  position: relative;
  padding: 4px 12px;
  border: 1px solid var(--_border);
  border-radius: 999px;
}
[data-display="chips"] [part~="a2ui-choice-picker-option"][data-selected] {
  border-color: var(--_accent);
  background: var(--_accent);
  color: var(--_on-accent);
}
[data-display="chips"] [part~="a2ui-choice-picker-input"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
[part~="a2ui-text-field"] :disabled,
[part~="a2ui-check-box"] :disabled,
[part~="a2ui-choice-picker"]:disabled [part~="a2ui-choice-picker-option"] {
  cursor: default;
  opacity: 0.6;
}
[part~="a2ui-button-message"],
[part~="a2ui-text-field-message"],
[part~="a2ui-check-box-message"],
[part~="a2ui-choice-picker-message"] {
  color: var(--_ink-3);
  font-size: var(--_text-xs);
  white-space: pre-line;
}
[part~="a2ui-text-field-message"][data-severity="error"],
[part~="a2ui-check-box-message"][data-severity="error"],
[part~="a2ui-choice-picker-message"][data-severity="error"] {
  color: var(--_danger);
}
[part~="a2ui-button-message"][hidden],
[part~="a2ui-text-field-label"][hidden],
[part~="a2ui-choice-picker-label"][hidden],
[part~="a2ui-choice-picker-option"][hidden],
[part~="a2ui-text-field-message"][hidden],
[part~="a2ui-check-box-message"][hidden],
[part~="a2ui-choice-picker-message"][hidden] {
  display: none;
}
`;
