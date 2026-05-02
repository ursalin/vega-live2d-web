export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  let formData;
  try { formData = await req.formData(); }
  catch { return new Response(JSON.stringify({ error: 'Bad multipart' }), { status: 400 }); }

  const provider = formData.get('provider') || 'groq';
  const apiKey   = formData.get('apiKey');
  const language = formData.get('language') || 'zh';
  const audio    = formData.get('audio');

  if (!apiKey)        return new Response(JSON.stringify({ error: 'Missing apiKey' }),  { status: 400 });
  if (!audio || !audio.size) return new Response(JSON.stringify({ error: 'Missing audio' }), { status: 400 });

  const endpoints = {
    groq:   { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo' },
    openai: { url: 'https://api.openai.com/v1/audio/transcriptions',       model: 'whisper-1' },
  };
  const ep = endpoints[provider];
  if (!ep) return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), { status: 400 });

  const fd = new FormData();
  fd.append('file', audio, 'audio.webm');
  fd.append('model', ep.model);
  fd.append('language', language);
  fd.append('response_format', 'json');

  try {
    const r = await fetch(ep.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `${r.status}: ${t.slice(0, 300)}` }), { status: r.status });
    }
    const j = await r.json();
    return new Response(JSON.stringify({ text: j.text || '' }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
}
