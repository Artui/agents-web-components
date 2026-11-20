import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

const DESKTOP = { width: 1280, height: 800 };
const WIDTHS = { "panel width": 1280, "phone width": 375 };

const RUNS = [
  {
    run_id: "5087f329-a842-473f-b16b-881f7c91668d",
    preview: "Import these three events onto the board",
    thread_id: "t",
    parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    started_at: new Date(Date.now() - 4_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "a7c31d90-58b4-42ee-9f0c-6d2a1b3e77c5",
    preview: "What is on the board?",
    thread_id: "t",
    parent_run_id: null,
    started_at: new Date(Date.now() - 13 * 3600_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "e02f4a17-9c65-4b38-8ad1-70f9c5e2b4aa",
    preview: "What is on the board?",
    thread_id: "t",
    parent_run_id: null,
    started_at: new Date(Date.now() - 14 * 3600_000).toISOString(),
    continuable: true,
  },
];

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/**
 * Resume and Fork stay on one line in a checkpoint row, in a real browser.
 *
 * The row wraps so a narrow panel does not crush its label, and each button was
 * its own wrapping item, so the pair could split with Resume on one line and
 * Fork on the next. Layout is what is under test, so this is Chromium only.
 */
describe.each(Object.entries(WIDTHS))(
  "checkpoint actions at the %s (real browser)",
  (_n, width) => {
    const original = globalThis.fetch;

    beforeAll(async () => {
      defineChat();
      await page.viewport(width, 800);
    });

    afterAll(async () => {
      await page.viewport(DESKTOP.width, DESKTOP.height);
    });

    afterEach(() => {
      for (const el of document.querySelectorAll(ELEMENT_TAG)) {
        el.remove();
      }
      globalThis.fetch = original;
    });

    it("puts both buttons of every row at the same top", async () => {
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ runs: RUNS }),
      })) as unknown as typeof fetch;
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.setAttribute("endpoint", "/agent/");
      el.setAttribute("data-start-open", "");
      el.setAttribute("data-runs-url", "/runs/");
      document.body.appendChild(el);
      await settle();
      el.openCheckpoints();
      await new Promise((r) => setTimeout(r, 400));
      const root = el.shadowRoot as ShadowRoot;
      const rows = Array.from(root.querySelectorAll(".checkpoint-row"));
      expect(rows).toHaveLength(RUNS.length);
      for (const row of rows) {
        const resume = row.querySelector(".checkpoint-resume") as HTMLElement;
        const fork = row.querySelector(".checkpoint-fork") as HTMLElement;
        expect(resume.getBoundingClientRect().top).toBe(fork.getBoundingClientRect().top);
      }
    });
  },
);
