import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetachedRuns, RunProbe } from "../src/core/detached_runs.js";
import { RunFollower, type RunFollowerHost } from "../src/core/run_follower.js";

afterEach(() => {
  vi.useRealTimers();
});

function follower(overrides: Partial<RunFollowerHost> = {}): {
  follow: RunFollower;
  probes: string[];
  join: ReturnType<typeof vi.fn>;
} {
  const probes: string[] = [];
  const runs = {
    probe: (threadId: string): Promise<RunProbe | null> => {
      probes.push(threadId);
      return Promise.resolve({ runId: "r1", status: "running" });
    },
  } as unknown as DetachedRuns;
  const join = vi.fn();
  const host: RunFollowerHost = {
    threadId: () => "t1",
    runs: () => runs,
    idle: () => true,
    join,
    ...overrides,
  };
  return { follow: new RunFollower(host), probes, join };
}

describe("RunFollower", () => {
  it("asks nothing at a settle on a thread nothing was sent in, or without the run routes", async () => {
    const unsent = follower({ threadId: () => null });
    unsent.follow.settled();
    const plain = follower({ runs: () => null });
    plain.follow.settled();
    plain.follow.listed([
      { threadId: "t1", title: "", updatedAt: 0, preview: "", status: "running" },
    ]);
    await Promise.resolve();

    expect(unsent.probes).toEqual([]);
    expect(plain.join).not.toHaveBeenCalled();
  });

  it("records a settled run even when its log has nothing to say", async () => {
    const { follow, join } = follower({
      runs: () => ({ probe: () => Promise.resolve(null) }) as unknown as DetachedRuns,
    });
    follow.settled();
    follow.listed([{ threadId: "t1", title: "", updatedAt: 0, preview: "", status: "running" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(join).not.toHaveBeenCalled();
  });

  it("polls only while the chat is idle on a thread something was sent in", async () => {
    vi.useFakeTimers();
    let idle = true;
    let threadId: string | null = null;
    const { follow, probes } = follower({ idle: () => idle, threadId: () => threadId });
    const stop = follow.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(probes).toEqual([]);
    idle = false;
    threadId = "t1";
    await vi.advanceTimersByTimeAsync(5000);
    expect(probes).toEqual([]);
    idle = true;
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(probes).toEqual(["t1"]);
  });
});
