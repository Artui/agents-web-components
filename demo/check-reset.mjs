// Checks that every scenario's Try buttons and its Reset start over: the same
// Try pressed twice leaves the same conversation as pressing it once (or, on a
// row with inPlace, carries the first into the second), and Reset
// leaves an empty conversation with every control at its default. Also that
// every visible select keeps room for its chevron. And that none of it, nor
// moving between scenarios by the sidebar and Back and Forward, loads a page:
// the demo is one document that mounts each scenario in place.
//
// Serves the demo itself on a spare port; run it after `pnpm build`
// (`make demo-check` does both). BROWSER=webkit runs it in WebKit. Exits non-zero
// naming each scenario that fails.
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";
import { SCENARIOS } from "./app/scenarios.js";

const PORT = Number(process.env.PORT ?? 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["demo/mock-server.mjs"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: "ignore",
});
for (let i = 0; ; i += 1) {
  try {
    await fetch(BASE);
    break;
  } catch (error) {
    if (i > 50) throw error;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const browser = await (process.env.BROWSER === "webkit" ? webkit : chromium).launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const failures = [];
// WebKit raises the ResizeObserver loop notice as a page error (the charts
// scenario's Try does it on a fresh page load too); nothing threw.
page.on("pageerror", (error) => {
  if (!error.message.startsWith("ResizeObserver loop")) failures.push(`page error: ${error.message}`);
});
// The transcript's text with the stylesheet left out, so a count of a prompt's
// occurrences counts the bubbles and answers that carry it.
const transcript = () =>
  page.evaluate(() => {
    const root = document.querySelector("ag-ui-chat").shadowRoot;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = "";
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement?.closest("style") == null) text += walker.currentNode.data;
    }
    return text;
  });
const count = (text, needle) => text.split(needle).length - 1;
const controls = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("section:not([hidden]) .controls :is(input, select, textarea)[id]")].map(
      (c) => [c.id, c.type === "checkbox" ? c.checked : c.value],
    ),
  );
// A DOM click, because some controls move the panel over the page's own buttons.
const press = (label) =>
  page.evaluate((name) => [...document.querySelectorAll(".try button")].find((b) => b.textContent === name).click(), label);
// Nothing navigates any more, so a load state says nothing: wait, then for the run.
const settle = async () => {
  await page.waitForTimeout(2500);
  await page
    .waitForFunction(() => document.querySelector("ag-ui-chat")?.running === false, null, { timeout: 15000 })
    .catch(() => {});
};
// A marker on window outlives every mount and dies with the document.
const stayed = async (step) => {
  const { marker, entries } = await page.evaluate(() => ({
    marker: window.demoCheckMarker === true,
    entries: performance.getEntriesByType("navigation").length,
  }));
  if (!marker || entries !== 1) failures.push(`${step}: loaded a page`);
};
const shows = async (step, slug) => {
  const at = await page.evaluate(() => [location.pathname, document.querySelector("ag-ui-chat")?.id]);
  if (at[0] !== `/scenarios/${slug}/` || at[1] !== `chat-${slug}`) failures.push(`${step}: showed ${at.join(" ")}`);
};

await page.goto(`${BASE}/scenarios/${SCENARIOS[0].slug}/`);
await page.evaluate(() => {
  window.demoCheckMarker = true;
});
for (const scenario of SCENARIOS) {
  // A DOM click on the sidebar's link, which the page follows in place.
  await page.evaluate((slug) => document.querySelector(`#nav-groups a[href="/scenarios/${slug}/"]`).click(), scenario.slug);
  await settle();
  await shows(`${scenario.slug}: sidebar`, scenario.slug);
  await stayed(`${scenario.slug}: sidebar`);
  const defaults = await controls();
  // The chevron needs room: every visible select keeps its own inset arrow clear of the border.
  const cramped = await page.evaluate(() =>
    [...document.querySelectorAll("select")]
      .filter((s) => s.offsetParent !== null && parseFloat(getComputedStyle(s).paddingRight) < 24)
      .map((s) => s.id),
  );
  if (cramped.length > 0) failures.push(`${scenario.slug}: selects with no room for the chevron: ${cramped.join(", ")}`);
  for (const [label, text] of scenario.prompts) {
    await press(label);
    await settle();
    const once = count(await transcript(), text);
    await press(label);
    await settle();
    const twice = count(await transcript(), text);
    await stayed(`${scenario.slug}: Try "${label}"`);
    const expected = scenario.inPlace === true ? once * 2 : once;
    if (once === 0 || twice !== expected) {
      failures.push(`${scenario.slug}: Try "${label}" twice left ${twice} copies, once left ${once}`);
    }
  }
  // Change every control there is, then Reset.
  await page.evaluate(() => {
    for (const c of document.querySelectorAll("section:not([hidden]) .controls :is(input, select)[id]")) {
      if (c.id === "cfg-i18n") continue;
      if (c.type === "checkbox") c.checked = !c.checked;
      else if (c.tagName === "SELECT" && c.options.length > 1) c.selectedIndex = (c.selectedIndex + 1) % c.options.length;
      else if (c.type === "text" || c.type === "number") c.value = c.type === "number" ? "7" : "changed";
      c.dispatchEvent(new Event("input", { bubbles: true }));
      c.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await press("Reset");
  await settle();
  await stayed(`${scenario.slug}: Reset`);
  const after = await controls();
  if (JSON.stringify(after) !== JSON.stringify(defaults)) {
    failures.push(`${scenario.slug}: Reset left controls off their defaults`);
  }
  for (const [, text] of scenario.prompts) {
    if (count(await transcript(), text) > 0) {
      failures.push(`${scenario.slug}: Reset left "${text}" in the conversation`);
    }
  }
}

// Back and Forward walk the scenarios the sidebar visited, still in place.
const [last, previous] = SCENARIOS.slice(-2).reverse();
await page.evaluate(() => history.back());
await settle();
await shows("Back", previous.slug);
await page.evaluate(() => history.forward());
await settle();
await shows("Forward", last.slug);
await stayed("Back and Forward");

await browser.close();
server.kill();
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Try and Reset start over in place in all ${SCENARIOS.length} scenarios.`);
