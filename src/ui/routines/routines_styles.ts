// The routines view inside the full-panel view (it borrows the skill editor's
// rows, fields and buttons), and its guest: the routine badge on a thread row.
export const ROUTINES_STYLES: string = `
.routine-row {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}

.routine-row-name {
  font-family: inherit;
}

.routine-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 0 10px 8px;
}

.routine-last {
  margin-inline-end: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--_muted);
  font: inherit;
  font-size: var(--_text-xs);
}

button.routine-last {
  text-decoration: underline;
  cursor: pointer;
}

.routine-actions .skill-editor-btn {
  padding: 4px 8px;
}

.routine-kinds,
.routine-days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: var(--_text-sm);
}

.routine-days {
  gap: 4px;
}

.routine-kinds label,
.routine-day {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

/* A day is a toggle pill: its checkbox stays in the tab order and the
   accessibility tree, out of sight, and the pill shows its state. */
.routine-day {
  position: relative;
  padding: 2px 10px;
  border: 1px solid var(--_border);
  border-radius: 999px;
  color: var(--_muted);
}

.routine-day:has(:checked) {
  border-color: var(--_accent);
  background: var(--_accent);
  color: var(--_on-accent);
}

.routine-day:has(:focus-visible) {
  outline: 2px solid var(--_ring);
  outline-offset: 1px;
}

.routine-day input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.routine-weekly {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.routine-time[hidden],
.routine-weekly[hidden],
.routine-interval[hidden],
.routine-confirm[hidden] {
  display: none;
}

.routine-form select,
.routine-form input[type="number"] {
  box-sizing: border-box;
  width: 100%;
  max-width: 12em;
  padding: 6px 8px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_input-bg);
  color: inherit;
  font: inherit;
}

/* The time is two selects drawn by the panel's tokens, not the browser's
   time popup; they size to their two digits. */
.routine-time {
  display: flex;
  align-items: center;
  gap: 4px;
}

.routine-time select {
  width: auto;
}

.routine-tool .skill-switch span {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.routine-tool code {
  font-family: var(--_code-font);
  font-size: var(--_text-sm);
  overflow-wrap: anywhere;
}

.routine-destructive {
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--_danger);
  font-size: var(--_text-xs);
}

.routine-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--_wash);
  font-size: var(--_text-sm);
}

.routine-confirm p {
  flex-basis: 100%;
  margin: 0;
}

.drawer-row-routine {
  align-self: flex-start;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--_wash);
  color: var(--_muted);
  font-size: 0.72em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
`;
