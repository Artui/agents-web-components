import { describe, expect, it } from "vitest";
import { childSessionReceipt } from "../src/ui/progress/child_session_receipt.js";
import {
  RECEIPT_CONTENT,
  REFUSAL_CONTENT,
  START_SESSION,
} from "./helpers/child_session_fixture.js";

describe("childSessionReceipt", () => {
  it("reads the agent and thread off the producer's receipt", () => {
    expect(childSessionReceipt(START_SESSION, RECEIPT_CONTENT)).toEqual({
      agentId: "researcher",
      threadId: "child-thread-1",
    });
  });

  it("reads nothing off another tool's result, or a card with no name", () => {
    expect(childSessionReceipt("list_tasks", RECEIPT_CONTENT)).toBeNull();
    expect(childSessionReceipt("child_start_session", RECEIPT_CONTENT)).toBeNull();
    expect(childSessionReceipt(null, RECEIPT_CONTENT)).toBeNull();
  });

  it("reads nothing off a refusal", () => {
    expect(childSessionReceipt(START_SESSION, REFUSAL_CONTENT)).toBeNull();
  });

  it("never throws on a result that is not a receipt", () => {
    for (const content of [
      "",
      "not json",
      "{",
      "123",
      '"child-thread-1"',
      "null",
      "[]",
      '{"agent_id":"researcher"}',
      '{"thread_id":"child-thread-1"}',
      '{"agent_id":7,"thread_id":"child-thread-1"}',
      '{"agent_id":"researcher","thread_id":7}',
      '{"agent_id":"researcher","thread_id":""}',
    ]) {
      expect(childSessionReceipt(START_SESSION, content)).toBeNull();
    }
  });
});
