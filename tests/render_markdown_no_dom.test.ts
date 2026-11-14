// @vitest-environment node
import { expect, it } from "vitest";

it("imports without a DOM, building the sanitiser only when a render needs it", async () => {
  const module = await import("../src/ui/transcript/render_markdown.js");

  expect(typeof module.renderMarkdown).toBe("function");
});
