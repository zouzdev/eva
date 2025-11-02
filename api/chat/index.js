const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureKeyCredential } = require("@azure/core-auth");
const project = new AIProjectClient(process.env.PROJECT_URL, new AzureKeyCredential(process.env.PROJECT_API_KEY));

module.exports = async function (context, req) {
  try {
    const endpoint = process.env.PROJECT_URL;
    const agentId  = process.env.AGENT_ID;

    const project = new AIProjectClient(endpoint, new DefaultAzureCredential());

    // haal agent (valideert ook je toegang)
    await project.agents.getAgent(agentId);

    // bestaand threadId of nieuw
    let threadId = req.body?.threadId;
    if (!threadId) {
      const t = await project.agents.threads.create();
      threadId = t.id;
    }

    const userText = req.body?.message || "Hello from SWA";

    // user message plaatsen
    await project.agents.messages.create(threadId, "user", userText);

    // run starten + pollen
    let run = await project.agents.runs.create(threadId, agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise(r => setTimeout(r, 1000));
      run = await project.agents.runs.get(threadId, run.id);
    }

    if (run.status === "failed") {
      throw new Error(run.lastError?.message || "Run failed");
    }

    // laatste assistant-bericht ophalen
    let replyText = "OK";
    const messages = await project.agents.messages.list(threadId, { order: "asc" });
    for await (const m of messages) {
      const c = m.content?.find(c => c.type === "text" && "text" in c);
      if (m.role === "assistant" && c) replyText = c.text.value;
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { replyText, threadId }
    };
  } catch (e) {
    context.log.error(e);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: String(e?.message || e) }
    };
  }
};

