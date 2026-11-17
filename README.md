# Sock Drawer

ECE:5230 Generative AI Tools · Team 4

A mobile-friendly wardrobe assistant where you can upload clothing, discover outfit combinations, hear descriptions, and preview clothing on yourself.

## Run locally

Requires Node.js 20.12 or newer. No dependencies or install step.

```powershell
npm start
```

Open **http://localhost:3000**. Use **Explore sample wardrobe** for a quick walkthrough, or **Add clothing** to start your own. Samples are illustrations, not real wardrobe photos.

```powershell
npm test
```

## Connect AI

```powershell
Copy-Item .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then restart the server. Never put keys in browser code or commit `.env`. The status panel reports key configuration, not verified account access.

The server integrates the proposal's `gpt-5.4-mini` through the Responses API for clothing identification and generated-preview descriptions, and `gpt-image-2` through the Images edits API for previews. Models can be overridden with `VISION_MODEL` and `IMAGE_MODEL`. Account model access and credits are required. Photo operations require consent and can incur API charges. Missing keys produce an explicit error, never a simulated AI result.

### Connect the ElevenLabs narrator

Set these server-only values in `.env`, then restart the server:

```dotenv
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
```

Use an **ElevenLabs** API key with text-to-speech permission and a voice ID available to that account. The voice ID is an identifier, not the voice's display name; copy it from your ElevenLabs voice library or find it through [Get voices](https://elevenlabs.io/docs/api-reference/voices/search). Choose a voice whose samples sound warm and conversational. Narration uses **Eleven v3** (`eleven_v3`) through the [Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). The OpenAI key is still used for image generation and clothing descriptions. Configuration status requires both ElevenLabs values but does not verify permissions, voice access, or credits. Never put either API key in browser code. Older Qwen/DashScope environment variables are no longer used.

Generated outfit descriptions target roughly 500 characters (including spaces), with a 550-character maximum, prioritizing each garment and its most identifying details. Each description is synthesized in one ElevenLabs request.

Each try-on automatically analyzes the **finished preview** and displays a detailed, friendly clothing description. It describes visible colors, patterns, garment cut, sleeves, layering, and distinguishing details, with uncertainty for cropped or obscured clothing. It does not assume that everything in the requested outfit appeared in the image. If description generation fails, the image remains available with **Retry outfit description**, which does not regenerate the image.

The **Hear this outfit** button remains visible on the preview screen. It is disabled while the description is being prepared or unavailable, with a status explaining how to retry. After updating server code, restart `npm start`; you can then use **Retry outfit description** on an existing preview without creating another image. An ElevenLabs HTTP 402 means its account/plan or selected-voice access needs attention; regenerating the image will not resolve it.

Beside each outfit result, check the narration permission box and choose **Hear this outfit**. Only the written description, plus a delivery cue, is sent to ElevenLabs. An Eleven v3 audio tag requests a warm, friendly, light-hearted, supportive, conversational voice with an unhurried pace, and stability is set to 0.5. Voice choice also affects delivery; listen to samples and evaluate actual output. The cue is only added to the provider request; the on-page transcript stays unchanged. The server receives MP3 audio directly and returns it to the player. Use the native player to pause/resume, **Stop narration** to stop, or **Hear this outfit again** to replay cached audio without another provider request. No audio plays automatically when an outfit is generated.

The local outfit picker also generates a description for every combination using its exact saved clothing labels and identifying details. Add these details manually or review the details suggested by clothing identification. Missing visual details are acknowledged rather than invented. Written descriptions remain available without ElevenLabs credentials or when speech generation fails.

## First milestone

- Add, edit, remove, search, and filter clothing with compressed photos and editable labels.
- Save your wardrobe in browser IndexedDB across reloads.
- Identify multiple visible garments in a photo and review suggested labels before saving each piece.
- Match existing clothing by occasion and warmth, with explanations and alternate combinations. **Matching is local rules, not AI reasoning or color analysis.**
- Generate detailed preview descriptions and read outfit descriptions aloud using ElevenLabs Eleven v3, with pause, stop, and cached replay controls.
- Request virtual previews from a wardrobe piece, an inspiration photo, or a written prompt. The outfit studio can also hand a suggested combination to try-on.
- Download generated previews, with AI labeling and appearance preservation instructions.
- Responsive layout, keyboard controls, named inputs, native modal dialogs, status announcements, and explicit color names.

## Privacy and boundaries

Wardrobe images and labels live only in this browser. Clearing browser data deletes them. The local server does not persist photos or audio. Personal try-on images, generated images, preview descriptions, and narration audio are held in tab memory. OpenAI receives photos for explicitly requested AI actions, including analyzing generated previews. With narration consent, ElevenLabs receives only the written outfit description and delivery cue, not photos. Provider retention policies still apply. Audio is returned through the local server and cached in the tab for the current outfit; replacing the outfit or reloading clears that cache. Photo imports are limited to JPEG, PNG, and WebP under 10 MB and resized to a maximum 1024 pixels before storage or processing.

The server binds to loopback only. This is a local development app, not a production deployment; add authentication, rate limits, durable storage, and deployment-specific origin handling before exposing an API key to other users.

## Next milestones

See [implementation notes](docs/IMPLEMENTATION.md) for proposal coverage and evaluation tasks. Native phone packaging, FASHN Try-On v1.6, AI outfit reasoning, automated photo cropping, accounts, and cloud sync remain future work. Live description accuracy, narration naturalness, image quality, and identity preservation require evaluation with consented test photos.

## API references

- [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Image edits](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [ElevenLabs Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [ElevenLabs prompting and delivery](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3)
