import { describe, expect, it } from "vitest";
import { AgUiInbox, defineInbox, INBOX_TAG } from "../src/inbox.js";

describe("defineInbox", () => {
  it("registers the element once, idempotently", () => {
    defineInbox();
    defineInbox();
    expect(customElements.get(INBOX_TAG)).toBe(AgUiInbox);
  });
});
