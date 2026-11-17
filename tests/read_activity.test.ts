import { describe, expect, it } from "vitest";
import { readActivity } from "../src/mcp_apps/read_activity.js";

const BASE = { resourceUri: "ui://w/v.html", toolInput: { city: "Oslo" }, result: { content: [] } };

describe("readActivity", () => {
  it("reads pydantic-ai's content, server ids included", () => {
    expect(readActivity({ ...BASE, serverId: "w", serverHash: "w" })).toEqual({
      ...BASE,
      serverId: "w",
      serverHash: "w",
    });
  });

  it("leaves out a server id that is absent, empty or not a string", () => {
    expect(readActivity(BASE)).toEqual(BASE);
    expect(readActivity({ ...BASE, serverId: "" })).toEqual(BASE);
    expect(readActivity({ ...BASE, serverId: 7, serverHash: 7 })).toEqual(BASE);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["no resource URI", { ...BASE, resourceUri: undefined }],
    ["no tool input", { ...BASE, toolInput: null }],
    ["a result that is not an object", { ...BASE, result: "done" }],
  ])("refuses %s", (_name, content) => {
    expect(readActivity(content)).toBeNull();
  });
});
