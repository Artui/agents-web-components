// The skill editor inside the full-panel view: its rows, empty state, form and buttons.
export const SKILL_EDITOR_STYLES: string = `
.skill-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skill-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
}

.skill-row:hover {
  background: var(--_hover);
}

.skill-row-open {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.skill-row-name {
  font-family: var(--_code-font);
  font-size: var(--_text-sm);
  font-weight: 600;
}

/* The name and its scope badge share a line; a long name wraps rather than
   pushing the badge out of the row. */
.skill-row-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.skill-row-line > .skill-row-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.skill-row-scope {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--_border);
  border-radius: 999px;
  color: var(--_muted);
  font-size: var(--_text-xs);
}

.skill-row-desc {
  color: var(--_muted);
  font-size: var(--_text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--_muted);
  font-size: var(--_text-xs);
}

.skill-row--off .skill-row-name,
.skill-row--off .skill-row-desc {
  opacity: 0.6;
}

.skill-row > .skill-editor-btn {
  margin: 8px 8px 0 0;
  flex: 0 0 auto;
}

.skill-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 12px;
  text-align: center;
}

.skill-empty h3 {
  margin: 0;
  font-size: var(--_text-md);
}

.skill-empty p {
  margin: 0;
  color: var(--_muted);
  max-width: 32ch;
}

.skill-empty code {
  white-space: nowrap;
}

.skill-editor-unavailable {
  margin: 0;
  color: var(--_muted);
}

.skill-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skill-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.skill-field-label {
  padding: 0;
  font-size: var(--_text-sm);
  font-weight: 600;
}

.skill-field input[type="text"],
.skill-field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_input-bg);
  color: inherit;
  font: inherit;
}

.skill-field-slash {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: var(--_code-font);
}

.skill-form-body {
  min-height: 160px;
  font-family: var(--_code-font);
  font-size: var(--_text-sm);
  resize: vertical;
}

.skill-field--bad input[type="text"],
.skill-field--bad textarea {
  border-color: var(--_danger);
}

.skill-field-hint {
  color: var(--_muted);
  font-size: var(--_text-xs);
}

.skill-field-error,
.skill-form-error {
  color: var(--_danger);
  font-size: var(--_text-sm);
}

.skill-field-error[hidden],
.skill-form-error[hidden],
.skill-notice[hidden] {
  display: none;
}

.skill-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  cursor: pointer;
}

.skill-switch span {
  display: flex;
  flex-direction: column;
}

.skill-switch b {
  font-weight: 500;
}

.skill-switch small {
  color: var(--_muted);
  font-size: var(--_text-xs);
}

.skill-notice {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--_wash);
  font-size: var(--_text-sm);
}

.skill-editor-grow {
  flex: 1;
}

.skill-editor-btn {
  padding: 6px 12px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_bg);
  color: var(--_fg);
  font: inherit;
  font-size: var(--_text-sm);
  cursor: pointer;
  white-space: nowrap;
}

.skill-editor-btn:hover {
  border-color: var(--_accent);
}

.skill-editor-btn--primary {
  border-color: var(--_accent);
  background: var(--_accent);
  color: var(--_on-accent);
}

.skill-editor-btn--ghost {
  border-color: transparent;
  background: transparent;
}

.skill-editor-btn--danger {
  border-color: transparent;
  background: transparent;
  color: var(--_danger);
}

.skill-editor-btn--block {
  flex: 1;
}
`;
