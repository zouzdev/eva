// /api/chat/index.js  (CommonJS, Node 18)
module.exports = async function (context, req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    if (req.method === 'OPTIONS') {
      context.res = { status: 204, headers: CORS };
      return;
    }

    // Veilig JSON lezen
    let body = {};
    try {
      // In v3-model staat parsed JSON in req.body als header Content-Type: application/json is
      body = req.body || {};
    } catch (e) {
      // fallback (zou bijna nooit nodig moeten zijn)
      body = {};
    }

    const message   = typeof body.message === 'string' ? body.message : '';
    const projectUrl = process.env.PROJECT_URL || body.projectUrl || '';
    const agentId    = process.env.AGENT_ID    || body.agentId    || '';

    // Log intern (bekijk via SWA → Functions → Log stream)
    context.log('chat fn start', { hasMessage: !!message, hasProjectUrl: !!projectUrl, hasAgentId: !!agentId });

    // Simpele, veilige reply om 404/500 uit te sluiten
    const replyText = message ? `Echo: ${message}` : 'No message received';

    context.res = {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: { replyText, threadId: null, debug: { hasProjectUrl: !!projectUrl, hasAgentId: !!agentId } }
    };
  } catch (err) {
    // Geef fout terug, niet crashen
    context.log('chat fn error', err);
    context.res = {
      status: 200, // 200 teruggeven zodat je het antwoord in de browser ziet
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: { error: true, message: String(err && err.message || err) }
    };
  }
};
