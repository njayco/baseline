# Baseline - Melody to Sheet Music

**Sing it. See it. Play it.**

Baseline is a web application that converts recorded melodies — humming, whistling, beatboxing, and more — into professional sheet music notation in real time. Built with a dark, modern UI featuring vibrant orange accents, Baseline offers both mobile and desktop editing modes and follows a "free to create, pay to export" business model.

---

## Features

### Audio Recording & AI Transcription
- Record melodies directly in the browser using the device microphone via the MediaRecorder API
- Supports multiple input sources: humming, whistling, beatbox, piano, and drums
- Audio is sent to the backend, converted to a compatible format using ffmpeg, and transcribed via OpenAI's `gpt-4o-mini-transcribe` model
- A second AI pass with `gpt-5.2` converts the transcription into structured musical note events (MIDI values, timing, velocity, confidence)

### Sheet Music Rendering
- Real-time sheet music display powered by VexFlow
- Notes render on a musical staff as they are detected
- Displays score title, artist name, time signature, and key
- Desktop mode shows a full-page paper-style score view
- Mobile mode provides a compact horizontal staff

### Dual Interface Modes
- **Mobile Mode**: Streamlined recording interface with a large record button, elapsed time display, instrument selector grid, and settings drawer for score metadata
- **Desktop Mode**: DAW-style editor with a sidebar containing transport controls, score info fields, vertical instrument selector, BPM slider, quantization toggle, and export buttons. Main area shows a scrollable paper-style score

### Score Management
- Full CRUD operations for scores stored in PostgreSQL
- Editable score title and artist name on both mobile and desktop
- Undo last note, clear session, and save functionality
- Scores persist note events as JSONB, along with BPM, time signature, and instrument metadata

### Export Formats
- **MusicXML** ($0.99) — Industry-standard notation format compatible with Finale, Sibelius, MuseScore, and other notation software. Generated server-side with proper measure layout, key/time signatures, tempo markings, and note durations
- **MIDI** ($1.99) — Standard MIDI file (Format 0) with accurate tick timing, velocity mapping, tempo meta-events, and track naming. Compatible with any DAW or MIDI player
- **JSON** (Free) — Raw score data export including all note events, metadata, and settings

### Stripe Payment Integration
- Stripe Checkout for paid exports with secure session-based payment verification
- Export records tracked in the database with Stripe session IDs
- Download endpoint enforces payment: validates export record ownership, Stripe session match, and payment status before serving files
- Products managed via Stripe with metadata linking (`app: baseline`, `format: musicxml/midi`)
- Webhook integration for real-time payment event processing

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4 |
| UI Components | Radix UI primitives, shadcn/ui, Lucide icons |
| Routing | Wouter |
| Sheet Music | VexFlow 5 |
| Playback | Tone.js |
| Backend | Express 5, TypeScript (tsx) |
| Database | PostgreSQL (Neon) via Drizzle ORM |
| AI | OpenAI (gpt-4o-mini-transcribe, gpt-5.2) |
| Audio Processing | ffmpeg (WebM/MP4/OGG → WAV conversion) |
| Payments | Stripe Checkout, stripe-replit-sync |
| Deployment | Replit |

---

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx          # Mode selection (mobile/desktop)
│   │   │   ├── Mobile.tsx           # Mobile recording interface
│   │   │   └── Desktop.tsx          # Desktop DAW-style editor
│   │   ├── components/
│   │   │   ├── Staff.tsx            # VexFlow sheet music renderer
│   │   │   ├── InstrumentSelector.tsx # Input source picker
│   │   │   └── TransportControls.tsx  # Playback transport (Play/Pause, Stop, Replay)
│   │   └── lib/
│   │       ├── audio-engine.ts      # MediaRecorder + API transcription
│   │       ├── playback/
│   │       │   └── player.ts        # Tone.js playback engine with note scheduling
│   │       └── types.ts             # Frontend type definitions
│   └── index.html
├── server/
│   ├── index.ts                     # Express server setup + Stripe init
│   ├── routes.ts                    # API routes (CRUD, transcription, export, checkout)
│   ├── storage.ts                   # Database storage layer (Drizzle)
│   ├── db.ts                        # PostgreSQL connection
│   ├── stripeClient.ts              # Stripe client configuration
│   ├── webhookHandlers.ts           # Stripe webhook event handlers
│   ├── seed-products.ts             # Stripe product/price seeder
│   ├── lib/
│   │   ├── musicxml.ts              # MusicXML file generation
│   │   └── midi-export.ts           # MIDI file generation
│   └── replit_integrations/
│       └── audio/
│           └── client.ts            # OpenAI client + ffmpeg audio conversion
├── shared/
│   └── schema.ts                    # Drizzle ORM schema + Zod validation
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── vite.config.ts
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scores` | List all scores |
| `POST` | `/api/scores` | Create a new score |
| `GET` | `/api/scores/:id` | Get a single score |
| `PATCH` | `/api/scores/:id` | Update a score |
| `DELETE` | `/api/scores/:id` | Delete a score |
| `POST` | `/api/scores/:id/notes` | Append notes to a score |
| `POST` | `/api/transcribe-notes` | Transcribe audio to note events |
| `GET` | `/api/export-prices` | Get export pricing from Stripe |
| `POST` | `/api/scores/:id/checkout` | Create Stripe checkout session |
| `GET` | `/api/scores/:id/export/:format/download` | Download exported file (requires payment) |
| `GET` | `/api/scores/:id/export/json` | Free JSON export |

---

## Database Schema

### `scores`
Stores score metadata and note events as JSONB. Fields: `id`, `title`, `artist`, `bpm`, `time_signature`, `notes` (JSONB array of NoteEvent objects), `instrument`, `created_at`, `updated_at`.

### `exports`
Tracks export requests and payment status. Fields: `id`, `score_id` (FK), `format`, `price_cents`, `stripe_session_id`, `paid`, `created_at`.

### `conversations` / `messages`
Chat and AI conversation history tables for future features.

---

## How It Works

1. **Record**: User opens mobile or desktop mode and taps Record. The browser captures audio via `MediaRecorder` using the best available codec (WebM/Opus preferred).

2. **Transcribe**: When recording stops, the audio blob is converted to base64 and sent to `/api/transcribe-notes`. The server converts the audio to WAV using ffmpeg if needed, then sends it to OpenAI's `gpt-4o-mini-transcribe` for speech-to-text transcription.

3. **Generate Notes**: The transcription text is passed to `gpt-5.2` with a music-aware system prompt that generates structured note events — each with MIDI pitch (48-84), timing, duration, velocity, and confidence values, quantized to 1/8 notes at the score's BPM.

4. **Render**: Note events stream into the VexFlow-powered `Staff` component, rendering standard music notation on a treble clef with proper note heads, stems, and measure bars.

5. **Save**: Scores auto-save to PostgreSQL with all metadata. Users can edit the title and artist name at any time.

6. **Export**: Clicking an export button creates a Stripe Checkout session. After payment, the server generates the requested format (MusicXML or MIDI) and serves it as a file download. Payment is verified by checking the export record, Stripe session status, and session ownership before generating the file.

---

## Playback Controls

Both mobile and desktop modes include transport controls for playing back recorded melodies:

- **Play / Pause**: Starts playback of the current notes using a synthesizer (Tone.js). Press again to pause.
- **Stop**: Stops playback and resets to the beginning.
- **Replay**: Jumps to the start and immediately begins playing.

During playback, the currently sounding note is highlighted in bright orange (#FF6600) on the sheet music in real time. Previously played notes return to their normal style. This highlighting works on both mobile and desktop.

### Title & Artist Metadata

- On **mobile**, tap the settings gear icon to edit the score title and artist name. These fields are shown above the staff and are included in all exports (MusicXML title/composer, MIDI track name).
- On **desktop**, title and artist fields are in the sidebar under "Score Info".

### Known Limitations

- Playback uses a simple triangle-wave synth; it does not replicate the original recording's timbre.
- Note IDs are generated client-side. Scores saved before the ID update may lack IDs until re-transcribed.
- Playback highlights notes based on timing data from the AI transcription, which may not perfectly match perceived rhythm.

---

## Design

- **Theme**: Dark background with vibrant orange (#FF6600 / hsl 25 100% 50%) accents
- **Fonts**: Audiowide (display/branding), Inter (UI text), JetBrains Mono (monospace/technical)
- **Score View**: Paper-textured white background with serif typography for an authentic sheet music feel
- **Animations**: Smooth fade-in transitions, pulse effects during recording, gradient ambient backgrounds

---

## License

MIT
