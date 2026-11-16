/**
 * The display components' shadow styles; only the --_* aliases, never a public
 * token. Each element is found by its part, and a variant by a data attribute.
 */
export const DISPLAY_STYLES: string = `
[part~="a2ui-text"] {
  min-width: 0;
  line-height: var(--_leading);
  overflow-wrap: anywhere;
}
[part~="a2ui-text"][data-variant="caption"] {
  font-size: 0.8em;
  color: var(--_ink-3);
}
[part~="a2ui-text"] :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6) {
  margin: 0;
}
[part~="a2ui-text"] > * + * {
  margin-top: 0.5em;
}
[part~="a2ui-text"] :is(h1, h2, h3, h4, h5, h6) {
  line-height: 1.25;
}
[part~="a2ui-text"] h1 { font-size: 1.5em; }
[part~="a2ui-text"] h2 { font-size: 1.3em; }
[part~="a2ui-text"] h3 { font-size: 1.15em; }
[part~="a2ui-text"] :is(h4, h5, h6) { font-size: 1em; }
[part~="a2ui-text"] :is(ul, ol) {
  padding-left: 1.4em;
}

[part~="a2ui-row"],
[part~="a2ui-column"],
[part~="a2ui-list"] {
  display: flex;
  gap: var(--_space);
  min-width: 0;
  justify-content: flex-start;
  align-items: stretch;
}
[part~="a2ui-row"] { flex-direction: row; }
[part~="a2ui-column"] { flex-direction: column; }
[part~="a2ui-list"] {
  flex-direction: column;
  overflow-y: auto;
}
[part~="a2ui-list"][data-direction="horizontal"] {
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
[part~="a2ui-list"][data-direction="horizontal"] > * {
  flex-shrink: 0;
  max-width: 80%;
}
[data-justify="center"] { justify-content: center; }
[data-justify="end"] { justify-content: flex-end; }
[data-justify="spaceBetween"] { justify-content: space-between; }
[data-justify="spaceAround"] { justify-content: space-around; }
[data-justify="spaceEvenly"] { justify-content: space-evenly; }
[data-justify="stretch"] { justify-content: stretch; }
[data-justify="stretch"] > * { flex-grow: 1; }
[data-align="start"] { align-items: flex-start; }
[data-align="center"] { align-items: center; }
[data-align="end"] { align-items: flex-end; }

[part~="a2ui-card"] {
  display: block;
  min-width: 0;
  padding: var(--_pad);
  border: 1px solid var(--_line);
  border-radius: var(--_radius);
  background: var(--_wash);
}

[part~="a2ui-divider"] {
  display: block;
  flex: none;
  align-self: stretch;
  margin: 0;
  border: 0;
  background: var(--_line);
  height: 1px;
}
[part~="a2ui-divider"][data-axis="vertical"] {
  width: 1px;
  height: auto;
  min-height: 1em;
}

[part~="a2ui-image"] {
  display: block;
  max-width: 100%;
  object-fit: fill;
}
[part~="a2ui-image"][data-fit="contain"] { object-fit: contain; }
[part~="a2ui-image"][data-fit="cover"] { object-fit: cover; }
[part~="a2ui-image"][data-fit="none"] { object-fit: none; }
[part~="a2ui-image"][data-fit="scaleDown"] { object-fit: scale-down; }
[part~="a2ui-image"][data-variant="icon"] { width: 24px; height: 24px; }
[part~="a2ui-image"][data-variant="avatar"] {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}
[part~="a2ui-image"][data-variant="smallFeature"] { width: 100px; height: 100px; }
[part~="a2ui-image"][data-variant="mediumFeature"] { width: 100%; max-width: 300px; }
[part~="a2ui-image"][data-variant="largeFeature"] { width: 100%; max-height: 400px; }
[part~="a2ui-image"][data-variant="header"] { width: 100%; height: 200px; }

[part~="a2ui-icon"] {
  display: inline-flex;
  flex: none;
  width: 24px;
  height: 24px;
  color: inherit;
}
[part~="a2ui-icon"] svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

[part~="a2ui-row"][hidden],
[part~="a2ui-column"][hidden],
[part~="a2ui-list"][hidden],
[part~="a2ui-card"][hidden],
[part~="a2ui-divider"][hidden],
[part~="a2ui-image"][hidden],
[part~="a2ui-icon"][hidden] {
  display: none;
}
`;
