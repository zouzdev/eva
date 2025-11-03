// vóór:
const client = new AIProjectClient(endpoint, new AzureKeyCredential(apiKey));

// na:
const client = new AIProjectClient(
  endpoint,
  new AzureKeyCredential(apiKey),
  { apiKeyHeaderName: "api-key" }     // <-- dit is de vereiste headernaam
);
