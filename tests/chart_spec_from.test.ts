import { describe, expect, it } from "vitest";
import { chartSpecFrom } from "../src/ui/charts/chart_spec_from.js";

const ok = { kind: "line", labels: ["a", "b"], series: [{ label: "s", points: [1, 2] }] };

describe("chartSpecFrom", () => {
  it("accepts a well-formed spec", () => {
    expect(chartSpecFrom(ok)).toEqual(ok);
  });

  // Silently misaligned values after a length gap still read as authoritative; JSON encoders
  // render NaN and Infinity as nulls or strings, which would scale into a chart with no extent.
  it.each([
    ["a non-object", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "chart"],
    ["an array", [ok]],
    ["labels that are not all strings", { ...ok, labels: ["a", 2] }],
    ["labels that are not an array", { ...ok, labels: "ab" }],
    ["a missing series", { labels: ["a"] }],
    ["a non-array series", { ...ok, series: {} }],
    ["a series entry that is a string", { ...ok, series: ["nope"] }],
    ["a series entry that is null", { ...ok, series: [null] }],
    ["too few points", { ...ok, series: [{ label: "s", points: [1] }] }],
    ["too many points", { ...ok, series: [{ label: "s", points: [1, 2, 3] }] }],
    ["a string point", { ...ok, series: [{ label: "s", points: [1, "2"] }] }],
    ["a null point", { ...ok, series: [{ label: "s", points: [1, null] }] }],
    ["a NaN point", { ...ok, series: [{ label: "s", points: [1, Number.NaN] }] }],
    [
      "an infinite point",
      { ...ok, series: [{ label: "s", points: [1, Number.POSITIVE_INFINITY] }] },
    ],
    ["points that are not an array", { ...ok, series: [{ label: "s", points: "12" }] }],
    ["an empty series list", { ...ok, series: [] }],
  ])("refuses %s", (_name, value) => {
    expect(chartSpecFrom(value)).toBeNull();
  });

  it("defaults an unknown or missing kind to bar rather than refusing the data", () => {
    expect(chartSpecFrom({ ...ok, kind: "sankey" })?.kind).toBe("bar");
    expect(chartSpecFrom({ labels: ok.labels, series: ok.series })?.kind).toBe("bar");
  });

  it.each(["bar", "line", "pie", "scatter", "stacked"])("keeps the %s kind", (kind) => {
    expect(chartSpecFrom({ ...ok, kind })?.kind).toBe(kind);
  });

  it("defaults a missing series label to empty rather than refusing", () => {
    expect(chartSpecFrom({ ...ok, series: [{ points: [1, 2] }] })?.series[0]?.label).toBe("");
  });

  it("omits a non-string title entirely", () => {
    expect(chartSpecFrom({ ...ok, title: 7 })).not.toHaveProperty("title");
    expect(chartSpecFrom({ ...ok, title: "t" })?.title).toBe("t");
  });
});

describe("bounds that exist to protect the transcript", () => {
  it("refuses a magnitude that would make the range infinite", () => {
    // Finite per point is not enough: 1e308 minus -1e308 is Infinity, and
    // dividing by it yields NaN in every coordinate.
    expect(chartSpecFrom({ ...ok, series: [{ label: "s", points: [1e308, -1e308] }] })).toBeNull();
    expect(
      chartSpecFrom({ ...ok, series: [{ label: "s", points: [1e15, -1e15] }] }),
    ).not.toBeNull();
  });

  it("refuses a spec large enough to throw while rendering", () => {
    // `Math.max(0, ...values)` blows the call stack on a big enough spread, and
    // the renderer runs inside the history replay -- where a throw abandons the
    // replay and takes every later turn with it, on every reload.
    const labels = Array.from({ length: 30_000 }, (_v, i) => String(i));
    const points = labels.map(() => 1);
    expect(chartSpecFrom({ kind: "bar", labels, series: [{ label: "s", points }] })).toBeNull();
  });
});

describe("bounds on what is cheap enough to draw", () => {
  it("refuses more labels than the axis can carry, inside the point budget", () => {
    // MAX_POINTS bounds the data; this bounds the DOM. Every label emits an
    // axis text node whatever the series count, so a spec well inside the point
    // budget can still block the main thread -- again on every reload.
    const labels = Array.from({ length: 5_000 }, (_v, i) => String(i));
    const spec = { kind: "bar", labels, series: [{ label: "s", points: labels.map(() => 1) }] };
    expect(chartSpecFrom(spec)).toBeNull();
  });

  it("refuses a sparse labels array rather than drawing blank axis labels", () => {
    // `Array.prototype.some` skips holes, so this used to pass validation and
    // render a chart with no labels, reading as a rendering bug.
    const sparse = ["a", "b"];
    delete (sparse as unknown as Record<number, string>)[1];
    expect(chartSpecFrom({ ...ok, labels: sparse })).toBeNull();
  });
});
