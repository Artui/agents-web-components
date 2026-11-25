import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
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

function row(status: string): ThreadMeta {
  return { threadId: "t1", title: "", updatedAt: 0, preview: "", status } as ThreadMeta;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RunFollower", () => {
  it("asks nothing without the run routes, nor of a list naming nothing it follows", async () => {
    const plain = follower({ runs: () => null });
    plain.follow.listed([row("running")]);
    const quiet = follower();
    quiet.follow.listed([row("idle")]);
    quiet.follow.listed([{ ...row("running"), threadId: "t9" }]);
    quiet.follow.idled();
    await flush();

    expect(plain.join).not.toHaveBeenCalled();
    expect(quiet.probes).toEqual([]);
  });

  it("joins nothing when the run log has nothing to say", async () => {
    const { follow, join } = follower({
      runs: () => ({ probe: () => Promise.resolve(null) }) as unknown as DetachedRuns,
    });
    follow.listed([row("running")]);
    await flush();

    expect(join).not.toHaveBeenCalled();
  });

  it("never joins the run the chat's own stream declared", async () => {
    const { follow, join } = follower();
    follow.ran("t1", "r1");
    follow.listed([row("running")]);
    await flush();

    expect(join).not.toHaveBeenCalled();
  });

  it("offers a parked run, but not the one a restore found", async () => {
    const page = { runId: "r3", status: "waiting" };
    const { follow, join } = follower({
      runs: () => ({ probe: () => Promise.resolve(page) }) as unknown as DetachedRuns,
    });
    follow.ran("t1", "r3");
    follow.listed([row("waiting")]);
    await flush();
    expect(join).not.toHaveBeenCalled();

    page.runId = "r5";
    follow.listed([row("waiting")]);
    await flush();
    expect(join).toHaveBeenCalledWith("waiting");
  });

  it("asks again once idle when the chat became busy while the server was asked", async () => {
    let idle = true;
    const { follow, probes, join } = follower({
      idle: () => idle,
      runs: () =>
        ({
          probe: (threadId: string) => {
            probes.push(threadId);
            idle = probes.length > 1;
            return Promise.resolve({ runId: "r7", status: "running" });
          },
        }) as unknown as DetachedRuns,
    });
    follow.listed([row("running")]);
    await flush();
    expect(join).not.toHaveBeenCalled();

    idle = true;
    follow.idled();
    await flush();
    follow.idled();
    await flush();
    expect(probes).toEqual(["t1", "t1"]);
    expect(join).toHaveBeenCalledOnce();
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
