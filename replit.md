# Baseline - Melody to Sheet Music

## Overview
Baseline is a web application that converts recorded beatbox and drum sounds into professional percussion sheet music notation. Currently beatbox-first, with other instruments (humming, whistle, piano, drums) coming soon. Features a dark theme with vibrant orange accents (#FF6600), offers both mobile and desktop editor modes, and uses a "free to create, pay to export" business model.

## Recent Changes
- 2026-02-15: Added free PDF download (client-side jspdf + svg2pdf.js) and audio recording download
- 2026-02-15: Added notation color scheme customization with 6 preset themes
- 2026-02-15: Redesigned export flow with checkbox format selection, subtotal calculation, and Checkout button
- 2026-02-15: Multi-format Stripe checkout: select MusicXML + MIDI in single session
- 2026-02-15: Added post-payment success page (/checkout/success) with download links after payment verification
- 2026-02-15: Fixed Tone.js playback crash when drum hits share same timestamp (offset deduplication)
- 2026-02-15: Added ExportPanel component used on both Desktop and Mobile
- 2026-02-15: Added /api/verify-payment endpoint with server-side export validation
- 2026-02-15: Refactored to beatbox-first mode with DSP-based onset detection pipeline
- 2026-02-15: Built server/lib/drum-transcriber.ts for deterministic percussion event detection
- 2026-02-15: Added DrumNoteEvent and RestEvent types alongside existing MelodicNoteEvent
- 2026-02-15: AI classification pass only labels detected hits (kick/snare/hat/etc.), never invents notes
- 2026-02-15: Updated Staff.tsx with percussion clef and drum notation mapping
- 2026-02-15: Updated playback engine with drum-specific synthesis (kick=sine drop, snare=noise burst, hat=HP noise)
- 2026-02-15: InstrumentSelector now shows beatbox as enabled, others as "Coming soon"
- 2026-02-15: Added Beatbox Tips and Beatbox Mode badges to both mobile and desktop
- 2026-02-15: Set up PostgreSQL database with scores, exports, conversations, messages tables
- 2026-02-15: Built backend API routes for score CRUD, audio transcription, MusicXML/MIDI export
- 2026-02-15: Integrated OpenAI (via Replit AI Integrations) for audio classification

## User Preferences
- Design: Dark theme with primary color hsl(25 100% 50%) vibrant orange
- Fonts: Audiowide (display), Inter (UI), JetBrains Mono (monospace)
- Desktop instrument selector: Vertical (one-by-one) layout
- Editable fields for score title and artist name on both mobile and desktop
- Business model: Free to create, pay to export ($0.99 MusicXML, $1.99 MIDI)

## Project Architecture

### Frontend (React + Vite)
- `client/src/pages/Landing.tsx` - Landing page with mode selection
- `client/src/pages/Mobile.tsx` - Mobile recording interface
- `client/src/pages/Desktop.tsx` - Desktop DAW-style editor with sidebar controls
- `client/src/components/Staff.tsx` - VexFlow-based sheet music renderer (supports percussion + treble clef)
- `client/src/components/InstrumentSelector.tsx` - Input source selector (beatbox enabled, others "Coming soon")
- `client/src/components/TransportControls.tsx` - Playback transport (Play/Pause, Stop, Replay)
- `client/src/lib/audio-engine.ts` - Real audio recording via MediaRecorder + API transcription
- `client/src/lib/playback/player.ts` - Tone.js playback engine with drum synthesis and note scheduling
- `client/src/components/ExportPanel.tsx` - Export format selection with checkboxes, subtotal, Stripe checkout
- `client/src/pages/CheckoutSuccess.tsx` - Post-payment success page with download links
- `client/src/lib/types.ts` - Frontend type definitions (MelodicNoteEvent, DrumNoteEvent, RestEvent union)

### Backend (Express)
- `server/index.ts` - Express server setup
- `server/routes.ts` - API routes (scores CRUD, beatbox transcription, export)
- `server/storage.ts` - Database storage interface using Drizzle ORM
- `server/db.ts` - PostgreSQL connection via pg Pool + Drizzle
- `server/lib/drum-transcriber.ts` - DSP onset detection, silence gap detection, rest insertion, BPM quantization
- `server/lib/musicxml.ts` - MusicXML file generation
- `server/lib/midi-export.ts` - MIDI file generation

### Shared
- `shared/schema.ts` - Drizzle ORM schema + Zod validation (melodicNoteSchema, drumNoteSchema, restEventSchema)

### Transcription Pipeline (Beatbox)
1. Audio recorded in browser → base64 → POST /api/transcribe-notes
2. Server converts to normalized mono WAV (44.1kHz) via ffmpeg
3. DSP onset detection in drum-transcriber.ts:
   - Short-time energy envelope (frame=1024, hop=256)
   - Spectral flux for transient detection
   - Onset threshold + minimum inter-onset interval prevents phantom notes
   - Silence gaps → rest events inserted automatically
   - BPM-based quantization to rhythmic grid
4. Only detected hits sent to AI (gpt-4o-mini) for drum label classification
5. AI returns exactly N labels for N hits (never adds/removes events)
6. Final DrumNoteEvent[] + RestEvent[] returned to client

### Tunable Thresholds (in server/routes.ts handleBeatboxTranscription)
- `onsetThreshold`: 0.12 (higher = fewer false positives)
- `minInterOnsetMs`: 100ms (prevents double-counting)
- `silenceRmsThreshold`: 0.02
- `restMinMs`: 200ms (minimum silence for a rest)
- `subdivision`: 8 (1/8 note grid, can set to 16)

### AI Integration
- Uses OpenAI via Replit AI Integrations (env: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)
- gpt-4o-mini for drum hit classification (strict prompt: label only, never invent)
- Debug mode: set DEBUG_DRUM_TRANSCRIBE=true env var for verbose logging

### Database (PostgreSQL)
- `scores` - Stores score metadata and note events (JSONB, supports drum/melodic/rest)
- `exports` - Tracks export requests and payment status
- `conversations` / `messages` - Chat/AI conversation history

### Export / Payment Flow
1. User selects formats (MusicXML $0.99, MIDI $1.99) via checkboxes in ExportPanel
2. Subtotal calculates, Checkout button appears
3. POST /api/scores/:id/checkout with `formats` array → creates export records + Stripe checkout session
4. Stripe redirects to /checkout/success after payment
5. POST /api/verify-payment validates exports belong to score + Stripe session paid
6. Download buttons appear, each hitting GET /api/scores/:id/export/:format/download

### API Endpoints
- `GET/POST /api/scores` - List/create scores
- `GET/PATCH/DELETE /api/scores/:id` - Get/update/delete score
- `POST /api/scores/:id/notes` - Append notes to score
- `POST /api/transcribe-notes` - Audio transcription (beatbox: DSP + AI classification)
- `POST /api/scores/:id/checkout` - Multi-format Stripe checkout (accepts `formats` array)
- `POST /api/verify-payment` - Verify Stripe payment and mark exports paid
- `GET /api/scores/:id/export/:format/download` - Download exported file (requires paid export)
- `GET /api/scores/:id/export/json` - Free JSON export
