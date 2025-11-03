const { AIProjectClient } = require("@azure/ai-projects");
const { AzureKeyCredential } = require("@azure/core-auth");

const PROJECT_URL   = process.env.PROJECT_URL;     // bv. https://...services.ai.azure.com/api/projects/...
const AGENT_ID      = process.env.AGENT_ID;        // asst_...
const PROJECT_API_KEY = process.env.PROJECT_API_KEY; // <-- zet in Config

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    if (!PROJECT_URL || !AGENT_ID) throw new Error("Missing env PROJECT_URL or AGENT_ID");
    if (!PROJECT_API_KEY) throw new Error("Missing env PROJECT_API_KEY");

    // Azure AI Foundry gebruikt deze headernaam:
    const client = new AIProjectClient(PROJECT_URL, new AzureKeyCredential(PROJECT_API_KEY), {
      apiKeyHeaderName: "x-ms-api-key",
    });

    // check agent
    await client.agents.getAgent(AGENT_ID);

    const threadId = req.body?.threadId ?? (await client.agents.threads.create()).id;
    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(threadId, "user", userText);

    let run = await client.agents.runs.create(threadId, AGENT_ID);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise(r => setTimeout(r, 1000));
      run = await client.agents.runs.get(threadId, run.id);
    }

    let replyText = "No assistant text found.";
    for await (const m of client.agents.messages.list(threadId, { order: "desc" })) {
      if (m.role === "assistant") {
        const t = m.content?.find(c => c.type === "text")?.text?.value;
        if (t) { replyText = t; break; }
      }
    }

    context.res = { status: 200, headers: cors(), body: { replyText, threadId, runStatus: run.status } };
  } catch (e) {
    context.log.error("chat error:", e);
    context.res = { status: 500, headers: cors(), body: { error: e?.message ?? String(e) } };
  }
};

function cors(){
  return {
    "Access-Control-Allow-Origin": "https://red-ocean-056975003.3.azurestaticapps.net",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
