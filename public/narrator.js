// One player per result. Audio is generated only on request and cached for that result in memory.
export function createNarrator(root, onStart = () => {}) {
  const listen = root.querySelector('[data-listen]');
  const stopButton = root.querySelector('[data-stop]');
  const audio = root.querySelector('audio');
  const status = root.querySelector('[data-narration-status]');
  const consent = root.querySelector('[data-narration-consent]');
  let description = '', waitingMessage = '', clips = [], index = 0, version = 0, controller = null;

  function stop() {
    version++; controller?.abort(); controller = null;
    audio.pause(); if (audio.hasAttribute('src')) audio.currentTime = 0;
    stopButton.disabled = true; listen.disabled = !description;
    listen.textContent = clips.length ? 'Hear this outfit again' : 'Hear this outfit';
    status.textContent = description ? 'Narration stopped. You can listen from the beginning.' : waitingMessage;
  }
  function clear() {
    stop(); description = ''; waitingMessage = ''; clips = []; index = 0;
    audio.removeAttribute('src'); audio.load(); audio.hidden = true;
    listen.disabled = true; listen.textContent = 'Hear this outfit'; status.textContent = '';
    root.querySelector('[data-description]').textContent = '';
    root.hidden = true;
  }
  function partStatus() { status.textContent = clips.length > 1 ? `ElevenLabs narration · Part ${index + 1} of ${clips.length}. Use the player to pause or resume.` : 'ElevenLabs narration. Use the player to pause or resume.'; }
  async function playPart(ticket) {
    if (ticket !== version) return;
    audio.src = clips[index]; audio.hidden = false; stopButton.disabled = false; partStatus();
    try { await audio.play(); }
    catch { if (ticket === version) status.textContent = 'Audio is ready. Press Play in the audio player to listen.'; }
  }
  listen.addEventListener('click', async () => {
    if (!description) return;
    if (!clips.length && !consent.checked) { status.textContent = 'Check the narration permission box first. Only the written description is sent, not your photos.'; consent.focus(); return; }
    onStart(); stop(); const ticket = version;
    listen.disabled = true; stopButton.disabled = false;
    try {
      if (!clips.length) {
        controller = new AbortController();
        listen.textContent = 'Preparing your narrator…'; status.textContent = 'Creating a friendly ElevenLabs narration. This may take a moment.';
        const response = await fetch('/api/narrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, consent: consent.checked }), signal: controller.signal });
        const result = await response.json();
        if (ticket !== version) return;
        if (!response.ok) throw new Error(result.error || 'Narration is unavailable. Your written description is still here.');
        if (!Array.isArray(result.clips) || !result.clips.length || result.clips.some(clip => typeof clip !== 'string' || !clip.startsWith('data:audio/mpeg;base64,'))) throw new Error('The narrator returned unreadable audio. Please try again.');
        clips = result.clips;
      }
      index = 0; await playPart(ticket);
    } catch (error) {
      if (ticket === version && error.name !== 'AbortError') { status.textContent = error.message || 'Narration is unavailable. Please try again.'; stopButton.disabled = true; }
    } finally {
      if (ticket === version) { controller = null; listen.disabled = false; listen.textContent = clips.length ? 'Hear this outfit again' : 'Retry narration'; }
    }
  });
  audio.addEventListener('ended', () => {
    if (index + 1 < clips.length) { index++; void playPart(version); }
    else { stopButton.disabled = true; status.textContent = 'That’s your outfit! Listen again whenever you like.'; }
  });
  audio.addEventListener('play', () => { onStart(); stopButton.disabled = false; partStatus(); });
  audio.addEventListener('error', () => { status.textContent = 'Audio playback is unavailable. Try narration again, or read the description below.'; clips = []; listen.textContent = 'Retry narration'; stopButton.disabled = true; });
  stopButton.addEventListener('click', stop);
  return {
    stop, clear,
    setDescription(text, emptyMessage = '') {
      clear(); description = text || '';
      waitingMessage = description ? '' : emptyMessage;
      root.querySelector('[data-description]').textContent = description;
      root.hidden = !(description || waitingMessage); listen.disabled = !description;
      status.textContent = waitingMessage;
    },
    setAvailable(available) {
      root.querySelector('[data-narrator-connection]').textContent = available ? 'Friendly voice by ElevenLabs Eleven v3. Creating audio may incur provider charges.' : 'ElevenLabs voice is not connected yet. Written outfit descriptions can still be created.';
    }
  };
}
