/** The timezone text field and the zones it suggests. */
export interface TimezoneField {
  readonly input: HTMLInputElement;
  readonly list: HTMLDataListElement;
}

/**
 * Build the timezone field over `zone`, or the viewer's zone when `zone` is empty.
 *
 * A text input, so any zone the server accepts can be typed; the suggestions
 * are the browser's IANA zones plus the routine's and the viewer's, which the
 * browser's list may name differently (an alias such as Asia/Calcutta). An
 * unknown zone is the server's to refuse.
 */
export function buildTimezoneField(zone: string): TimezoneField {
  const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = zone === "" ? viewer : zone;
  const list = document.createElement("datalist");
  list.id = "routine-zones";
  const zones = new Set([...Intl.supportedValuesOf("timeZone"), input.value, viewer]);
  list.append(...[...zones].sort().map((name) => option(name)));
  input.setAttribute("list", list.id);
  return { input, list };
}

function option(value: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = value;
  return choice;
}
