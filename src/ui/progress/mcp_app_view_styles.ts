// An MCP App view drawn by the mcp-apps entry: its stage, and the stage shown
// fullscreen. The entry restyles the stage and never moves the frame, which
// would reload it, so fullscreen is a fixed box over the viewport, or over the
// host where the host contains its layout (the sidebar placement does).
export const MCP_APP_VIEW_STYLES: string = `
.mcp-app-view-stage[data-display-mode="fullscreen"] {
  position: fixed;
  inset: 0;
  z-index: var(--_z-index);
  display: flex;
  flex-direction: column;
  background: var(--_bg);
}

/* The bridge keeps the view's own height inline for the return; the sheet
   outweighs it only while fullscreen. */
.mcp-app-view-stage[data-display-mode="fullscreen"] > .mcp-app-view-frame {
  flex: 1 1 0;
  min-height: 0;
  height: auto !important;
}

.mcp-app-view-exit {
  display: block;
  flex: none;
  align-self: flex-end;
  margin: 8px;
  padding: 4px 12px;
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  background: var(--_bg);
  color: var(--_fg);
  font: inherit;
  font-size: 0.9em;
  cursor: pointer;
}

.mcp-app-view-exit[hidden] {
  display: none;
}

.mcp-app-view-exit:hover {
  background: var(--_hover);
}

.mcp-app-view-exit:focus-visible {
  outline: 2px solid var(--_ring);
  outline-offset: 2px;
}
`;
