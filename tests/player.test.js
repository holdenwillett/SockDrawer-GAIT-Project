import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrator } from '../public/narrator.js';

// A tiny event target lets us exercise async races without external DOM dependencies.
class Control {
  listeners = new Map(); hidden = false; disabled = false; checked = false; textContent = ''; currentTime = 0; src = ''; plays = 0;
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  async emit(type) { return this.listeners.get(type)?.(); }
  pause() {}
  load() {}
  focus() { this.focused = true; }
  async play() { this.plays++; await this.emit('play'); }
  hasAttribute(name) { return Boolean(this[name]); }
  removeAttribute(name) { this[name] = ''; }
}
function fixture() {
  const controls = new Map();
  const root = { hidden: true, querySelector: selector => { if (!controls.has(selector)) controls.set(selector, new Control()); return controls.get(selector); } };
  const narrator = createNarrator(root);
  return { root, narrator, listen: root.querySelector('[data-listen]'), stop: root.querySelector('[data-stop]'), consent: root.querySelector('[data-narration-consent]'), status: root.querySelector('[data-narration-status]'), audio: root.querySelector('audio') };
}
const clips = ['data:audio/mpeg;base64,first', 'data:audio/mpeg;base64,second'];

test('preview speech controls stay visible while waiting for a description and recover after retry', async () => {
  const f = fixture();
  f.narrator.setDescription('', 'Create a preview to get its description.');
  assert.equal(f.root.hidden, false); assert.equal(f.listen.disabled, true);
  f.narrator.setDescription('', 'Description failed. Choose Retry outfit description above.');
  f.narrator.stop();
  assert.equal(f.root.hidden, false); assert.equal(f.listen.disabled, true);
  assert.match(f.status.textContent, /Retry outfit description/);
  f.narrator.setDescription('Your navy shirt has white buttons.');
  assert.equal(f.root.hidden, false); assert.equal(f.listen.disabled, false);
  assert.equal(f.status.textContent, '');
  f.narrator.clear();
  assert.equal(f.root.hidden, true);
  assert.equal(f.root.querySelector('[data-description]').textContent, '');
});

test('player requires consent, plays every part, and reuses cached narration on replay', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    calls++;
    assert.equal(url, '/api/narrate');
    assert.deepEqual(JSON.parse(request.body), { description: 'Your navy shirt with white buttons.', consent: true });
    return Response.json({ clips });
  });
  const f = fixture(); f.narrator.setDescription('Your navy shirt with white buttons.');
  await f.listen.emit('click'); assert.equal(calls, 0); assert.ok(f.consent.focused);
  f.consent.checked = true;
  await f.listen.emit('click'); assert.equal(calls, 1); assert.equal(f.audio.src, clips[0]);
  await f.audio.emit('ended'); assert.equal(f.audio.src, clips[1]);
  await f.audio.emit('ended'); assert.match(f.status.textContent, /That’s your outfit/);
  await f.listen.emit('click'); assert.equal(calls, 1); assert.equal(f.audio.src, clips[0]);
});

test('the player rejects non-MP3 responses and keeps the written description for retry', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ clips: ['https://example.com/audio.mp3'] }));
  const f = fixture(); f.narrator.setDescription('Your navy shirt.'); f.consent.checked = true;
  await f.listen.emit('click');
  assert.equal(f.audio.plays, 0); assert.equal(f.listen.disabled, false);
  assert.match(f.status.textContent, /unreadable audio/);
  assert.equal(f.root.querySelector('[data-description]').textContent, 'Your navy shirt.');
});

test('a new outfit or navigation suppresses late audio and invalidates the previous cache', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const f = fixture(); f.narrator.setDescription('Old outfit.'); f.consent.checked = true;
  const pending = f.listen.emit('click');
  f.narrator.setDescription('New outfit.');
  finish(Response.json({ clips })); await pending;
  assert.equal(f.audio.plays, 0); assert.equal(f.listen.disabled, false);
  assert.equal(f.root.querySelector('[data-description]').textContent, 'New outfit.');
  const next = f.listen.emit('click'); f.narrator.stop();
  finish(Response.json({ clips })); await next;
  assert.equal(f.audio.plays, 0);
});

test('provider failures preserve the transcript and allow retry, and playback rejection exposes native controls', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'ElevenLabs is unavailable.' }, { status: 503 }));
  const f = fixture(); f.narrator.setDescription('Your navy shirt.'); f.consent.checked = true;
  await f.listen.emit('click');
  assert.match(f.status.textContent, /ElevenLabs is unavailable/); assert.equal(f.listen.disabled, false);
  assert.equal(f.root.querySelector('[data-description]').textContent, 'Your navy shirt.');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ clips }));
  f.audio.play = async () => { throw new Error('Autoplay denied'); };
  await f.listen.emit('click');
  assert.equal(f.audio.hidden, false); assert.match(f.status.textContent, /Press Play/);
});
