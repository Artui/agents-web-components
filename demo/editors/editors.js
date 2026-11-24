// The editor elements: <ag-ui-routines> and <ag-ui-skills> mounted away from
// the chat. /editors/ binds both to a chat that hands its editors to the page
// (data-editors="external"); /editors/?alone mounts them with only their URL
// and their own CSRF token, no chat on the page.
import { defineChat } from "/bundle.js";
import { defineRoutines } from "/routines.bundle.js";
import { defineSkills } from "/skills.bundle.js";

const alone = new URLSearchParams(location.search).has("alone");
const main = document.getElementById("main");
document.getElementById(alone ? "nav-alone" : "nav-bound").setAttribute("aria-current", "page");

const routines = document.createElement("ag-ui-routines");
const skills = document.createElement("ag-ui-skills");

if (alone) {
  main.classList.add("alone");
  routines.setAttribute("data-routines-url", "/routines/routines/");
  skills.setAttribute("data-skill-editor-url", "/skills/editor/");
  skills.setAttribute("data-csrf-token", "demo-token");
  document.getElementById("hint").textContent =
    "No chat on this page: each element has only its URL, and the skills one its own CSRF token. " +
    "Make this a routine and Draft one with the agent are absent, and a routine's last result " +
    "fires ag-ui-routines-open-thread, logged to the console.";
} else {
  const chat = document.createElement("ag-ui-chat");
  chat.id = "chat";
  for (const [name, value] of Object.entries({
    endpoint: "/agent/",
    placement: "embedded",
    "data-start-open": "",
    "data-routines-url": "/routines/routines/",
    "data-threads-url": "/routines/threads/",
    "data-skills-url": "/skills/",
    "data-skill-editor-url": "/skills/editor/",
    "data-skill-editor-button": "",
    "data-slash-commands": "true",
    "data-editors": "external",
  })) {
    chat.setAttribute(name, value);
  }
  chat.getHeaders = () => ({ "X-CSRFToken": "demo-token" });
  main.append(chat);
  routines.setAttribute("for", "chat");
  skills.setAttribute("for", "chat");
  document.getElementById("hint").textContent =
    "Both elements are bound by for=\"chat\", and the chat carries data-editors=\"external\": its " +
    "Routines and Skills buttons, Make this a routine and the palette's Manage skills land here " +
    "instead of in its panel. Send a turn, and Make this a routine appears at the foot of the list.";
  defineChat();
}

document.getElementById("routines-card").append(routines);
document.getElementById("skills-card").append(skills);
document.addEventListener("ag-ui-routines-open-thread", (event) => {
  console.info("ag-ui-routines-open-thread", event.detail);
});
document.addEventListener("ag-ui-open-editor", (event) => {
  const card = document.getElementById(`${event.detail.editor}-card`);
  card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
defineRoutines();
defineSkills();
