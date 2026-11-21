import { afterEach, describe, expect, it } from "vitest";
import { viewConsent } from "../src/mcp_apps/view_consent.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function staged(): { stage: HTMLElement; consent: ReturnType<typeof viewConsent> } {
  const stage = document.createElement("div");
  document.body.append(stage);
  return { stage, consent: viewConsent(stage, () => DEFAULT_UI_STRINGS) };
}

function click(stage: HTMLElement, which: "confirm" | "cancel"): void {
  stage.querySelector<HTMLButtonElement>(`.confirm-btn--${which}`)?.click();
}

describe("viewConsent", () => {
  it("draws a confirmation card the host styles through the confirm part, and focuses nothing", () => {
    const { stage, consent } = staged();
    const focused = document.activeElement;

    void consent.ask({ method: "tools/call", name: "forecast", arguments: {} });

    const card = stage.querySelector<HTMLElement>(".mcp-app-consent");
    expect(card?.className).toBe("confirm mcp-app-consent");
    expect(card?.getAttribute("part")).toBe("confirm mcp-app-consent");
    expect(card?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.confirmAction);
    expect(card?.querySelector<HTMLElement>(".confirm-args")?.hidden).toBe(true);
    expect([...(card?.querySelectorAll(".confirm-btn") ?? [])].map((b) => b.textContent)).toEqual([
      DEFAULT_UI_STRINGS.cancel,
      DEFAULT_UI_STRINGS.confirm,
    ]);
    expect(document.activeElement).toBe(focused);
  });

  it("resolves with the user's answer and removes the card", async () => {
    const { stage, consent } = staged();

    const allowed = consent.ask({ method: "ui/message", text: "hi" });
    click(stage, "confirm");
    const declined = consent.ask({ method: "ui/message", text: "again" });
    click(stage, "cancel");

    expect([await allowed, await declined]).toEqual([true, false]);
    expect(stage.children).toHaveLength(0);
  });

  it("ignores a second click on a card already answered", async () => {
    const { stage, consent } = staged();
    const first = consent.ask({ method: "ui/message", text: "one" });
    void consent.ask({ method: "ui/message", text: "two" });
    const spent = stage.querySelector<HTMLButtonElement>(".confirm-btn--confirm");

    spent?.click();
    spent?.click();

    expect(await first).toBe(true);
    expect(stage.querySelector(".confirm-args")?.textContent).toBe("two");
  });

  it("declines every waiting request on dispose, removes the card and asks nothing after", async () => {
    const { stage, consent } = staged();
    const shown = consent.ask({ method: "ui/message", text: "one" });
    const queued = consent.ask({ method: "ui/message", text: "two" });
    const spent = stage.querySelector<HTMLButtonElement>(".confirm-btn--confirm");

    consent.dispose();
    spent?.click();

    expect([await shown, await queued]).toEqual([false, false]);
    expect(await consent.ask({ method: "ui/message", text: "three" })).toBe(false);
    expect(stage.children).toHaveLength(0);
  });
});
