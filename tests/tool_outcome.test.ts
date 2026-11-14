/**
 * The wire-outcome to card-status mapping.
 *
 * Small enough to read in one breath, and the one place four repos agree on
 * what a word means — so the cases worth pinning are the ones nobody writes a
 * branch for: the absent field every existing server sends, and the value from
 * a protocol version this release has not seen.
 */

import { describe, expect, it } from "vitest";
import { TOOL_CALL_STATUS, TOOL_OUTCOME } from "../src/constants.js";
import { toolStatusFromOutcome } from "../src/core/tool_outcome.js";

describe("toolStatusFromOutcome", () => {
  it.each([
    // The only case load-bearing for servers that exist today: every one of
    // them omits the field.
    { reads: "an absent outcome as a success", outcome: undefined, status: TOOL_CALL_STATUS.DONE },
    {
      reads: "a stated success as a success",
      outcome: TOOL_OUTCOME.SUCCESS,
      status: TOOL_CALL_STATUS.DONE,
    },
    {
      reads: "a failure as an error",
      outcome: TOOL_OUTCOME.FAILED,
      status: TOOL_CALL_STATUS.ERROR,
    },
    {
      reads: "a refusal as declined",
      outcome: TOOL_OUTCOME.DENIED,
      status: TOOL_CALL_STATUS.DECLINED,
    },
    // pydantic-ai's word for a call its history repair answered, and the one the
    // element writes for a call its own run left open.
    {
      reads: "interrupted as a call that did not finish, neither success nor failure",
      outcome: TOOL_OUTCOME.INTERRUPTED,
      status: TOOL_CALL_STATUS.INTERRUPTED,
    },
  ])("reads $reads", ({ outcome, status }) => {
    expect(toolStatusFromOutcome(outcome)).toBe(status);
  });

  // Every shape an undeclared field or a JSON blob out of a store can actually
  // hand over. None of them is grounds for claiming a failure.
  it.each([null, "", "FAILED", 1, true, {}, ["failed"]])(
    "reads unrecognised %j as a success",
    (value) => {
      expect(toolStatusFromOutcome(value)).toBe(TOOL_CALL_STATUS.DONE);
    },
  );
});
