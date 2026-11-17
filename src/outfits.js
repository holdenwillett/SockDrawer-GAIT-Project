export const categories = ['Tops', 'Bottoms', 'Layers', 'Shoes', 'One-pieces', 'Accessories'];
export const colors = { Cream: '#e2d8bd', Black: '#30302e', Navy: '#35475b', Blue: '#7894ad', Green: '#77816a', Brown: '#99745a', White: '#f8f6ee', Pink: '#c49496', Red: '#a34e42', Gray: '#989995' };
export const samples = [
  { id: 'sample-1', name: 'Everyday cotton tee', category: 'Tops', color: 'Cream', style: 'Casual', warmth: 'Light' },
  { id: 'sample-2', name: 'Oxford button-down', category: 'Tops', color: 'Blue', style: 'Smart', warmth: 'Light' },
  { id: 'sample-3', name: 'Straight-leg denim', category: 'Bottoms', color: 'Navy', style: 'Casual', warmth: 'Medium' },
  { id: 'sample-4', name: 'Tailored trousers', category: 'Bottoms', color: 'Brown', style: 'Smart', warmth: 'Medium' },
  { id: 'sample-5', name: 'Weekend cardigan', category: 'Layers', color: 'Green', style: 'Casual', warmth: 'Warm' },
  { id: 'sample-6', name: 'Leather loafers', category: 'Shoes', color: 'Black', style: 'Smart', warmth: 'Medium' }
];

// Use only saved facts. Visual details can be reviewed after identification or entered manually.
export function describeOutfit(outfit) {
  if (!outfit?.items?.length) return '';
  const transitions = ['Start with', 'Pair it with', 'Add', 'Finish with'];
  const ending = ' These are your saved details. Make the look your own!';
  const pieces = outfit.items.map((item, index) => `${transitions[index]} ${item.color} “${item.name}”.`);
  // Reserve room for every piece before adding identifying details. Never drop the final garment.
  let remaining = Math.max(0, 500 - pieces.join(' ').length - ending.length);
  const short = (text, limit) => {
    if (text.length <= limit) return text;
    const cut = text.lastIndexOf(' ', limit - 1);
    return cut > 0 ? text.slice(0, cut).replace(/[,;:]+$/, '') + '.' : '';
  };
  const descriptions = pieces.map((piece, index) => {
    const item = outfit.items[index];
    const detail = item.details || `${item.category}, ${item.style.toLowerCase()} style, rated ${item.warmth.toLowerCase()} for warmth.`;
    const budget = Math.floor(remaining / (pieces.length - index));
    const extra = short(detail.trim(), Math.max(0, budget - 1));
    if (extra) { remaining -= extra.length + 1; return `${piece} ${extra}`; }
    return piece;
  });
  const context = short(outfit.reason || '', Math.max(0, remaining - 1));
  return descriptions.join(' ') + (context ? ` ${context}` : '') + ending;
}

// Deliberately transparent local matching, available without an AI account.
export function recommend(items, { occasion = 'Everyday', weather = 'Mild', offset = 0 } = {}) {
  const smart = ['Work', 'Dinner', 'Formal'].includes(occasion);
  const choose = category => {
    const options = items.filter(i => i.category === category)
      .map((item, index) => ({ item, score: (item.style === (smart ? 'Smart' : 'Casual') ? 4 : 0) + (weather === 'Warm' && item.warmth === 'Light' ? 2 : 0), index }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return options.length ? options[((offset % options.length) + options.length) % options.length].item : null;
  };
  const top = choose('Tops'), bottom = choose('Bottoms'), one = choose('One-pieces');
  const selected = top && bottom ? [top, bottom] : one ? [one] : [top, bottom].filter(Boolean);
  if (!selected.length || (!one && (!top || !bottom))) return { items: [], reason: 'Add a top and a bottom, or a one-piece, to build an outfit.' };
  if (weather === 'Cool') { const layer = choose('Layers'); if (layer) selected.push(layer); }
  const shoes = choose('Shoes'); if (shoes) selected.push(shoes);
  const reason = `${smart ? 'Polished pieces for a dressier occasion.' : 'Relaxed pieces for an easy everyday outfit.'} ${weather === 'Cool' ? (selected.some(i => i.category === 'Layers') ? 'An extra layer adds warmth.' : 'Consider adding a warm layer to your wardrobe.') : weather === 'Warm' ? 'Lighter pieces are prioritized where available.' : 'A simple combination for mild weather.'} Check the colors and fit before heading out.`;
  return { items: selected, reason };
}
