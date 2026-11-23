/**
 * A child session's tool results, as the producer writes them.
 *
 * Generated, not written by hand: django-spec-agents 0.25.0's
 * `ChildSessionReceipt` and `ChildSessionRefusal`, serialised by pydantic-ai
 * 2.71.0's `dump_tool_return_content`, which is what both the live
 * `TOOL_CALL_RESULT` content and the persisted tool message carry. Regenerate
 * with `ChildSessionReceipt(agent_id="researcher", thread_id="child-thread-1",
 * run_id="child-run-1")` and `ChildSessionRefusal("max_depth", "a child here
 * would be 3 deep")` and diff.
 */
export const RECEIPT_CONTENT =
  '{"agent_id":"researcher","thread_id":"child-thread-1","run_id":"child-run-1","note":"The child session is running in its own thread. This is an acceptance receipt, not a result. Do not claim completion or invent findings. Its report will be delivered after it settles."}';

export const REFUSAL_CONTENT = '{"refused":"max_depth","reason":"a child here would be 3 deep"}';

/** The tool the receipt is the result of. */
export const START_SESSION = "start_session";
