// api/chat/index.js
const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureKeyCredential } = require("@azure/core-auth");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
});

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: cors() };
    return;
  }

  try {
    const endpoint = process.env.PROJECT_URL;
    const agentId  = process.env.AGENT_ID;
    const apiKey   = process.env.PROJECT_API_KEY;

    if (!endpoint || !agentId) {
      throw new Error("Missing env vars: PROJECT_URL and/or AGENT_ID");
    }

    // Zet de headernaam redundantly:
    //  - via code (options.apiKeyHeaderName)
    //  - via env var die sommige versies van de SDK ook respecteren
    process.env.AZURE_AI_PROJECTS_API_KEY_HEADER_NAME =
      process.env.AZURE_AI_PROJECTS_API_KEY_HEADER_NAME || "api-key";

    const client =
      apiKey
        ? new AIProjectClient(
            endpoint,
            new AzureKeyCredential(apiKey),
            {
              // Sommige 1.0.x builds vereisen expliciet deze optie
              apiKeyHeaderName: "api-key"
            }
          )
        : new AIProjectClient(endpoint, new DefaultAzureCredential());

    // (optioneel) validatie agent
    await client.agents.getAgent(agentId);

    // Thread reuse/nieuw
    const threadId =
      req.body?.threadId || (await client.agents.threads.create()).id;

    // User bericht
    const userText = req.body?.message ?? "Hello from SWA";
    await client.agents.messages.create(threadId, "user", userText);

    // Run + poll
    let run = await client.agents.runs.create(threadId, agentId);
    while (run.status === "queued" || run.status === "in_progress") {
      await delay(1000);
      run = await client.agents.runs.get(threadId, run.id);
    }

    // Laatste assistant-tekst
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
