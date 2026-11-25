// The sources list under an answer that cites them: collapsed to its summary at
// rest, so a cited answer reads as long as an uncited one until it is opened.
export const CITATION_STYLES: string = `
.citations {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--_border);
  font-size: 0.85em;
  color: var(--_muted);
  white-space: normal;
}

.citations-summary {
  cursor: pointer;
  width: fit-content;
}

.citation-list {
  margin: 6px 0 0;
  padding-left: 1.4em;
}

.citation + .citation {
  margin-top: 6px;
}

/* A long URL standing in for a missing title would otherwise push the bubble
   wider than the transcript. */
.citation-title {
  color: var(--_text);
  overflow-wrap: anywhere;
}

.citation-anchor {
  display: block;
  color: var(--_text);
}

.citation-excerpt {
  margin: 2px 0 0;
  padding-left: 8px;
  border-left: 2px solid var(--_border);
  overflow-wrap: anywhere;
}
`;
