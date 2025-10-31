import { app } from "@azure/functions";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra
  };
}

app.http("chat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req) => {
    if (req.method === "OPTIONS") {
      return { status: 204, headers: cors() };
    }

    try {
      const body = await req.json();
      const message = body?.message ?? "";
      let threadId = body?.threadId ?? null;

      const PROJECT_URL = process.env.PROJECT_URL;
      const AGENT_ID    = process.env.AGENT_ID;

      if (!message)    return { status: 400, headers: cors(), jsonBody: { error: "message required" } };
      if (!PROJECT_URL) return { status: 500, headers: cors(), jsonBody: { error: "Missing PROJECT_URL" } };
      if (!AGENT_ID)    return { status: 500, headers: cors(), jsonBody: { error: "Missing AGENT_ID" } };

      const client = new AIProjectClient(PROJECT_URL, new DefaultAzureCredential());
      const agent  = await client.agents.getAgent(AGENT_ID);

      // Create thread if not present
      if (!threadId) {
        const thread = await client.agents.threads.create();
        threadId = thread.id;
      }

      // Send user message
      await client.agents.messages.create(threadId, "user", message);

      // Run
      let run = await client.agents.runs.create(threadId, agent.id);
      while (run.status === "queued" || run.status === "in_progress") {
        await new Promise((r) => setTimeout(r, 1000));
        run = await client.agents.runs.get(threadId, run.id);
      }

      // Failed?
      if (run.status === "failed") {
        return { status: 500, headers: cors(), jsonBody: { error: "Run failed", threadId } };
      }

      // Collect assistant reply
      const list = client.agents.messages.list(threadId, { order: "asc" });
      let replyText = "OK";

      for await (const m of list) {
        const part = m.content.find((x) => x.type === "text" && x.text);
        if (m.role === "assistant" && part?.text?.value) {
          replyText = part.text.value;
        }
      }

      return {
        status: 200,
        headers: cors({ "Content-Type": "application/json" }),
        jsonBody: { threadId, replyText }
      };
    } catch (err) {
      return { status: 500, headers: cors(), jsonBody: { error: err.message } };
    }
  }
});
