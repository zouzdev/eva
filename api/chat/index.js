const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureKeyCredential } = require("@azure/core-auth");

const endpoint = process.env.PROJECT_URL;
const apiKey   = process.env.PROJECT_API_KEY;

const project = apiKey
  ? new AIProjectClient(endpoint, new AzureKeyCredential(apiKey))   // <-- gebruikt API key
  : new AIProjectClient(endpoint, new DefaultAzureCredential());    // fallback MI/Env

module.exports = async function (context, req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    const endpoint = process.env.PROJECT_URL;
    const agentId  = process.env.AGENT_ID;
    const apiKey   = process.env.PROJECT_API_KEY; // optioneel

    if (!endpoint || !agentId) {
      throw new Error("Missing env: PROJECT_URL and/or AGENT_ID");
    }

    // Kies credential: API key > Managed Identity
    const credential = apiKey ? new AzureKeyCredential(apiKey)
                              : new DefaultAzureCredential();

    const client = new AIProjectClient(endpoint, credential);

    // desnoods validatie van agent
    await client.agents.getAgent(agentId);

    // bestaand thread of nieuwe
    const threadId = req.body?.threadId ?? (await client.agents.threads.create()).id;

    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(threadId, "user", userText);

    // run en pollen
    let run = await client.agents.runs.create(threadId, agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await delay(1000);
      run = await client.agents.runs.get(threadId, run.id);
    }

    // laatste assistant-tekst pakken
    let replyText = "No assistant text found.";
    for await (const m of client.agents.messages.list(threadId, { order: "desc" })) {
      if (m.role === "assistant") {
        const t = m.content?.find(c => c.type === "text")?.text?.value;
        if (t) { replyText = t; break; }
      }
    }

    context.res = {
      status: 200,
      headers: cors(),
      body: { replyText, threadId, runStatus: run.status }
    };
  } catch (e) {
    context.log.error("chat error:", e);
    context.res = {
      status: 500,
      headers: cors(),
      body: { error: e?.message ?? String(e) }
    };
  }
};

function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
function cors(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type"
  };
}

