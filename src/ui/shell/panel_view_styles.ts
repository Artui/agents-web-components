// The full-panel view: what it hides while open, and its bar, body and footer.
export const PANEL_VIEW_STYLES: string = `
/* While a full-panel view is open, everything under the header but the view
   is out of the layout. Hidden, not detached: a live view in the transcript
   keeps its frame, and the scroll position survives the visit. The attribute
   selector outranks the display each of these siblings sets at rest. */
.chat[data-panel-view] > :not(.header, .header-menu, .panel-view, .resize-handle) {
  display: none;
}

.panel-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--_bg);
  color: var(--_fg);
}

/* The display above beats the user-agent rule for the hidden attribute. */
.panel-view[hidden] {
  display: none;
}

.panel-view-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--_border);
}

.panel-view-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.panel-view-title {
  margin: 0;
  font-size: var(--_text-md);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-view-sub {
  color: var(--_muted);
  font-size: var(--_text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-view-sub[hidden] {
  display: none;
}

.panel-view-actions {
  display: flex;
  gap: 4px;
}

.panel-view-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 12px;
}

.panel-view-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--_border);
}

.panel-view-footer[hidden] {
  display: none;
}

.panel-view-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.panel-view-status:not(:empty) {
  position: static;
  width: auto;
  height: auto;
  clip-path: none;
  padding: 6px 12px;
  font-size: var(--_text-sm);
  color: var(--_muted);
  border-top: 1px solid var(--_border);
}
`;
