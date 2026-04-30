export const config = { runtime: 'edge' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const { provider, voice, apiKey, text, baseUrl, model, extra = {} } = body;
  if (!apiKey) return json({ error: 'Missing apiKey' }, 400);
  if (!text)   return json({ error: 'Missing text' }, 400);

  try {
    if (provider === 'openai') {
      const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const r = await fetch(`${base}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'tts-1',
          voice: voice || 'alloy',
          input: text,
          format: 'mp3',
        }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return new Response(r.body, { headers: { 'content-type': 'audio/mpeg' } });
    }

    if (provider === 'elevenlabs') {
      const v = voice || '21m00Tcm4TlvDq8ikWAM';
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${v}/stream?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'xi-api-key': apiKey,
            accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: model || 'eleven_flash_v2_5',
            voice_settings: { stability: 0.4, similarity_boost: 0.7 },
          }),
        }
      );
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return new Response(r.body, { headers: { 'content-type': 'audio/mpeg' } });
    }

    if (provider === 'minimax') {
      const groupId = extra.groupId;
      if (!groupId) throw new Error('MiniMax requires extra.groupId');
      const r = await fetch(`https://api.minimaxi.chat/v1/t2a_v2?GroupId=${groupId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'speech-02-hd',
          text,
          stream: false,
          voice_setting: {
            voice_id: voice || 'female-shaonv',
            speed: Number(extra.speed) || 1.0,
            vol:   Number(extra.vol)   || 1.0,
            pitch: Number(extra.pitch) || 0,
          },
          audio_setting: { audio_sample_rate: 32000, format: 'mp3', channel: 1 },
        }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      const j = await r.json();
      const hex = j?.data?.audio;
      if (!hex) throw new Error(`MiniMax returned no audio: ${JSON.stringify(j).slice(0, 300)}`);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } });
    }

    return json({ error: `Unsupported provider: ${provider}` }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
