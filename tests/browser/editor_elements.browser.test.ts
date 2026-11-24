import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgUiRoutines } from "../../src/routines/ag_ui_routines.js";
import { defineRoutines } from "../../src/routines/define_routines.js";
import type { AgUiSkills } from "../../src/skills/ag_ui_skills.js";
import { defineSkills } from "../../src/skills/define_skills.js";
import { EDITOR_STYLES } from "../../src/ui/standalone/editor_styles.js";
import routinesFixture from "../fixtures/routines.json";
import skillsFixture from "../fixtures/skill_editor.json";

const LONG = "A routine whose name runs well past the width of a narrow column, twice over";

function answer(url: string): Response {
  const body = url.endsWith("/runs/")
    ? routinesFixture.answers.runsFinished.body
    : url.startsWith("/routines/")
      ? {
          ...routinesFixture.answers.list.body,
          routines: routinesFixture.answers.list.body.routines.map((routine, index) =>
            index === 0 ? { ...routine, name: LONG } : routine,
          ),
        }
      : skillsFixture.answers.list.body;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function inBox<T extends HTMLElement>(tag: string, url: [string, string], width: number): T {
  const box = document.createElement("div");
  box.style.cssText = `width: ${width}px; height: 480px; display: flex; flex-direction: column`;
  const el = document.createElement(tag) as T;
  el.setAttribute(url[0], url[1]);
  el.style.flex = "1 1 auto";
  box.append(el);
  document.body.append(box);
  return el;
}

function shadow(el: HTMLElement): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

describe("the editor elements in a real browser", () => {
  beforeAll(() => {
    defineRoutines();
    defineSkills();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("declares on :host every --_ alias their stylesheet reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => answer(url)),
    );
    const el = inBox<AgUiRoutines>("ag-ui-routines", ["data-routines-url", "/routines/"], 600);
    await settle();
    const names = [
      ...new Set([...EDITOR_STYLES.matchAll(/var\(--_([a-z0-9-]+)/g)].map((m) => m[1])),
    ];
    expect(names.length).toBeGreaterThan(10);
    const style = getComputedStyle(el);
    expect(names.filter((name) => style.getPropertyValue(`--_${name}`).trim() === "")).toEqual([]);
  });

  it.each([600, 1200])(
    "fills its container and keeps every row inside it at %ipx",
    async (width) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => answer(url)),
      );
      const routines = inBox<AgUiRoutines>(
        "ag-ui-routines",
        ["data-routines-url", "/routines/"],
        width,
      );
      const skills = inBox<AgUiSkills>(
        "ag-ui-skills",
        ["data-skill-editor-url", "/skills/"],
        width,
      );
      await settle();
      for (const el of [routines, skills]) {
        const box = el.getBoundingClientRect();
        expect(box.width).toBe(width);
        expect(box.height).toBe(480);
        const view = shadow(el).querySelector<HTMLElement>(".panel-view") as HTMLElement;
        expect(view.getBoundingClientRect().height).toBe(480);
        const rows = [...shadow(el).querySelectorAll<HTMLElement>(".skill-row")];
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(box.right + 0.5);
        }
        const back = shadow(el).querySelector<HTMLElement>(".header-btn--back") as HTMLElement;
        expect(getComputedStyle(back).display).toBe("none");
      }
    },
  );

  it("draws the light or dark half the theme names, and the page's scheme without one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => answer(url)),
    );
    const el = inBox<AgUiSkills>("ag-ui-skills", ["data-skill-editor-url", "/skills/"], 600);
    await settle();
    el.setAttribute("theme", "dark");
    expect(getComputedStyle(el).backgroundColor).toBe("rgb(22, 22, 24)");
    el.setAttribute("theme", "light");
    expect(getComputedStyle(el).backgroundColor).toBe("rgb(255, 255, 255)");
    el.removeAttribute("theme");
    document.documentElement.style.colorScheme = "dark";
    expect(getComputedStyle(el).backgroundColor).toBe("rgb(22, 22, 24)");
    document.documentElement.style.removeProperty("color-scheme");
  });
});
