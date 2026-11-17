# Implementation notes

Source: `../Proposal Idea/GAIT Project Proposal.docx`, read October 29, 2026. The source document remains unchanged.

## Architecture

Browser modules provide a responsive web app with IndexedDB wardrobe persistence. The same pure outfit selection and saved-detail description module is served to the browser and imported in unit tests. A dependency-free Node HTTP server serves public assets and proxies opt-in OpenAI and ElevenLabs operations. Keys remain on the server. No database or app account is required for local development.

## Outfit narration

`POST /api/preview` creates the image and then analyzes that exact image through OpenAI vision, returning `{ image, description }`. Descriptions target 450–500 characters including spaces, with a validated 550-character maximum. The local outfit picker reserves space for all selected garment names and colors before allocating the remaining budget to details. The description is conversational prose grounded in the visible garments, rather than a restatement of the original outfit prompt. If description generation fails, the successful image is returned with `description: null` and a separate error. `POST /api/describe` retries only that step. Both routes require photo consent.

`src/narration.js` implements `POST /api/narrate`: given an explicitly consented description of up to 550 characters, it makes one server-side `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` request. The API key comes from `ELEVENLABS_API_KEY` and is sent in the `xi-api-key` header. `ELEVENLABS_VOICE_ID` must identify a voice available to that account; there is no assumed default voice. The body selects `model_id: eleven_v3`, English, and `voice_settings: { stability: 0.5 }`. A provider-only audio tag requests warm, friendly, light-hearted, supportive, conversational delivery and unhurried pacing; the visible transcript stays unchanged. Voice selection and live evaluation remain important for naturalness. Eleven v3 does not use a separate instructions field; speed, similarity, and speaker-boost settings are omitted because they are unsupported by that model.

The speech request sends text and a delivery cue, never clothing or person photos. The provider returns MP3 bytes directly; no result URL download or speech chunking is needed. Audio type and signature are checked, responses are limited to 8 MB, and redirects are disabled so credentials cannot be forwarded to another host. The response retains the player's `{ clips: [dataUrl], provider: 'ElevenLabs', model: 'eleven_v3' }` contract, with a single `data:audio/mpeg` clip. No server-side disk storage is used. Missing configuration, account errors, invalid audio, and timeouts return an explicit error while preserving the written description. Provider retention policies apply; this integration does not claim zero retention.

`public/narrator.js` plays the returned MP3, offers native pause/resume plus stop/replay controls, handles browser autoplay rejection, and caches audio for the current result. Replacing a result invalidates its audio; navigation stops playback and cancels pending browser requests. A revision check ignores late responses from older outfits. Clicking Hear requests audio; generating an outfit does not autoplay it. If the user cancels an in-flight request, provider work already started can still incur charges.

The local outfit picker uses `describeOutfit()` with the selected items' saved name, category, color, style, warmth, and optional identifying details. No provider call is needed to create that transcript. Clothing identification suggests identifying details for review; users can also enter or edit them. Missing visual details are stated explicitly. This path describes the saved wardrobe records; the preview path describes the generated image.

## Proposal coverage

| Proposal workflow | Initial implementation | Remaining work |
| --- | --- | --- |
| Try on your own clothes | Select wardrobe piece and person photo; request image edit | Dedicated FASHN adapter and quality comparison |
| Try on an inspiration outfit | Upload reference and person photos | Multi-garment fidelity evaluation |
| Identify closet and generate outfits | Vision labeling with review; local outfit combinations and spoken explanation | AI outfit reasoning, color matching, individual garment crops |
| Try on an outfit from a prompt | Person photo plus written outfit description | Evaluation over diverse poses and body types |
| Accessible spoken descriptions | Short transcripts, ElevenLabs Eleven v3 conversational voice, pause/stop/replay, keyboard-friendly forms | Live voice naturalness and description accuracy evaluation; screen reader audit with users |
| Responsible use | Consent before provider calls; preservation prompt; AI preview labels | Consent usability study and measured identity preservation |

## Evaluation plan

Use photos from people who explicitly consent. Compare every preview against the original for facial identity, skin tone, body proportions, garment fidelity, and visible artifacts. Record latency, provider/model, approximate cost, and success or failure. Include different lighting, skin tones, poses, clothing patterns, and occlusion. Ask reviewers whether the described pieces match the actual wardrobe and whether outfit explanations are useful. Do not treat successful API responses as proof of visual fidelity.

## Technical checks

Automated tests cover incomplete wardrobe handling, occasion and temperature selection, one-pieces, input immutability, image input restrictions, missing credentials, malformed provider output, preservation instructions, public asset serving, nonpublic files, required consent, malformed requests, and cross-origin rejection. Provider tests use injected fixtures and do not incur charges. Browser walkthrough and live provider quality evaluation are separate checks.

Initial verification: 16 automated tests passed. The local server started successfully. Visual browser verification was attempted but blocked by an unavailable browser host and a timed-out native app connection. No live provider requests were made; model access, generated image quality, speech playback, and the full browser upload/persistence flow still need interactive evaluation.

Narration was migrated to ElevenLabs Eleven v3 on November 16, 2026, preserving the roughly 500-character descriptions. All 35 automated tests pass. Verification covers actual-preview analysis, malformed descriptions, successful-image preservation, description-only retries, the ElevenLabs request URL and authentication, model and delivery settings, MP3 handling, the 550-character bound, missing keys or voice IDs, account and network errors, invalid or oversized audio, cached replay, stale response suppression, navigation cancellation, and native playback fallback. Provider tests use injected fixtures and incur no charges. No live provider calls were made; actual voice quality and playback still need evaluation after adding an ElevenLabs key and voice ID. The prior browser verification attempt was blocked by an unavailable browser host and a minimized native browser window that the wrapper could not restore.

Follow-up description fix: a live request with a locally drawn synthetic shirt reproduced OpenAI HTTP 400 because JSON mode requires the word JSON in the input messages, not only in top-level instructions. Both clothing identification and preview-description inputs now include this instruction, with regression coverage for the provider's validation rule. The corrected live description request succeeded with 492 characters. Preview narration controls now stay visible with a disabled button and an explanation before a description is ready or when it fails; description retry enables the button. A live Eleven v3 speech request returned HTTP 402 for the configured account/voice; this is reported as an account/plan issue while retaining the description and image. No personal photos were used for these diagnostics. The updated suite has 39 passing tests.
