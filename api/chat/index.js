const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

const PROJECT_URL = process.env.PROJECT_URL;
const AGENT_ID    = process.env.AGENT_ID;

module.exports = async function (context, req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    if (!PROJECT_URL) throw new Error("Missing env PROJECT_URL");
    if (!AGENT_ID)    throw new Error("Missing env AGENT_ID");

    // ***** Belangrijk: alleen Managed Identity *****
    const credential = new DefaultAzureCredential();

    // Log even welke vars er binnenkomen (zonder geheimen)
    context.log("AI chat starting", {
      hasProjectUrl: Boolean(PROJECT_URL),
      hasAgentId: Boolean(AGENT_ID),
      usingMI: true
    });

    const client = new AIProjectClient(PROJECT_URL, credential);

    // Validatie dat agent bestaat
    await client.agents.getAgent(AGENT_ID);

    // Thread bepalen (hergebruiken als meegegeven)
    const existingThreadId = req.body?.threadId || null;
    const thread = existingThreadId
      ? { id: existingThreadId }
      : await client.agents.threads.create();

    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(thread.id, "user", userText);

    // Run + poll
    let run = await client.agents.runs.create(thread.id, AGENT_ID);
    while (run.status === "queued" || run.status === "in_progress") {
      await delay(1000);
      run = await client.agents.runs.get(thread.id, run.id);
    }

    // Laatste assistant-tekst
    let replyText = "No assistant text found.";
    for await (const m of client.agents.messages.list(thread.id, { order: "desc" })) {
      if (m.role === "assistant") {
        const t = m.content?.find(c => c.type === "text")?.text?.value;
        if (t) { replyText = t; break; }
      }
    }

    context.res = {
      status: 200,
      headers: cors(),
      body: { replyText, threadId: thread.id, runStatus: run.status }
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
    "Access-Control-Allow-Headers": "content-type",
  };
}
