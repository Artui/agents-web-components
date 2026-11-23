// The agents home demo: one <ag-ui-agents> provider over two agents, a button
// per directory entry switching its chat, an <ag-ui-inbox> badge in the header
// and its list in the rail (what waits on the user, every agent), and an
// <ag-ui-threads> bound through the provider. /agents/?stream watches the
// inbox by SSE instead of polling.
import {
  AGENT_CHANGE_EVENT,
  AGENTS_CHANGE_EVENT,
  defineAgents,
  defineChat,
  INBOX_CHANGE_EVENT,
} from "/bundle.js";
import { defineInbox, INBOX_ANSWER_EVENT, INBOX_SELECT_EVENT } from "/inbox.bundle.js";
import { defineThreads } from "/threads.bundle.js";

const home = document.getElementById("home");
if (new URLSearchParams(location.search).has("stream")) {
  home.setAttribute("data-inbox-transport", "stream");
}

const log = (text) => {
  const item = document.createElement("li");
  item.textContent = text;
  document.getElementById("log").prepend(item);
};

const drawAgents = () => {
  const group = document.getElementById("agents");
  group.replaceChildren(
    ...home.agents.map((agent) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = agent.name;
      button.title = agent.description;
      button.setAttribute("aria-pressed", String(agent.id === home.agent));
      button.addEventListener("click", () => {
        home.agent = agent.id;
      });
      return button;
    }),
  );
};

home.addEventListener(AGENTS_CHANGE_EVENT, (event) => {
  log(`ag-ui-agents-change: ${event.detail.agents.map((agent) => agent.id).join(", ")}`);
  drawAgents();
});
home.addEventListener(AGENT_CHANGE_EVENT, (event) => {
  log(`ag-ui-agent-change: ${event.detail.agent.id} (${event.detail.agent.endpoint})`);
  drawAgents();
});
home.addEventListener(INBOX_CHANGE_EVENT, (event) => {
  log(`ag-ui-inbox-change: ${event.detail.threads.length} rows`);
});
home.addEventListener(INBOX_SELECT_EVENT, (event) => {
  log(`ag-ui-inbox-select: ${event.detail.agentId}/${event.detail.threadId}`);
});

home.addEventListener(INBOX_ANSWER_EVENT, (event) => {
  const { agentId, threadId, approved, outcome, status } = event.detail;
  log(
    `ag-ui-inbox-answer: ${agentId}/${threadId} ${approved ? "approved" : "denied"} -> ${outcome} (${status})`,
  );
});

defineAgents();
defineChat();
defineThreads();
defineInbox();
