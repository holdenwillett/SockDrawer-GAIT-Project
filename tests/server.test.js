import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
const server = createServer(); let base;
before(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
test('serves the app, shared outfit module and security headers', async () => {
  for (const path of ['/', '/app.js', '/app.css', '/narrator.js', '/outfits.js']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-security-policy')); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('narration status requires both ElevenLabs settings and exposes provider/model without credentials', async t => {
  const settings = ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
  const original = settings.map(name => process.env[name]);
  t.after(() => settings.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; }));
  for (const [key, voice] of [['', ''], ['secret-test-key', ''], ['', 'testVoice'], ['secret-test-key', 'testVoice']]) {
    process.env.ELEVENLABS_API_KEY = key; process.env.ELEVENLABS_VOICE_ID = voice;
    const response = await fetch(base + '/api/status');
    const status = await response.json();
    assert.equal(status.narration, Boolean(key && voice));
    assert.equal(status.narrationProvider, 'ElevenLabs');
    assert.equal(status.narrationModel, 'eleven_v3');
    assert.ok(!JSON.stringify(status).includes('secret-test-key'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('environment files and source modules are not exposed', async () => {
  for (const path of ['/.env', '/src/provider.js', '/package.json']) assert.equal((await fetch(base + path)).status, 404);
});
test('AI requires explicit consent', async () => {
  const response = await fetch(base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: 'data:image/png;base64,aGVsbG8=' }) });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /Allow photo processing/);
  for (const path of ['/api/describe', '/api/narrate']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 400);
    if (path === '/api/narrate') assert.match((await response.json()).error, /sent to ElevenLabs/);
  }
});

test('the narration API rejects descriptions over 550 characters before calling ElevenLabs', async () => {
  const response = await fetch(base + '/api/narrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, description: 'x'.repeat(551) }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /550 characters/);
});
test('rejects cross-origin processing', async () => {
  const response = await fetch(base + '/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}' });
  assert.equal(response.status, 403);
  for (const path of ['/api/describe', '/api/narrate']) {
    assert.equal((await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{"consent":true}' })).status, 403);
  }
});

test('preview, description retry, and narration routes keep independent results and send narration only text', async () => {
  const seen = [];
  const instance = createServer({
    createPreview: async input => { seen.push(['preview', input.prompt]); return { image: 'data:image/png;base64,aGVsbG8=', description: null, descriptionError: 'Retry description.' }; },
    describePhoto: async photo => { seen.push(['describe', photo]); return 'Your navy shirt has white buttons.'; },
    speak: async text => { seen.push(['speak', text]); return { clips: ['data:audio/mpeg;base64,fixture'], provider: 'ElevenLabs' }; }
  });
  await new Promise(r => instance.listen(0, '127.0.0.1', r));
  const address = `http://127.0.0.1:${instance.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(address + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, consent: true }) });
    assert.equal(response.status, 200); return response.json();
  };
  try {
    const preview = await post('/api/preview', { prompt: 'A navy shirt.' });
    assert.equal(preview.description, null); assert.ok(preview.image);
    const described = await post('/api/describe', { photo: preview.image });
    const narrated = await post('/api/narrate', { description: described.description, photo: 'must never be passed to the narrator' });
    assert.equal(narrated.clips.length, 1);
    assert.deepEqual(seen, [['preview', 'A navy shirt.'], ['describe', preview.image], ['speak', described.description]]);
  } finally { instance.closeAllConnections(); await new Promise(r => instance.close(r)); }
});
test('rejects malformed JSON and unsupported content types', async () => {
  const response = await fetch(base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert.equal((await fetch(base + '/api/analyze', { method: 'POST', body: '{}' })).status, 415);
});
