import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, samples, describeOutfit } from '../src/outfits.js';

test('empty and incomplete wardrobes explain what is missing', () => {
  assert.equal(recommend([]).items.length, 0);
  assert.equal(recommend([samples[0]]).items.length, 0);
});
test('everyday and dressier occasions prioritize different pieces', () => {
  assert.equal(recommend(samples).items[0].id, 'sample-1');
  assert.equal(recommend(samples, { occasion: 'Work' }).items[0].id, 'sample-2');
  assert.equal(recommend(samples, { occasion: 'Work' }).items[1].id, 'sample-4');
});
test('cool weather includes a layer; warm weather excludes it', () => {
  assert.ok(recommend(samples, { weather: 'Cool' }).items.some(i => i.category === 'Layers'));
  assert.ok(!recommend(samples, { weather: 'Warm' }).items.some(i => i.category === 'Layers'));
});
test('one-pieces work without a top and bottom', () => {
  const dress = { id: 'dress', category: 'One-pieces', style: 'Smart' };
  assert.deepEqual(recommend([dress]).items, [dress]);
});
test('alternatives use only existing pieces and do not mutate input', () => {
  const copy = JSON.stringify(samples);
  assert.notEqual(recommend(samples, { offset: 0 }).items[0].id, recommend(samples, { offset: 1 }).items[0].id);
  assert.equal(JSON.stringify(samples), copy);
});

test('narrative identifies only the selected wardrobe pieces using saved labels and details', () => {
  const selected = recommend(samples, { occasion: 'Work', weather: 'Cool' });
  selected.items = selected.items.map(i => ({ ...i, details: i.id === 'sample-2' ? 'Look for the small chest pocket and white buttons.' : '' }));
  const text = describeOutfit(selected);
  for (const item of selected.items) {
    assert.ok(text.includes(item.name)); assert.ok(text.includes(item.color));
  }
  assert.match(text, /small chest pocket and white buttons/);
  assert.ok(!text.includes('Everyday cotton tee'));
  assert.ok(text.length <= 550);
  assert.match(text, /saved details/);
  assert.equal(describeOutfit(recommend([])), '');
});

test('the short description keeps every selected garment even with maximum-length names and details', () => {
  const outfit = recommend(samples, { weather: 'Cool' });
  outfit.items = outfit.items.map((item, index) => ({ ...item, name: `${index}`.repeat(100), details: 'A distinctive pocket with white stitching. '.repeat(9) }));
  const text = describeOutfit(outfit);
  assert.ok(text.length <= 550, `Description was ${text.length} characters`);
  for (const item of outfit.items) assert.ok(text.includes(item.name));
  assert.match(text, /Make the look your own!$/);
});
