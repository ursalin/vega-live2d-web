export const config = { runtime: 'edge' };

// Built-in provider presets. Frontend can override base/model.
const OAI_COMPAT = {
  openai:     { base: 'https://api.openai.com/v1',                              model: 'gpt-4o-mini'         },
  deepseek:   { base: 'https://api.deepseek.com/v1',                            model: 'deepseek-chat'       },
  moonshot:   { base: 'https://api.moonshot.cn/v1',                             model: 'moonshot-v1-8k'      },
  qwen:       { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',      model: 'qwen-turbo'          },
  doubao:     { base: 'https://ark.cn-beijing.volces.com/api/v3',               model: 'doubao-1-5-lite-32k' },
  zhipu:      { base: 'https://open.bigmodel.cn/api/paas/v4',                   model: 'glm-4-flash'         },
  minimax:    { base: 'https://api.minimaxi.chat/v1',                           model: 'MiniMax-Text-01'     },
  openrouter: { base: 'https://openrouter.ai/api/v1',                           model: 'openai/gpt-4o-mini'  },
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const { provider, model, apiKey, baseUrl, messages, temperature = 0.8, image } = body;
  if (!apiKey)   return json({ error: 'Missing apiKey' }, 400);
  if (!messages) return json({ error: 'Missing messages' }, 400);

  try {
    let text = '';
    if (provider === 'anthropic')   text = await callAnthropic({ model, apiKey, messages, temperature, image });
    else if (provider === 'gemini') text = await callGemini   ({ model, apiKey, messages, temperature, image });
    else {
      const cfg = OAI_COMPAT[provider] || {};
      const base = (baseUrl || cfg.base || '').replace(/\/$/, '');
      if (!base) return json({ error: 'No baseUrl for custom provider' }, 400);
      text = await callOpenAICompat({ base, model: model || cfg.model, apiKey, messages, temperature, image });
    }
    return json({ text });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

async function callOpenAICompat({ base, model, apiKey, messages, temperature, image }) {
  const finalMsgs = attachImageOpenAI(messages, image);
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: finalMsgs, temperature, stream: false }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.toString().trim() || '';
}

function attachImageOpenAI(messages, image) {
  if (!image || !messages.length) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'user') return messages;
  return [
    ...messages.slice(0, -1),
    {
      role: 'user',
      content: [
        { type: 'text', text: last.content || '' },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ];
}

async function callAnthropic({ model, apiKey, messages, temperature, image }) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const conv = messages.filter(m => m.role !== 'system');
  let finalMsgs = conv;
  if (image && conv.length) {
    const last = conv[conv.length - 1];
    const b64 = image.includes(',') ? image.split(',')[1] : image;
    const media = (image.match(/data:(image\/[a-z]+);/) || [])[1] || 'image/jpeg';
    finalMsgs = [
      ...conv.slice(0, -1),
      {
        role: last.role,
        content: [
          { type: 'text', text: last.content || '' },
          { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
        ],
      },
    ];
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5',
      max_tokens: 1024,
      system,
      temperature,
      messages: finalMsgs,
    }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.map(c => c.text).filter(Boolean).join('').trim() || '';
}

async function callGemini({ model, apiKey, messages, temperature, image }) {
  const m = model || 'gemini-2.0-flash';
  const system = messages.find(x => x.role === 'system')?.content || '';
  const conv = messages.filter(x => x.role !== 'system');
  const contents = conv.map((msg, i) => {
    const parts = [{ text: msg.content || '' }];
    if (image && i === conv.length - 1) {
      const b64 = image.includes(',') ? image.split(',')[1] : image;
      const media = (image.match(/data:(image\/[a-z]+);/) || [])[1] || 'image/jpeg';
      parts.push({ inline_data: { mime_type: media, data: b64 } });
    }
    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
  });
  const body = { contents, generationConfig: { temperature } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('').trim() || '';
}
