// A running task's controls, under its sub-agent row: a question, three small
// buttons, a one-line reply field and a refusal line. Every class here that
// declares a display has its own hidden rule, since the panel hides each part
// with the hidden attribute.

export const SUBAGENT_CONTROL_STYLES: string = `
.subagent-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 2px 0 4px;
}

.subagent-controls[hidden] {
  display: none;
}

.subagent-actions[hidden] {
  display: none;
}

.subagent-question {
  margin: 0;
  color: var(--_fg);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.subagent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.subagent-steer,
.subagent-answer,
.subagent-cancel,
.subagent-reply-send {
  flex: none;
  padding: 3px 10px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_bg);
  color: var(--_fg);
  font: inherit;
  font-size: 0.9em;
  cursor: pointer;
}

.subagent-steer[aria-expanded="true"],
.subagent-reply-send {
  border-color: var(--_accent);
  color: var(--_accent);
}

/* Answer is the control a waiting task needs, so it is the filled one. */
.subagent-answer {
  border-color: var(--_accent);
  background: var(--_accent);
  color: var(--_on-accent);
}

.subagent-cancel {
  color: var(--_danger);
}

.subagent-steer:disabled,
.subagent-answer:disabled,
.subagent-cancel:disabled,
.subagent-reply-send:disabled {
  cursor: default;
  opacity: 0.6;
}

.subagent-steer[hidden],
.subagent-answer[hidden],
.subagent-cancel[hidden] {
  display: none;
}

.subagent-reply {
  display: flex;
  gap: 6px;
  min-width: 0;
  margin: 0;
}

.subagent-reply[hidden] {
  display: none;
}

.subagent-reply-input {
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--_border);
  border-radius: 6px;
  background: var(--_bg);
  color: var(--_fg);
  font: inherit;
}

.subagent-control-error {
  margin: 0;
  color: var(--_danger);
  font-size: 0.9em;
}
`;
