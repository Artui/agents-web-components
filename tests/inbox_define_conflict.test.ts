import { expect, it } from "vitest";
import { defineInbox, INBOX_TAG } from "../src/inbox.js";

it("refuses to register over another class that holds the tag", () => {
  customElements.define(INBOX_TAG, class extends HTMLElement {});
  expect(() => defineInbox()).toThrow(`<${INBOX_TAG}> is already defined by another class`);
});
