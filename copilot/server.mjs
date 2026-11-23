import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const HOST = process.env.COPILOT_HOST || '127.0.0.1';
const PORT = Number(process.env.COPILOT_PORT || 8842);
const ACCESS_TOKEN = process.env.COPILOT_ACCESS_TOKEN || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
const ALLOWED_ORIGINS = new Set((process.env.COPILOT_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
const MAX_SDP_BYTES = 1024 * 1024;

const INSTRUCTIONS = [
  'You are Orion, the warm, capable flight computer aboard a family starship on a pretend adventure.',
  'Speak naturally and briefly, as a friendly spaceship manager. Stay in character without claiming real-world flight or danger.',
  'The family are passengers using a phone soundboard. Never ask the driver to look at or operate the phone. If the user says they are driving, keep it hands-free and do not suggest interaction.',
  'Treat spoken descriptions as the current scene and build on them conversationally. Ask a short question when the scene is unclear. If the crew reports an asteroid and needs to escape, set mode warp and then describe the maneuver as a jump to lightspeed after the bridge confirms it. If the crew wants to launch a missile, call ship_sounds and play a Proton torpedo only when an exact matching sound ID is returned; otherwise explain that it is not available and ask what they want to do.',
  'Use ship_act only with one of the allowed modes or an exact sound ID returned by ship_sounds. Never invent, guess, rename, or claim a sound played unless the browser reports success.',
  'If a requested sound is unavailable, say so and offer to list available sounds. Never play a substitute without being asked.',
  'After every action, use the returned result as the truth. Do not claim a mode or sound changed when the bridge reports failure.'
].join(' ');

const TOOLS = [
  { type: 'function', name: 'ship_act', description: 'Change flight mode and/or play one exact listed ship sound.', parameters: {
    type: 'object', properties: {
      mode: { type: 'string', enum: ['combat', 'cruise', 'stealth', 'warp', 'emergency'] },
      sound: { type: 'string', description: 'Exact sound ID returned by ship_sounds.' }
    }, additionalProperties: false
  } },
  { type: 'function', name: 'ship_sounds', description: 'Return exact sound IDs available in the current Starhopper page.', parameters: { type: 'object', properties: {}, additionalProperties: false } }
];

function sameSecret(candidate, expected) {
  const left = Buffer.from(candidate || '');
  const right = Buffer.from(expected || '');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  res.end(body);
}

function originAllowed(origin) {
  return Boolean(origin) && ALLOWED_ORIGINS.has(origin);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (!originAllowed(origin)) return send(res, 403, 'Origin is not allowed.');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS' && req.url === '/session') return send(res, 204, '');
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, 'ok');
  if (req.method !== 'POST' || req.url !== '/session') return send(res, 404, 'Not found.');
  if (!ACCESS_TOKEN || !OPENAI_API_KEY) return send(res, 503, 'Copilot server is not configured.');
  if (!sameSecret((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), ACCESS_TOKEN)) {
    return send(res, 401, 'A valid copilot access token is required.');
  }
  if (!/^application\/sdp(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, 'Expected an application/sdp request.');

  let chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_SDP_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const sdp = Buffer.concat(chunks).toString('utf8');
    if (!sdp.includes('v=0')) return send(res, 400, 'Invalid SDP offer.');
    const session = {
      type: 'realtime',
      model: MODEL,
      instructions: INSTRUCTIONS,
      tools: TOOLS,
      tool_choice: 'auto',
      audio: {
        input: { turn_detection: { type: 'server_vad' } },
        output: { voice: 'marin' }
      }
    };
    const form = new FormData();
    form.set('sdp', sdp);
    form.set('session', JSON.stringify(session));
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(30000)
    });
    const answer = await upstream.text();
    if (!upstream.ok) {
      // Do not return provider response details that could disclose configuration.
      return send(res, upstream.status >= 500 ? 502 : upstream.status, 'Realtime session setup failed.');
    }
    return send(res, 200, answer, 'application/sdp');
  } catch (error) {
    if (!res.headersSent) return send(res, 502, error?.name === 'TimeoutError' ? 'Realtime session setup timed out.' : 'Realtime session setup failed.');
  }
});

if (!ACCESS_TOKEN || !OPENAI_API_KEY) {
  console.error('Set COPILOT_ACCESS_TOKEN and OPENAI_API_KEY before starting the server.');
  process.exitCode = 1;
} else if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('COPILOT_PORT must be a valid TCP port.');
  process.exitCode = 1;
} else {
  server.listen(PORT, HOST, () => console.log(`Starhopper Realtime copilot listening on http://${HOST}:${PORT}`));
}
