import { describe, expect, it } from "vitest";
import { actionRequest } from "../src/a2ui/action_request.js";
import type { UserAction } from "../src/a2ui/core/user_action.js";
import { randomRunId } from "../src/core/random_run_id.js";
import fixture from "./fixtures/a2ui_server.json" with { type: "json" };

describe("actionRequest", () => {
  it.each(fixture.actions)("names and words the turn as django-ag-ui does ($runId)", (recorded) => {
    const request = actionRequest(recorded.userAction as UserAction, recorded.runId);
    expect(request.message).toEqual({ id: recorded.id, content: recorded.content });
  });

  it("sends the action in forwardedProps under the run id it is given", () => {
    const [recorded] = fixture.actions;
    const action = recorded?.userAction as UserAction;
    expect(actionRequest(action, "run-9")).toMatchObject({
      forwardedProps: { a2uiAction: { userAction: action } },
      runId: "run-9",
    });
  });
});

describe("randomRunId", () => {
  it("mints distinct version 4 UUIDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomRunId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
