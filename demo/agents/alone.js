// Each piece of the agents home imported alone, from its own entry, against the
// mock server: /agents/alone.html?piece=inbox|threads|chat. Only the chosen
// piece's modules are fetched.
const piece = new URLSearchParams(location.search).get("piece") ?? "chat";
const main = document.getElementById("piece");
document.getElementById("title").textContent = `<ag-ui-${piece}> alone`;

const provider = (children) => `<ag-ui-agents data-agents-url="/agents-home/agents/"
  data-inbox-url="/agents-home/inbox/" style="display: contents">${children}</ag-ui-agents>`;

if (piece === "inbox") {
  const { defineAgents } = await import("/bundle.js");
  const { defineInbox } = await import("/inbox.bundle.js");
  main.innerHTML = provider('<ag-ui-inbox variant="list"></ag-ui-inbox>');
  defineAgents();
  defineInbox();
} else if (piece === "threads") {
  const { defineChat } = await import("/bundle.js");
  const { defineThreads } = await import("/threads.bundle.js");
  main.innerHTML =
    '<ag-ui-threads for="chat"></ag-ui-threads><ag-ui-chat id="chat" endpoint="/status/agent/" data-threads-url="/status/threads/" placement="embedded" data-start-open></ag-ui-chat>';
  defineChat();
  defineThreads();
} else {
  const { defineChat } = await import("/bundle.js");
  main.innerHTML =
    '<ag-ui-chat endpoint="/agent/" placement="page" data-start-open></ag-ui-chat>';
  defineChat();
}
