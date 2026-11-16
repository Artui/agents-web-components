import { describe, expect, it, vi } from "vitest";
import { DataModel } from "../src/a2ui/core/data_model.js";

describe("DataModel", () => {
  it("reads by JSON Pointer, escapes included", () => {
    const model = new DataModel({ a: { "b/c": [1, { "d~e": 2 }] } });
    expect(model.get("/a/b~1c/1/d~0e")).toBe(2);
    expect(model.get("/a/b~1c/0")).toBe(1);
    expect(model.get("")).toEqual(model.get("/"));
  });

  it("reads undefined through a missing token, a non-index into an array, or a scalar", () => {
    const model = new DataModel({ list: [1], n: 3 });
    expect(model.get("/missing/x")).toBeUndefined();
    expect(model.get("/list/x")).toBeUndefined();
    expect(model.get("/list/01")).toBeUndefined();
    expect(model.get("/n/x")).toBeUndefined();
    expect(model.get("/toString")).toBeUndefined();
  });

  it("starts empty", () => {
    expect(new DataModel().get("/")).toEqual({});
  });

  it("creates a missing path as objects, or an array before an index", () => {
    const model = new DataModel();
    model.set("/form/name", "Ada");
    model.set("/rows/0/label", "first");
    expect(model.get("/")).toEqual({ form: { name: "Ada" }, rows: [{ label: "first" }] });
  });

  it("replaces a scalar on the way, and a scalar root", () => {
    const model = new DataModel(5);
    model.set("/a/b", 1);
    expect(model.get("/")).toEqual({ a: { b: 1 } });
    model.set("/a/b/c", 2);
    expect(model.get("/a")).toEqual({ b: { c: 2 } });
  });

  it("writes into an array by index and ignores a non-index token there", () => {
    const model = new DataModel({ list: ["a", "b"] });
    model.set("/list/1", "B");
    model.set("/list/x", "ignored");
    expect(model.get("/list")).toEqual(["a", "B"]);
    model.set("/list/x/y", "ignored too");
    expect(model.get("/list")).toEqual(["a", "B"]);
  });

  it("removes a key or an array item on null, and ignores one that is not there", () => {
    const model = new DataModel({ a: 1, b: 2, list: ["x", "y", "z"] });
    model.set("/a", null);
    model.set("/list/1", null);
    model.set("/list/9", null);
    model.set("/list/q", null);
    expect(model.get("/")).toEqual({ b: 2, list: ["x", "z"] });
  });

  it("replaces the whole model at the root, and empties it on null", () => {
    const model = new DataModel({ a: 1 });
    model.set("/", { b: 2 });
    expect(model.get("/")).toEqual({ b: 2 });
    model.set("", null);
    expect(model.get("/")).toEqual({});
  });

  it("writes __proto__ as an own key, never a prototype", () => {
    const model = new DataModel();
    model.set("/__proto__/polluted", true);
    expect(model.get("/__proto__/polluted")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.getPrototypeOf(model.get("/"))).toBe(Object.prototype);
  });

  it("tells listeners after every write, until they unsubscribe", () => {
    const model = new DataModel();
    const listener = vi.fn();
    const stop = model.subscribe(listener);
    model.set("/a", 1);
    stop();
    model.set("/a", 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
