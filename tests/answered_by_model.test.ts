import { describe, expect, it } from "vitest";
import { renderAnsweredByModel } from "../src/ui/transcript/answered_by_model.js";

const STRINGS = { answeredByModel: "Answered by {model}" };

describe("renderAnsweredByModel", () => {
  it("names the model only when the fallback mark is true", () => {
    const line = renderAnsweredByModel({ model_id: "openai:gpt-5", model_fallback: true }, STRINGS);
    expect(line?.textContent).toBe("Answered by openai:gpt-5");
    expect(line?.className).toBe("answered-by-model");
  });

  it.each([
    ["no metadata", undefined],
    ["null metadata", null],
    ["primitive metadata", "x"],
    ["a first-model answer", { model_id: "openai:gpt-5" }],
    ["a mark that is not true", { model_id: "openai:gpt-5", model_fallback: "yes" }],
    ["no model id", { model_fallback: true }],
    ["an empty model id", { model_id: "", model_fallback: true }],
    ["a model id that is not a string", { model_id: 7, model_fallback: true }],
  ])("draws nothing for %s", (_name, metadata) => {
    expect(renderAnsweredByModel(metadata, STRINGS)).toBeNull();
  });
});
