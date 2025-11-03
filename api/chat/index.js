// api/chat/index.js
const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureKeyCredential } = require("@azure/core-auth");

// Helper: CORS headers
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type"
  };
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function (context, req) {
  // Preflight
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    const endpoint = process.env.PROJECT_URL;
    const agentId  = process.env.AGENT_ID;
    const apiKey   = process.env.PROJECT_API_KEY; // AI Foundry Project API Key

    if (!endpoint || !agentId) {
      throw new Error("Missing env vars: PROJECT_URL and/or AGENT_ID");
    }

    // Kies credential: API key (met headernaam) > Managed Identity/Env
    const client = apiKey
      ? new AIProjectClient(
          endpoint,
          new AzureKeyCredential(apiKey),
          { apiKeyHeaderName: "api-key" } // <-- noodzakelijke headernaam
        )
      : new AIProjectClient(endpoint, new DefaultAzureCredential());

    // (optioneel) valideer agent bestaat
    await client.agents.getAgent(agentId);

    // Thread aanmaken of hergebruiken
    const threadId =
      req.body?.threadId || (await client.agents.threads.create()).id;

    // User message
    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(threadId, "user", userText);

    // Run + pollen
    let run = await client.agents.runs.create(threadId, agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await delay(1000);
      run = await client.agents.runs.get(threadId, run.id);
    }

    // Laatste assistant-tekst ophalen
    let replyText = "No assistant text found.";
    for await (const m of client.agents.messages.list(threadId, { order: "desc" })) {
      if (m.role === "assistant") {
        const t = m.content?.find((c) => c.type === "text")?.text?.value;
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
