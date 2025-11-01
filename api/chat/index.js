const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

module.exports = async function (context, req) {
  try {
    const endpoint = process.env.PROJECT_URL;
    const agentId  = process.env.AGENT_ID;

    const project = new AIProjectClient(endpoint, new DefaultAzureCredential());

    const agent = await project.agents.getAgent(agentId);

    // bestaand threadId uit req?.body?.threadId of nieuw maken
    const thread = await project.agents.threads.create();

    // user message
    const userText = req.body?.message || "Hello from SWA";
    await project.agents.messages.create(thread.id, "user", userText);

    // run & poll
    let run = await project.agents.runs.create(thread.id, agent.id);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise(r => setTimeout(r, 1000));
      run = await project.agents.runs.get(thread.id, run.id);
    }

    const messages = await project.agents.messages.list(thread.id, { order: "asc" });
    let replyText = "OK";
    for await (const m of messages) {
      const c = m.content?.find(c => c.type === "text" && "text" in c);
      if (m.role === "assistant" && c) replyText = c.text.value;
    }

    context.res = { json: { replyText, threadId: thread.id } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, json: { error: String(e?.message || e) } };
  }
};
