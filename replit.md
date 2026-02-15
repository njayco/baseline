# Baseline - Melody to Sheet Music

## Overview
Baseline is a web application that converts recorded melodies (humming, whistling, beatbox, etc.) into professional sheet music notation. Features a dark theme with vibrant orange accents (#FF6600), offers both mobile and desktop editor modes, and uses a "free to create, pay to export" business model.

## Recent Changes
- 2026-02-15: Added playback controls (Play/Pause, Stop, Replay) via Tone.js on both mobile and desktop
- 2026-02-15: Added real-time note highlighting during playback (active notes glow #FF6600)
- 2026-02-15: Added stable `id` field to NoteEvent for reliable note tracking
- 2026-02-15: Removed "Tabla" from instrument input sources
- 2026-02-15: Fixed mobile sheet music scrolling (vertical measure wrapping, sticky controls)
- 2026-02-15: Added "Generated Sheet Music" label above staff on both modes
- 2026-02-15: Set up PostgreSQL database with scores, exports, conversations, messages tables
- 2026-02-15: Built backend API routes for score CRUD, audio transcription, MusicXML/MIDI export
- 2026-02-15: Integrated OpenAI (via Replit AI Integrations) for audio-to-notes transcription
- 2026-02-15: Replaced mock audio engine with real MediaRecorder API + backend transcription
- 2026-02-15: Added export functionality for MusicXML and MIDI formats
- 2026-02-15: Installed ffmpeg for audio format conversion

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
- `client/src/components/Staff.tsx` - VexFlow-based sheet music renderer
- `client/src/components/InstrumentSelector.tsx` - Input source selector (humming, whistle, beatbox, piano, drums)
- `client/src/components/TransportControls.tsx` - Playback transport (Play/Pause, Stop, Replay)
- `client/src/lib/audio-engine.ts` - Real audio recording via MediaRecorder + API transcription
- `client/src/lib/playback/player.ts` - Tone.js playback engine with note scheduling and time tracking
- `client/src/lib/types.ts` - Frontend type definitions (NoteEvent with id, ScoreState with title/artist)

### Backend (Express)
- `server/index.ts` - Express server setup
- `server/routes.ts` - API routes (scores CRUD, transcription, export)
- `server/storage.ts` - Database storage interface using Drizzle ORM
- `server/db.ts` - PostgreSQL connection via pg Pool + Drizzle
- `server/lib/musicxml.ts` - MusicXML file generation
- `server/lib/midi-export.ts` - MIDI file generation

### Shared
- `shared/schema.ts` - Drizzle ORM schema (scores, exports, conversations, messages)

### AI Integration
- Uses OpenAI via Replit AI Integrations (env: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)
- gpt-4o-mini-transcribe for audio-to-text
- gpt-5.2 for text-to-note-events conversion
- Audio format detection and ffmpeg conversion in `server/replit_integrations/audio/client.ts`

### Database (PostgreSQL)
- `scores` - Stores score metadata and note events (JSONB)
- `exports` - Tracks export requests and payment status
- `conversations` / `messages` - Chat/AI conversation history

### API Endpoints
- `GET/POST /api/scores` - List/create scores
- `GET/PATCH/DELETE /api/scores/:id` - Get/update/delete score
- `POST /api/scores/:id/notes` - Append notes to score
- `POST /api/transcribe-notes` - Audio transcription (base64 audio → note events)
- `POST /api/scores/:id/export/musicxml` - Generate MusicXML download
- `POST /api/scores/:id/export/midi` - Generate MIDI download
- `GET /api/scores/:id/export/json` - Free JSON export
