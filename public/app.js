import { categories, colors, samples, recommend, describeOutfit } from '/outfits.js';
import { createNarrator } from '/narrator.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let items = [], filter = 'All pieces', editing = null, itemPhoto = '', detected = [], person = '', reference = '', outfit = null, offset = 0, ai = false;
const outfitNarrator = createNarrator($('outfit-narrator'), () => previewNarrator.stop());
const previewNarrator = createNarrator($('preview-narrator'), () => outfitNarrator.stop());
previewNarrator.setDescription('', 'Create a preview to get its written and spoken outfit description.');
let previewImage = '', previewRevision = 0;
let db;
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('sock-drawer', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('wardrobe');
  request.onsuccess = () => { db = request.result; resolve(db); };
  request.onerror = () => reject(request.error);
});
async function save(next) {
  await database;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('wardrobe', 'readwrite');
    tx.objectStore('wardrobe').put(next, 'items');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  items = next; outfit = null; $('outfit-actions').hidden = true;
  outfitNarrator.clear();
  $('outfit-result').innerHTML = '<h2>Wardrobe updated</h2><p>Find an outfit with your latest pieces.</p>';
  render();
}
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 7000); }
function page(name) {
  for (const section of document.querySelectorAll('.page')) section.hidden = section.id !== name;
  for (const button of document.querySelectorAll('nav button')) { if (button.dataset.page === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
  outfitNarrator.stop(); previewNarrator.stop();
  if (name === 'tryon') renderGarments();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => page(button.dataset.page)));

const shapes = {
  Tops: '<path d="M67 34 43 45 21 81 49 97 62 78v111h96V78l13 19 28-16-22-36-24-11c-3 24-22 29-43 29S71 58 67 34Z"/><path d="M67 34c8 15 24 23 43 23s35-8 43-23M64 78l-4-30m96 30 4-30" class="seam"/>',
  Bottoms: '<path d="M63 29h94l9 164h-42l-14-112-14 112H54Z"/><path d="M63 44h94M110 44v37M72 44l-4 29 19-15M148 44l4 29-19-15" class="seam"/>',
  Layers: '<path d="m73 31-29 17-23 108 32 7 13-67-5 96h98l-5-96 13 67 32-7-23-108-29-17-37 25Z"/><path d="m73 31 37 70 37-70M110 101v91M70 152h25m30 0h25" class="seam"/>',
  Shoes: '<path d="m41 115 27-18 36 27 68 13c25 5 28 24 20 37H37c-18-17-14-42 4-59Z"/><path d="M35 159h158M88 120l-10 12m22-7-9 12m22-9-8 13" class="seam"/>',
  'One-pieces': '<path d="M83 28h54l15 41-19 29 50 97H37l50-97-19-29Z"/><path d="M83 28c0 23 54 23 54 0M87 98h46" class="seam"/>',
  Accessories: '<path d="M67 64h86l20 118H47Z"/><path d="M85 64V48c0-34 50-34 50 0v16" fill="none" stroke-width="10"/>'
};
function illustration(item) {
  const color = colors[item.color] || colors.Cream;
  // Every interpolated label is escaped; image sources are created only by our file reader.
  if (item.photo) return `<img src="${escape(item.photo)}" alt="${escape(item.color + ' ' + item.name)}" loading="lazy">`;
  return `<svg viewBox="0 0 220 220" role="img" aria-label="${escape(item.color + ' ' + item.category + ' illustration')}"><g fill="${color}" stroke="#30382e" stroke-opacity=".27" stroke-width="1.5">${shapes[item.category] || shapes.Accessories}</g></svg>`;
}
function card(item) {
  return `<button class="clothing-card" data-edit="${escape(item.id)}" aria-label="Edit ${escape(item.name)}"><div class="clothing-visual">${illustration(item)}</div>${item.id.startsWith('sample-') ? '<span class="sample-tag">SAMPLE</span>' : ''}<h3>${escape(item.name)}</h3><p>${escape(item.color)} · ${escape(item.category)} · ${escape(item.style)}</p></button>`;
}
function render() {
  $('filters').innerHTML = ['All pieces', ...categories].map(c => `<button data-filter="${c}" aria-pressed="${filter === c}">${c}</button>`).join('');
  $('item-count').textContent = items.length;
  const search = $('search').value.toLowerCase();
  const visible = items.filter(i => (filter === 'All pieces' || i.category === filter) && `${i.name} ${i.color} ${i.category}`.toLowerCase().includes(search));
  $('wardrobe-grid').innerHTML = visible.length ? visible.map(card).join('') : `<div class="empty"><div class="eyebrow">${items.length ? 'A LITTLE ROOM TO EXPLORE' : 'YOUR STYLE STARTS HERE'}</div><h2>${items.length ? 'No pieces found.' : 'Your wardrobe starts here'}</h2><p>${items.length ? 'Try another category or search.' : 'Add a piece or try the sample wardrobe.'}</p></div>`;
  $('sample-note').hidden = !items.some(i => i.id.startsWith('sample-'));
}
$('filters').addEventListener('click', event => { const b = event.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; render(); $('filters').querySelector(`[data-filter="${filter}"]`).focus(); } });
$('search').addEventListener('input', render);
$('wardrobe-grid').addEventListener('click', event => { const b = event.target.closest('[data-edit]'); if (b) openItem(items.find(i => i.id === b.dataset.edit)); else if (event.target.closest('[data-add]')) openItem(); });
$('load-samples').addEventListener('click', async () => { try { await save([...items, ...samples.filter(s => !items.some(i => i.id === s.id))]); toast('Sample wardrobe added.'); } catch { toast('Browser storage is unavailable or full. Your wardrobe was not changed.'); } });
$('clear-samples').addEventListener('click', async () => { try { await save(items.filter(i => !i.id.startsWith('sample-'))); } catch { toast('Unable to update browser storage.'); } });
for (const [id, values] of [['item-category', categories], ['item-color', Object.keys(colors)]]) $(id).innerHTML = values.map(v => `<option>${v}</option>`).join('');
function openItem(item) {
  editing = item?.id || null; itemPhoto = item?.photo || ''; detected = [];
  $('item-form').reset(); $('analysis-review').hidden = true;
  $('item-title').textContent = item ? 'Edit piece' : 'Add a piece';
  $('delete-item').hidden = !item;
  for (const key of ['name', 'category', 'color', 'style', 'warmth', 'details']) if (item) $(`item-${key}`).value = item[key] || '';
  thumb('item-thumb', itemPhoto); $('item-dialog').showModal();
}
function thumb(id, photo) { $(id).hidden = !photo; if (photo) $(id).src = photo; else $(id).removeAttribute('src'); }
$('add-item').addEventListener('click', () => openItem());
$('close-dialog').addEventListener('click', () => $('item-dialog').close());
$('item-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (pendingPhotos) return toast('Please wait for the photo to finish loading.');
  const item = { id: editing || crypto.randomUUID(), photo: itemPhoto };
  for (const key of ['name', 'category', 'color', 'style', 'warmth', 'details']) item[key] = $(`item-${key}`).value.trim();
  if (!item.name) return toast('Give this piece a name.');
  $('save-item').disabled = true;
  try { await save(editing ? items.map(i => i.id === editing ? item : i) : [...items, item]); $('item-dialog').close(); toast('Saved to your wardrobe.'); } catch { toast('Storage is unavailable or full. The piece was not saved.'); }
  finally { $('save-item').disabled = false; }
});
$('delete-item').addEventListener('click', async () => { try { await save(items.filter(i => i.id !== editing)); $('item-dialog').close(); toast('Piece removed.'); } catch { toast('Unable to update browser storage.'); } });

async function photo(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) throw new Error('Choose a JPEG, PNG, or WebP smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL('image/jpeg', .84);
}
let pendingPhotos = 0;
for (const [id, setter] of [['item-photo', value => { itemPhoto = value; thumb('item-thumb', value); detected = []; $('analysis-review').hidden = true; }], ['person-photo', value => { person = value; thumb('person-thumb', value); }], ['reference-photo', value => reference = value]]) {
  $(id).addEventListener('change', async event => { pendingPhotos++; try { setter(''); setter(await photo(event.target.files[0])); } catch (error) { event.target.value = ''; toast(error.message); } finally { pendingPhotos--; } });
}
async function api(path, data) {
  if (pendingPhotos) throw new Error('Please wait for the photo to finish loading.');
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to complete the request.'); return result;
}
async function busy(button, label, task) {
  const old = button.textContent; button.disabled = true; button.textContent = label;
  try { await task(); } catch (error) { toast(error.message || 'Unable to complete the request.'); } finally { button.disabled = false; button.textContent = old; }
}
$('analyze-photo').addEventListener('click', () => busy($('analyze-photo'), 'Looking at your clothes…', async () => {
  if (!itemPhoto) throw new Error('Choose a photo first.');
  if (!$('analyze-consent').checked) throw new Error('Check the photo permission box to use AI identification.');
  const result = await api('/api/analyze', { photo: itemPhoto, consent: true }); detected = result.items;
  if (!detected.length) throw new Error('No clothing was identified. Try another photo or add the details yourself.');
  $('detected-items').innerHTML = detected.map((i, index) => `<option value="${index}">${escape(i.name)}</option>`).join('');
  $('analysis-review').hidden = false; fillDetected(); toast('Suggested labels are ready. Review them before saving.');
}));
function fillDetected() {
  const item = detected[Number($('detected-items').value)];
  if (!item) return;
  $('item-name').value = item.name;
  $('item-details').value = item.details || '';
  for (const key of ['category', 'color', 'style', 'warmth']) {
    const select = $(`item-${key}`); select.value = item[key]; if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
}
$('detected-items').addEventListener('change', fillDetected);
$('outfit-form').addEventListener('submit', event => {
  event.preventDefault(); const preferences = Object.fromEntries(new FormData(event.target));
  outfit = recommend(items, { ...preferences, offset: offset++ });
  $('outfit-result').innerHTML = `<h2>${outfit.items.length ? 'Your outfit' : 'Add a few more pieces'}</h2><div class="outfit-pieces">${outfit.items.map(card).join('')}</div><p>${escape(outfit.reason)}</p>`;
  $('outfit-actions').hidden = !outfit.items.length;
  outfitNarrator.setDescription(describeOutfit(outfit));
});
$('outfit-result').addEventListener('click', event => { const b = event.target.closest('[data-edit]'); if (b) openItem(items.find(i => i.id === b.dataset.edit)); });
function renderGarments() {
  const previous = $('garment-select').value;
  $('garment-select').innerHTML = '<option value="">Choose a piece…</option>' + items.map(i => `<option value="${escape(i.id)}">${escape(i.name)}${i.photo ? '' : ' (no photo)'}</option>`).join('');
  if (items.some(i => i.id === previous)) $('garment-select').value = previous;
}
$('try-mode').addEventListener('change', () => {
  const mode = $('try-mode').value;
  $('garment-field').hidden = mode !== 'wardrobe'; $('reference-field').hidden = mode !== 'reference'; $('reference-photo').required = mode === 'reference';
});
$('garment-select').addEventListener('change', () => {
  const item = items.find(i => i.id === $('garment-select').value);
  if (item) $('try-prompt').value = `Dress me in ${item.color.toLowerCase()} ${item.name}. Keep the rest of my outfit coordinated.`;
});
$('try-outfit').addEventListener('click', () => {
  if (!outfit) return; page('tryon'); $('try-mode').value = 'prompt'; $('try-mode').dispatchEvent(new Event('change'));
  $('try-prompt').value = `Dress me in ${outfit.items.map(i => `${i.color.toLowerCase()} ${i.name}`).join(', ')}.`;
});
$('tryon-form').addEventListener('submit', event => {
  event.preventDefault();
  busy($('generate-preview'), 'Creating your preview…', async () => {
    if (!ai) throw new Error('AI is not connected. Add OPENAI_API_KEY to .env and restart the server.');
    if (!person) throw new Error('Choose a photo of yourself first.');
    const mode = $('try-mode').value;
    const garment = items.find(i => i.id === $('garment-select').value);
    if (mode === 'wardrobe' && !garment) throw new Error('Choose a wardrobe piece first.');
    if (mode === 'reference' && !reference) throw new Error('Choose an outfit reference photo.');
    previewRevision++;
    previewNarrator.setDescription('', 'Your outfit description is being prepared. Audio will be available once it is ready.'); previewImage = '';
    $('generated-image').hidden = true; $('generated-image').removeAttribute('src');
    $('download-preview').hidden = true; $('download-preview').removeAttribute('href'); $('preview-disclaimer').hidden = true;
    $('retry-description').hidden = true; $('description-status').textContent = 'Creating your preview, then describing the visible outfit…';
    let result;
    try {
      result = await api('/api/preview', { person, reference: mode === 'reference' ? reference : mode === 'wardrobe' ? garment.photo || undefined : undefined, prompt: $('try-prompt').value, consent: $('try-consent').checked });
    } catch (error) {
      $('description-status').textContent = 'The preview could not be created. Check your inputs and try again.';
      previewNarrator.setDescription('', 'Create a preview to get its written and spoken outfit description.');
      throw error;
    }
    previewImage = result.image;
    $('generated-image').src = result.image; $('generated-image').hidden = false; $('preview-placeholder').hidden = true;
    $('download-preview').href = result.image; $('download-preview').hidden = false; $('preview-disclaimer').hidden = false;
    previewNarrator.setDescription(result.description, 'A description is needed before this outfit can be read aloud. Choose Retry outfit description above.');
    $('description-status').textContent = result.description ? 'Your outfit description is ready below.' : result.descriptionError || 'The outfit description is unavailable. You can retry it without creating another preview.';
    $('retry-description').hidden = Boolean(result.description);
    toast('Your AI-generated preview is ready. Check appearance against your original.');
  });
});
$('retry-description').addEventListener('click', () => busy($('retry-description'), 'Describing your outfit…', async () => {
  if (!previewImage) return;
  // The original preview's photo consent also covers describing it, as disclosed in the form.
  const revision = previewRevision, image = previewImage;
  $('description-status').textContent = 'Looking at the clothing in your finished preview…';
  previewNarrator.setDescription('', 'Your outfit description is being prepared. Audio will be available once it is ready.');
  try {
    const result = await api('/api/describe', { photo: image, consent: true });
    if (revision !== previewRevision) return;
    previewNarrator.setDescription(result.description); $('retry-description').hidden = true;
    $('description-status').textContent = 'Your outfit description is ready below.';
  } catch (error) {
    if (revision === previewRevision) {
      $('description-status').textContent = error.message;
      previewNarrator.setDescription('', 'The description is still unavailable. Choose Retry outfit description above to try again.');
    }
  }
}));
window.addEventListener('pagehide', () => { outfitNarrator.stop(); previewNarrator.stop(); });
$('privacy').addEventListener('click', () => $('privacy-dialog').showModal());
$('close-privacy').addEventListener('click', () => $('privacy-dialog').close());
try {
  await database;
  items = await new Promise((resolve, reject) => { const request = db.transaction('wardrobe').objectStore('wardrobe').get('items'); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
} catch { toast('Browser storage is unavailable. Enable site storage to save a wardrobe.'); }
render();
try {
  const status = await fetch('/api/status').then(r => r.json()); ai = status.ai;
  outfitNarrator.setAvailable(status.narration); previewNarrator.setAvailable(status.narration);
} catch { outfitNarrator.setAvailable(false); previewNarrator.setAvailable(false); }
$('ai-status').textContent = ai ? 'OpenAI is connected. Photo processing may incur API charges.' : 'AI is not connected yet. Wardrobe and local outfit matching are ready to use.';
