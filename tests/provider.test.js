import test from 'node:test';
import assert from 'node:assert/strict';
import { imageData, callOpenAI, analyze, preview, describe, previewWithDescription } from '../src/provider.js';
const photo = 'data:image/png;base64,aGVsbG8=';
test('photos must be bounded inline raster data, never remote URLs or SVG', () => {
  assert.equal(imageData(photo), photo);
  for (const invalid of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,aGVsbG8=', '', null]) assert.throws(() => imageData(invalid), { status: 400 });
});
test('missing key fails before transmitting anything', async () => {
  let called = false;
  await assert.rejects(callOpenAI('responses', {}, { key: '', fetcher: () => called = true }), { status: 503 });
  assert.equal(called, false);
});
test('provider failure is actionable without echoing secrets or provider body', async () => {
  await assert.rejects(callOpenAI('responses', {}, { key: 'test', fetcher: async () => ({ ok: false, status: 429 }) }), { status: 502 });
});
test('vision parses a response and disables response storage', async () => {
  const items = await analyze(photo, { key: 'test', fetcher: async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(request.body).store, false);
    assert.match(JSON.parse(request.body).input[0].content[0].text, /json/i);
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{"items":[{"name":"Cream tee","category":"Tops"}]}' }] }] }) };
  } });
  assert.equal(items[0].name, 'Cream tee');
});
test('malformed vision response does not become a successful result', async () => {
  await assert.rejects(analyze(photo, { key: 'test', fetcher: async () => ({ ok: true, json: async () => ({ output: [] }) }) }), { status: 502 });
});
test('preview sends person first and reference second with preservation instructions', async () => {
  const result = await preview({ person: photo, reference: photo, prompt: 'A green shirt' }, { key: 'test', fetcher: async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    const body = JSON.parse(request.body);
    assert.equal(body.images.length, 2); assert.match(body.prompt, /Preserve their face/);
    return { ok: true, json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }) };
  } });
  assert.equal(result, photo);
});

test('preview description analyzes the actual image, requests identifying details, and does not store the response', async () => {
  const description = await describe(photo, { key: 'test', fetcher: async (url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.store, false);
    assert.match(body.instructions, /450–500 characters/);
    assert.match(body.instructions, /maximum of 550 characters/);
    assert.match(body.input[0].content[0].text, /json/i);
    assert.equal(body.input[0].content[1].image_url, photo);
    assert.match(body.instructions, /actually visible/);
    assert.match(body.instructions, /neckline, sleeves, length/);
    assert.match(body.instructions, /friendly, light-hearted, supportive/);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ description: 'Your generated preview shows a navy shirt with a white stripe across the chest.' }) }] }] });
  } });
  assert.match(description, /navy shirt/);
});

test('both vision workflows satisfy the provider JSON-mode input requirement', async () => {
  for (const operation of [analyze, describe]) {
    await operation(photo, { key: 'test', fetcher: async (url, request) => {
      const body = JSON.parse(request.body);
      const texts = body.input.flatMap(message => message.content.filter(c => c.type === 'input_text').map(c => c.text));
      // Mirrors the real HTTP 400: top-level instructions do not satisfy this check.
      if (body.text.format.type === 'json_object' && !texts.some(text => /json/i.test(text))) return Response.json({ error: { message: "Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'." } }, { status: 400 });
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ items: [], description: 'Your generated preview shows a navy shirt.' }) }] }] });
    } });
  }
});

test('bad-request errors explain format failures without blaming credits or echoing provider data', async () => {
  for (const message of ["Response input messages must contain the word 'json'. secret", 'Invalid image. secret']) {
    await assert.rejects(callOpenAI('responses', {}, { key: 'test', fetcher: async () => Response.json({ error: { message } }, { status: 400 }) }), error => error.status === 502 && !error.message.includes('secret') && !error.message.includes('credits'));
  }
});

test('unusable descriptions fail explicitly rather than becoming spoken text', async () => {
  for (const content of ['not JSON', '{}', '{"description":""}', JSON.stringify({ description: 'x'.repeat(551) })]) {
    await assert.rejects(describe(photo, { key: 'test', fetcher: async () => Response.json({ output: [{ content: [{ type: 'output_text', text: content }] }] }) }), { status: 502 });
  }
});

test('preview pipeline describes the returned image and preserves it if the description fails', async () => {
  for (const fail of [false, true]) {
    const calls = [];
    const result = await previewWithDescription({ person: photo, prompt: 'A red shirt' }, { key: 'test', fetcher: async (url, request) => {
      calls.push(url);
      if (url.endsWith('/images/edits')) return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
      assert.equal(JSON.parse(request.body).input[0].content[1].image_url, photo);
      return fail ? new Response('', { status: 429 }) : Response.json({ output: [{ content: [{ type: 'output_text', text: '{"description":"The preview shows a red shirt."}' }] }] });
    } });
    assert.equal(calls.length, 2);
    assert.equal(result.image, photo);
    if (fail) { assert.equal(result.description, null); assert.match(result.descriptionError, /Retry/); }
    else assert.match(result.description, /red shirt/);
  }
});
