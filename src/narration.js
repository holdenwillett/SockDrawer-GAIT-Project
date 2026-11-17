import { AppError } from './provider.js';

export const narrationModel = 'eleven_v3';
// Eleven v3 uses in-text audio tags, not a separate instructions field.
// The cue is provider-only; the displayed transcript stays unchanged.
const deliveryCue = '[Warm, friendly, light-hearted, supportive, conversational tone, unhurried pace]';

async function boundedAudio(response) {
  if (!response.body) throw new AppError(502, 'ElevenLabs returned no audio. Please try again.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8_000_000) throw new AppError(502, 'The narrator returned too much audio. Please try again.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const mp3 = bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(type) || bytes.length < 10 || !mp3) throw new AppError(502, 'ElevenLabs returned unreadable audio. Please try again.');
  return bytes;
}

export async function narrate(text, {
  key = process.env.ELEVENLABS_API_KEY,
  voice = process.env.ELEVENLABS_VOICE_ID,
  fetcher = fetch
} = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 550) throw new AppError(400, 'Choose an outfit description between 1 and 550 characters.');
  if (!key) throw new AppError(503, 'The ElevenLabs narrator is not connected yet. Add ELEVENLABS_API_KEY to .env and restart the server. Your written outfit description is still available.');
  if (!voice) throw new AppError(503, 'Choose an ElevenLabs voice by adding ELEVENLABS_VOICE_ID to .env, then restart the server. Your written outfit description is still available.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(voice)) throw new AppError(503, 'ELEVENLABS_VOICE_ID must be a voice ID from your ElevenLabs account, not a voice name or URL.');
  try {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: `${deliveryCue} ${text.trim()}`,
        model_id: narrationModel,
        language_code: 'en',
        voice_settings: { stability: 0.5 }
      }),
      redirect: 'error', signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) {
      if (response.status === 402) throw new AppError(502, 'ElevenLabs requires a billing or plan change for the selected voice/model (HTTP 402). Check the account subscription, credits, and voice access. Your outfit description is still available; you do not need to create another image.');
      throw new AppError(502, `ElevenLabs could not create narration (HTTP ${response.status}). Check the API key's text-to-speech permission, voice access, and credits.`);
    }
    const bytes = await boundedAudio(response);
    return { clips: [`data:audio/mpeg;base64,${bytes.toString('base64')}`], provider: 'ElevenLabs', model: narrationModel };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(504, 'The ElevenLabs narrator did not respond. Please try again; your written description is still available.');
  }
}
