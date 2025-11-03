const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureKeyCredential } = require("@azure/core-auth");

const PROJECT_URL = process.env.PROJECT_URL;
const PROJECT_API_KEY = process.env.PROJECT_API_KEY; // Project API key (Foundry)
const AGENT_ID = process.env.AGENT_ID;

// vaste headernaam voor Azure AI Foundry
const API_KEY_HEADER_NAME = "x-ms-api-key";

module.exports = async function (context, req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    if (!PROJECT_URL) throw new Error("Missing env PROJECT_URL");
    if (!AGENT_ID)    throw new Error("Missing env AGENT_ID");

    // Gebruik API key als die er is; anders Managed Identity
    const credential = PROJECT_API_KEY
      ? new AzureKeyCredential(PROJECT_API_KEY)
      : new DefaultAzureCredential();

    // >>> Belangrijk: headernaam hardcoderen <<<
    const client = new AIProjectClient(PROJECT_URL, credential, {
      apiKeyHeaderName: API_KEY_HEADER_NAME,
    });

    // check agent
    await client.agents.getAgent(AGENT_ID);

    // thread bepalen
    const existingThreadId = req.body?.threadId || null;
    const thread = existingThreadId
      ? { id: existingThreadId }
      : await client.agents.threads.create();

    // user message
    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(thread.id, "user", userText);

    // run + poll
    let run = await client.agents.runs.create(thread.id, AGENT_ID);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 1000));
      run = await client.agents.runs.get(thread.id, run.id);
    }

    // laatste assistant tekst
    let replyText = "No assistant text found.";
    for await (const m of client.agents.messages.list(thread.id, { order: "desc" })) {
      if (m.role === "assistant") {
        const t = m.content?.find((c) => c.type === "text")?.text?.value;
        if (t) { replyText = t; break; }
      }
    }

    context.res = {
      status: 200,
      headers: cors(),
      body: { replyText, threadId: thread.id, runStatus: run.status },
    };
  } catch (e) {
    context.log.error("chat error:", e);
    context.res = {
      status: 500,
      headers: cors(),
      body: { error: e?.message ?? String(e) },
    };
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
