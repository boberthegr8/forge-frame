// POST /api/ai
// Body: { prompt: string, images?: [{ data: string (base64, no prefix), mimeType: string }], tier: "vision" | "text" }
// Returns: parsed JSON object produced by the model.
//
// Provider is switchable via env vars:
//   AI_PROVIDER = "anthropic" | "gemini"
//   ANTHROPIC_API_KEY, GEMINI_API_KEY
//   AI_MODEL_VISION, AI_MODEL_TEXT
//
// Keys never reach the browser — this function is the only thing that reads them.

function extractJson(text) {
  if (!text) throw new Error('Empty model response');
  let cleaned = text.trim();
  // Strip markdown code fences if the model wrapped its JSON in ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  // If there's leading/trailing prose, grab the outermost {...} or [...]
  const firstBrace = cleaned.search(/[\{\[]/);
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Last resort: try trimming trailing text after the last closing brace/bracket
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (lastBrace !== -1) {
      try { return JSON.parse(cleaned.slice(0, lastBrace + 1)); } catch (_) { /* fall through */ }
    }
    throw new Error('Model did not return valid JSON: ' + err.message);
  }
}

async function callAnthropic({ prompt, images, tier }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const model = tier === 'vision'
    ? (process.env.AI_MODEL_VISION || 'claude-opus-4-1-20250805')
    : (process.env.AI_MODEL_TEXT || 'claude-sonnet-4-5-20250929');

  const content = [];
  for (const img of images || []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.data }
    });
  }
  content.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(block => block.text || '').join('\n');
  return extractJson(text);
}

async function callGemini({ prompt, images, tier }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = tier === 'vision'
    ? (process.env.AI_MODEL_VISION || 'gemini-2.5-pro')
    : (process.env.AI_MODEL_TEXT || 'gemini-2.5-flash');

  const parts = [{ text: prompt }];
  for (const img of images || []) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  return extractJson(text);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const hasKey = provider === 'gemini' ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
  if (!hasKey) {
    res.status(503).json({ error: 'AI is not configured on this deployment' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const { prompt, images, tier } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing "prompt" string in request body' });
    return;
  }

  try {
    const result = provider === 'gemini'
      ? await callGemini({ prompt, images, tier })
      : await callAnthropic({ prompt, images, tier });
    res.status(200).json(result);
  } catch (err) {
    console.error('AI call failed:', err);
    res.status(502).json({ error: err.message || 'AI call failed' });
  }
};
