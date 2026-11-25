// A child session's report or question in its parent's transcript: an incoming card, not a user bubble.
export const CHILD_SESSION_REPORT_STYLES: string = `
.child-report {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: flex-start;
  max-width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--_border);
  border-left: 3px solid var(--_accent);
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.child-report[data-outcome="failed"] {
  border-left-color: var(--_danger);
}

.child-report-title {
  color: var(--_muted);
  font-size: 0.85em;
}

.child-report-body {
  white-space: pre-wrap;
}

.child-report-link {
  align-self: flex-start;
  max-width: 100%;
  padding: 2px 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--_accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.child-report-link:hover {
  text-decoration-thickness: 2px;
}
`;
