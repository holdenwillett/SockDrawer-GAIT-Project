import test from 'node:test';
import assert from 'node:assert/strict';
import { narrate } from '../src/narration.js';

const voice = 'testVoiceId1234567890';
function mp3() { return Buffer.concat([Buffer.from('ID3'), Buffer.alloc(7), Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(40)]); }
function audio(bytes = mp3(), type = 'audio/mpeg') { return new Response(bytes, { headers: { 'Content-Type': type } }); }

test('invalid or overlong descriptions fail before any provider request', async () => {
  for (const text of [null, '', '  ', 42, 'x'.repeat(551)]) {
    await assert.rejects(narrate(text, { key: 'test', voice, fetcher: () => { throw new Error('must not call'); } }), { status: 400 });
  }
});

test('missing key, missing voice, and invalid voice IDs fail without transmitting text', async () => {
  for (const config of [{ key: '', voice }, { key: 'test', voice: '' }, { key: 'test', voice: 'https://example.com/voice' }, { key: 'test', voice: '../private' }]) {
    await assert.rejects(narrate('Your outfit.', { ...config, fetcher: () => { throw new Error('must not call'); } }), { status: 503 });
  }
});

test('ElevenLabs receives one text-only Eleven v3 request with natural delivery and returns an MP3', async () => {
  const text = 'Your navy shirt has white buttons. '.repeat(14).trim();
  let calls = 0;
  const bytes = mp3();
  const result = await narrate(text, { key: 'test-key', voice, fetcher: async (url, request) => {
    calls++;
    assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers['xi-api-key'], 'test-key');
    assert.equal(request.headers.Accept, 'audio/mpeg');
    assert.equal(request.headers['Content-Type'], 'application/json');
    const body = JSON.parse(request.body);
    assert.equal(body.model_id, 'eleven_v3');
    assert.equal(body.language_code, 'en');
    assert.equal(body.voice_settings.stability, 0.5);
    assert.match(body.text, /^\[Warm, friendly, light-hearted, supportive, conversational tone, unhurried pace\] /);
    assert.ok(body.text.endsWith(text));
    // These controls are unsupported by Eleven v3 or belong to the previous provider.
    for (const field of ['speed', 'similarity_boost', 'use_speaker_boost']) assert.equal(body.voice_settings[field], undefined);
    assert.equal(body.instructions, undefined);
    assert.equal(body.input, undefined);
    assert.ok(!JSON.stringify(body).includes('image_url'));
    return audio(bytes);
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { clips: [`data:audio/mpeg;base64,${bytes.toString('base64')}`], provider: 'ElevenLabs', model: 'eleven_v3' });
});

test('the 550-character description limit is accepted and MP3 frame output works without an ID3 header', async () => {
  const bytes = mp3().subarray(10);
  const result = await narrate('x'.repeat(550), { key: 'test', voice, fetcher: async () => audio(bytes) });
  assert.equal(result.clips[0], `data:audio/mpeg;base64,${bytes.toString('base64')}`);
});

test('ElevenLabs account, voice, validation, and rate-limit failures stay actionable without echoing secrets', async () => {
  for (const status of [401, 403, 404, 422, 429, 500]) {
    let calls = 0;
    await assert.rejects(narrate('Your outfit.', { key: 'secret', voice, fetcher: async () => { calls++; return new Response('secret provider response', { status }); } }), error => error.status === 502 && error.message.includes(`HTTP ${status}`) && !error.message.includes('secret'));
    assert.equal(calls, 1); // Do not automatically retry a potentially billable request.
  }
});

test('payment-required errors explain that narration needs an account change, not another image', async () => {
  await assert.rejects(narrate('Your outfit.', { key: 'test', voice, fetcher: async () => new Response('private billing information', { status: 402 }) }), error => error.status === 502 && /HTTP 402/.test(error.message) && /billing or plan/.test(error.message) && /do not need to create another image/.test(error.message) && !error.message.includes('private'));
});

test('timeouts, network failures, and incomplete audio preserve the text-only fallback', async () => {
  for (const fetcher of [
    async () => { throw new Error('secret network info'); },
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('secret stream failure')); } }))
  ]) {
    await assert.rejects(narrate('Your outfit.', { key: 'test', voice, fetcher }), error => error.status === 504 && !error.message.includes('secret') && error.message.includes('written description'));
  }
});

test('empty, malformed, wrongly typed, or oversized audio never becomes a playable result', async () => {
  for (const response of [new Response(null, { status: 204 }), audio(Buffer.alloc(0)), audio(Buffer.from('not really an mp3')), audio(mp3(), 'application/json'), Response.json({ detail: 'secret provider response' }), audio(Buffer.alloc(8_000_001))]) {
    await assert.rejects(narrate('Your outfit.', { key: 'test', voice, fetcher: async () => response }), error => error.status === 502 && !error.message.includes('secret'));
  }
});
