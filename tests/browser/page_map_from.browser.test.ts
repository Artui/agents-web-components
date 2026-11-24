import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { pageMapFrom } from "../../src/tools/page_map_from.js";
import { resolvePageMapHandle } from "../../src/tools/resolve_page_map_handle.js";

/**
 * The page-map walker, in a real browser: it reads visibility from layout,
 * which happy-dom does not compute, and the privacy assertions are only worth
 * anything where the fields really hold what the user typed.
 */

const SECRET = "hunter2-the-password";
const TYPED = "typed-by-the-user";

interface Entry {
  readonly handle: string;
  readonly [key: string]: unknown;
}

function stage(html: string): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("data-test-stage", "");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

function entries(map: Record<string, unknown>, kind: string): Entry[] {
  return (map[kind] ?? []) as Entry[];
}

function allEntries(map: Record<string, unknown>): Entry[] {
  return Object.entries(map)
    .filter(([kind]) => kind !== "truncated")
    .flatMap(([, list]) => list as Entry[]);
}

function chat(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  document.body.append(el);
  return el;
}

const FORM = `
  <header><h1>Account</h1><nav aria-label="Primary"><a href="/home?token=abc#top">Home</a></nav></header>
  <main>
    <h2>Sign in</h2>
    <div role="tablist">
      <button role="tab" aria-selected="true">Profile</button>
      <button role="tab" aria-selected="false">Billing</button>
    </div>
    <form aria-label="Sign in form">
      <label for="user">User name</label>
      <input id="user" name="username" type="text" required>
      <label>Password <input id="pass" name="password" type="password"></label>
      <input type="hidden" name="csrf" value="csrf-secret">
      <label>Notes <textarea name="notes">default-text-value</textarea></label>
      <label>Plan <select name="plan"><option>Free</option><option selected>Pro-selected</option></select></label>
      <input name="search" type="search" placeholder="Search orders">
      <div role="slider" aria-label="Volume" aria-valuenow="73" aria-valuetext="seventy-three"></div>
      <div contenteditable="true" aria-label="Bio">contenteditable-body</div>
      <input name="locked" type="text" disabled aria-label="Locked">
      <button type="submit">Sign in</button>
    </form>
    <table><caption>Orders</caption>
      <thead><tr><th>Number</th><th>Total</th></tr></thead>
      <tbody><tr><th scope="row">row-header-data</th><td>cell-data</td></tr></tbody>
    </table>
    <dialog open aria-label="Cookie notice"><button>Accept</button></dialog>
  </main>
  <footer><a href="https://example.org/legal?u=1">Legal</a></footer>
`;

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  for (const el of document.querySelectorAll(`[data-test-stage], ${ELEMENT_TAG}`)) {
    el.remove();
  }
});

describe("pageMapFrom", () => {
  it("lists labels and types of filled fields and never a value", () => {
    const root = stage(FORM);
    (root.querySelector("#user") as HTMLInputElement).value = TYPED;
    (root.querySelector("#pass") as HTMLInputElement).value = SECRET;
    (root.querySelector("textarea") as HTMLTextAreaElement).value = TYPED;
    (root.querySelector("[name=search]") as HTMLInputElement).value = TYPED;

    const map = pageMapFrom();
    const text = JSON.stringify(map);
    for (const leak of [
      SECRET,
      TYPED,
      "csrf",
      "default-text-value",
      "Pro-selected",
      "seventy-three",
      "73",
      "contenteditable-body",
      "row-header-data",
      "cell-data",
      "token=abc",
      "u=1",
    ]) {
      expect(text).not.toContain(leak);
    }

    const fields = entries(map, "fields");
    expect(fields.map(({ handle: _, ...rest }) => rest)).toEqual([
      { name: "username", type: "text", label: "User name", required: true },
      { name: "notes", type: "textarea", label: "Notes" },
      { name: "plan", type: "select", label: "Plan" },
      { name: "search", type: "search", label: "Search orders" },
      { type: "slider", label: "Volume" },
      { type: "contenteditable", label: "Bio" },
      { name: "locked", type: "text", label: "Locked", disabled: true },
    ]);
    expect(fields.some((f) => f["name"] === "password")).toBe(false);
  });

  it("lists headings, landmarks, tabs, buttons, links, table headers and dialogs", () => {
    stage(FORM);
    const map = pageMapFrom();
    const strip = (kind: string): Record<string, unknown>[] =>
      entries(map, kind).map(({ handle: _, ...rest }) => rest);

    expect(strip("headings")).toEqual([
      { level: 1, text: "Account" },
      { level: 2, text: "Sign in" },
    ]);
    expect(strip("landmarks")).toEqual([
      { role: "banner" },
      { role: "navigation", name: "Primary" },
      { role: "main" },
      { role: "form", name: "Sign in form" },
      { role: "contentinfo" },
    ]);
    expect(strip("tabs")).toEqual([
      { name: "Profile", selected: true },
      { name: "Billing", selected: false },
    ]);
    expect(strip("buttons")).toEqual([{ name: "Sign in" }, { name: "Accept" }]);
    expect(strip("links")).toEqual([
      { name: "Home", href: "/home" },
      { name: "Legal", href: "https://example.org/legal" },
    ]);
    expect(strip("tables")).toEqual([{ name: "Orders", headers: ["Number", "Total"] }]);
    expect(strip("dialogs")).toEqual([{ name: "Cookie notice", modal: false }]);
  });

  it("emits handles the default resolvePageTarget resolves to the same element", () => {
    const root = stage(FORM);
    const el = chat();
    const map = pageMapFrom();
    const all = allEntries(map);
    expect(all.length).toBeGreaterThan(20);
    for (const entry of all) {
      const target = el.resolvePageTarget(entry.handle);
      expect(target, entry.handle).not.toBeNull();
      expect(root.contains(target)).toBe(true);
    }
    const user = entries(map, "fields")[0] as Entry;
    expect(el.resolvePageTarget(user.handle)).toBe(root.querySelector("#user"));
  });

  it("keeps a handle across reads while its element is listed", () => {
    const root = stage(`<button id="a">A</button>`);
    const first = entries(pageMapFrom(), "buttons")[0] as Entry;
    root.insertAdjacentHTML("afterbegin", `<button id="b">B</button>`);
    const again = entries(pageMapFrom(), "buttons");
    expect(again.find((b) => b["name"] === "A")?.handle).toBe(first.handle);
    expect(new Set(again.map((b) => b.handle)).size).toBe(2);
  });

  it("skips the chat's own subtree and opted-out or hidden elements", () => {
    stage(`
      <button>Visible</button>
      <div data-agent-ignore><button>Ignored</button><h2>Ignored heading</h2></div>
      <button data-agent-ignore>Ignored itself</button>
      <div hidden><button>Hidden attr</button></div>
      <div style="display:none"><button>Display none</button></div>
      <div style="visibility:hidden"><button>Invisible</button></div>
      <div aria-hidden="true"><button>Aria hidden</button></div>
      <div inert><button>Inert</button></div>
    `);
    const el = chat();
    el.setAttribute("data-endpoint", "/agent");
    const map = pageMapFrom();
    expect(entries(map, "buttons").map((b) => b["name"])).toEqual(["Visible"]);
    expect(map["headings"]).toBeUndefined();
    expect(el.shadowRoot?.querySelector("[data-agent-handle]") ?? null).toBeNull();
  });

  it("walks open shadow roots, and their handles resolve deep", () => {
    const root = stage(`<div id="host"></div><div id="closed"></div>`);
    const shadow = (root.querySelector("#host") as HTMLElement).attachShadow({ mode: "open" });
    shadow.innerHTML = `<label>Deep <input name="deep"></label><button><slot></slot></button>`;
    (root.querySelector("#host") as HTMLElement).append("Slotted name");
    const closed = (root.querySelector("#closed") as HTMLElement).attachShadow({ mode: "closed" });
    closed.innerHTML = `<button>Closed</button>`;

    const map = pageMapFrom();
    const field = entries(map, "fields")[0] as Entry;
    expect(field["label"]).toBe("Deep");
    expect(entries(map, "buttons").map((b) => b["name"])).toEqual(["Slotted name"]);
    expect(document.querySelector(field.handle)).toBeNull();
    expect(chat().resolvePageTarget(field.handle)).toBe(shadow.querySelector("input"));
  });

  it("resolves a selector that is not a handle in the light DOM only, as before", () => {
    const root = stage(`<div id="host"></div>`);
    const shadow = (root.querySelector("#host") as HTMLElement).attachShadow({ mode: "open" });
    shadow.innerHTML = `<button class="only-deep" data-agent-handle="41">Deep</button>`;
    const el = chat();
    expect(el.resolvePageTarget(".only-deep")).toBeNull();
    expect(el.resolvePageTarget('button[data-agent-handle="41"]')).toBeNull();
    expect(el.resolvePageTarget("[data-agent-handle='41']")).toBeNull();
    expect(el.resolvePageTarget('[data-agent-handle="41"]')).toBe(shadow.querySelector("button"));
  });

  it("never reads a value through a name that points at an editable region", () => {
    stage(`
      <div id="lbl">Comment <div contenteditable="true">ce-leak</div><input value="input-leak"></div>
      <div role="textbox" aria-labelledby="lbl missing"></div>
      <button>Send <span contenteditable="plaintext-only">draft-leak</span></button>
    `);
    const map = pageMapFrom();
    expect(JSON.stringify(map)).not.toMatch(/leak/);
    expect(entries(map, "fields").find((f) => f["type"] === "textbox")?.["label"]).toBe("Comment");
    expect(entries(map, "buttons")[0]?.["name"]).toBe("Send");
  });

  it("names each kind by role, attribute, caption, alt or placeholder", () => {
    stage(`
      <div role="heading" aria-level="3">Role heading</div>
      <div role="heading">Default level</div>
      <h4 aria-level="5">Overridden</h4>
      <section aria-labelledby="sec"><h2 id="sec">Section</h2>
        <header>Not a banner</header><footer>Not contentinfo</footer></section>
      <section>Unnamed section</section>
      <form>Unnamed form</form>
      <aside title="Side"></aside>
      <search></search>
      <div role="navigation  extra" aria-label="  "></div>
      <div role="presentation"><span>plain</span></div>
      <div role="alertdialog" aria-labelledby="ad" aria-modal="true"><p id="ad">Careful</p></div>
      <table><tr><th>Row one header</th><td>x</td></tr></table>
      <table aria-label="Empty"><tr><td>x</td></tr></table>
      <div role="grid" title="Grid"><div role="columnheader">Col</div><div role="columnheader"></div></div>
      <input type="image" alt="Go">
      <input type="reset">
      <input type="button" aria-label="Labelled">
      <input type="button">
      <input type="checkbox" aria-required="true" aria-disabled="true" title="Agree">
      <select multiple aria-label="Many"><option>a</option></select>
      <div role="switch">Wifi</div>
      <a href="#frag"><img alt="Logo"> Home</a>
      <a role="link">No href</a>
      <span role="link">Span link</span>
      <a>Not a link</a>
      <div role="tab" aria-disabled="true">Off tab</div>
      <button>${"x".repeat(100)}</button>
      <button><span hidden>gone</span><span aria-hidden="true">gone</span><img><!-- note -->Icon</button>
      <h6 role="">Empty role</h6>
      <input type="image">
      <table aria-label="Bare"><caption>Bare caption</caption></table>
      <button aria-labelledby="missing" aria-label="Fallback label">Content</button>
      <button id="iconic"></button>
    `);
    const icon = (document.querySelector("#iconic") as HTMLElement).appendChild(
      document.createElement("span"),
    );
    icon.attachShadow({ mode: "open" }).innerHTML = "<b>Star</b>";
    const map = pageMapFrom();
    const strip = (kind: string): Record<string, unknown>[] =>
      entries(map, kind).map(({ handle: _, ...rest }) => rest);
    expect(strip("headings")).toEqual([
      { level: 3, text: "Role heading" },
      { level: 2, text: "Default level" },
      { level: 5, text: "Overridden" },
      { level: 2, text: "Section" },
      { level: 6, text: "Empty role" },
    ]);
    expect(strip("landmarks")).toEqual([
      { role: "region", name: "Section" },
      { role: "complementary", name: "Side" },
      { role: "search" },
      { role: "navigation" },
    ]);
    expect(strip("dialogs")).toEqual([{ name: "Careful", modal: true }]);
    expect(strip("tables")).toEqual([
      { headers: ["Row one header"] },
      { name: "Empty", headers: [] },
      { name: "Grid", headers: ["Col"] },
      { name: "Bare", headers: [] },
    ]);
    expect(strip("fields")).toEqual([
      { type: "checkbox", label: "Agree", required: true, disabled: true },
      { type: "select-multiple", label: "Many" },
      { type: "switch" },
    ]);
    expect(strip("buttons")).toEqual([
      { name: "Go" },
      { name: "Reset" },
      { name: "Labelled" },
      {},
      { name: `${"x".repeat(79)}\u2026` },
      { name: "Icon" },
      {},
      { name: "Fallback label" },
      { name: "Star" },
    ]);
    expect(strip("links")).toEqual([
      { name: "Logo Home", href: "/" },
      { name: "No href" },
      { name: "Span link" },
    ]);
    expect(strip("tabs")).toEqual([{ name: "Off tab", selected: false, disabled: true }]);
  });

  it("restamps a handle another element already holds, and a foreign one", () => {
    const root = stage(`<button id="a">A</button>`);
    const first = entries(pageMapFrom(), "buttons")[0] as Entry;
    const a = root.querySelector("#a") as HTMLElement;
    a.before(a.cloneNode(true));
    const shadow = (root.appendChild(document.createElement("div")) as HTMLElement).attachShadow({
      mode: "open",
    });
    shadow.append(a.cloneNode(true));
    const odd = root.appendChild(document.createElement("button"));
    odd.textContent = "Odd";
    odd.setAttribute("data-agent-handle", "x");
    const buttons = entries(pageMapFrom(), "buttons");
    const handles = buttons.map((b) => b.handle);
    expect(new Set(handles).size).toBe(4);
    expect(handles).not.toContain('[data-agent-handle="x"]');
    expect(handles.filter((h) => h === first.handle)).toHaveLength(1);
    for (const { handle } of buttons) {
      expect(resolvePageMapHandle(handle)?.getAttribute("data-agent-handle")).toBe(
        /"(.*)"/.exec(handle)?.[1],
      );
    }
  });

  it("walks into display: contents and falls back to a slot's own content", () => {
    const root = stage(
      `<div style="display: contents"><button>Inside contents</button></div><div id="h"></div>`,
    );
    const shadow = (root.querySelector("#h") as HTMLElement).attachShadow({ mode: "open" });
    shadow.innerHTML = `<button><slot>Fallback</slot></button>`;
    expect(entries(pageMapFrom(), "buttons").map((b) => b["name"])).toEqual([
      "Inside contents",
      "Fallback",
    ]);
  });

  it("resolves nothing for a handle no element holds, skipping the chat's shadow", () => {
    const el = chat();
    const inner = el.shadowRoot?.appendChild(document.createElement("b"));
    inner?.setAttribute("data-agent-handle", "998");
    const plain = stage(`<div id="h"></div>`);
    (plain.querySelector("#h") as HTMLElement).attachShadow({ mode: "open" });
    expect(resolvePageMapHandle('[data-agent-handle="998"]')).toBeNull();
    expect(el.resolvePageTarget('[data-agent-handle="999"]')).toBeNull();
  });

  it("caps each kind and says how many it left out", () => {
    stage(Array.from({ length: 7 }, (_, i) => `<button>B${i}</button>`).join(""));
    const map = pageMapFrom(document, { limits: { buttons: 3 } });
    expect(entries(map, "buttons").map((b) => b["name"])).toEqual(["B0", "B1", "B2"]);
    expect(map["truncated"]).toEqual({ buttons: 4 });
  });

  it("reads only the root it is given", () => {
    stage(`<button>Outside</button>`);
    const inner = stage(`<button>Inside</button>`);
    expect(entries(pageMapFrom(inner), "buttons").map((b) => b["name"])).toEqual(["Inside"]);
  });
});

describe("pageMapFrom privacy probes", () => {
  const leaks = (map: Record<string, unknown>): string[] =>
    JSON.stringify(map).match(/[a-z-]*leak[a-z-]*/g) ?? [];
  const shadowed = (tag: string, html: string): void => {
    if (!customElements.get(tag)) {
      customElements.define(
        tag,
        class extends HTMLElement {
          connectedCallback(): void {
            if (this.shadowRoot === null) {
              this.attachShadow({ mode: "open" }).innerHTML = html;
            }
          }
        },
      );
    }
  };

  it("never reads an editable heading, header cell or tab", () => {
    const root = stage(`
      <h1 contenteditable="true"></h1>
      <table><thead><tr><th contenteditable="true"></th><th>Total</th></tr></thead></table>
      <div role="tab" contenteditable="true"></div>
    `);
    for (const el of root.querySelectorAll("[contenteditable]")) {
      el.textContent = `${el.localName === "h1" ? "typed-heading" : el.localName === "th" ? "th" : "tab"}-leak`;
    }
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    expect(entries(map, "tables")[0]?.["headers"]).toEqual(["Total"]);
    expect(map["headings"]).toBeUndefined();
    expect(map["tabs"]).toBeUndefined();
    expect(entries(map, "fields").map((f) => f["type"])).toEqual([
      "contenteditable",
      "contenteditable",
      "contenteditable",
    ]);
  });

  it("never names a control by an editable region, a textarea or a select it points at", () => {
    stage(`
      <span id="ce" contenteditable="true">ce-root-leak</span>
      <button aria-labelledby="ce" aria-label="Fallback">x</button>
      <textarea id="ta">prefilled-leak</textarea>
      <section aria-labelledby="ta"><p>a</p></section>
      <select id="sel"><option>opt-a</option><option selected>opt-selected-leak</option></select>
      <nav aria-labelledby="sel"></nav>
      <span id="out-ref"><output>output-ref-leak</output></span>
      <aside aria-labelledby="out-ref"></aside>
    `);
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    expect(JSON.stringify(map)).not.toContain("opt-a");
    expect(entries(map, "buttons").map((b) => b["name"])).toContain("Fallback");
  });

  it("never reads text from this package's elements or their shadow roots", () => {
    shadowed("ag-ui-probe-x", "<b>pkg-shadow-leak</b>");
    shadowed("ag-ui-probe-y", "<b>pkg-shadow-leak</b>");
    stage(`<h2>Inbox <ag-ui-probe-x></ag-ui-probe-x></h2>
      <button>Go <ag-ui-probe-y>light-pkg-leak</ag-ui-probe-y></button>`);
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    expect(entries(map, "headings")[0]?.["text"]).toBe("Inbox");
    expect(entries(map, "buttons")[0]?.["name"]).toBe("Go");
  });

  it("never reads text hidden by CSS, an opt-out or an output", () => {
    stage(`
      <button>Pay <span style="display:none">css-hidden-leak</span><span style="visibility:hidden">invisible-leak</span></button>
      <button>Go <span data-agent-ignore>ignored-leak</span></button>
      <button>Total <output>output-leak</output></button>
    `);
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    expect(entries(map, "buttons").map((b) => b["name"])).toEqual(["Pay", "Go", "Total"]);
  });

  it("gives a link to another scheme as its scheme alone, and clips an href", () => {
    stage(`
      <a href="mailto:jane-leak@example.com">Mail</a>
      <a href="tel:+15551234">Call</a>
      <a href="javascript:void(0)">Nothing</a>
      <a href="data:text/csv,a-leak,b">Export</a>
      <a href="https://example.org/${"p".repeat(120)}">Long</a>
    `);
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    const hrefs = entries(map, "links").map((l) => l["href"] as string);
    expect(hrefs.slice(0, 4)).toEqual(["mailto:", "tel:", "javascript:", "data:"]);
    expect(hrefs[4]?.length).toBe(80);
    expect(JSON.stringify(map)).not.toContain("5551234");
  });

  it("lists nothing inside an editable region or a listbox", () => {
    stage(`
      <div contenteditable="true" aria-label="Editor"><h3>editor-heading-leak</h3><button>editor-button-leak</button></div>
      <div role="listbox" aria-label="Pick"><button>listbox-button-leak</button></div>
    `);
    const map = pageMapFrom();
    expect(leaks(map)).toEqual([]);
    expect(entries(map, "fields").map((f) => f["label"])).toEqual(["Editor", "Pick"]);
    expect(map["headings"]).toBeUndefined();
    expect(map["buttons"]).toBeUndefined();
  });
});
