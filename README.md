# MotionAI

Browser-only, BYOK (Bring Your Own Key) AI motion-graphics video workspace built with Next.js App Router, Tailwind CSS, IndexedDB (`idb`), and Remotion.

## Routes
- `/` — Product shell (onboarding, project management, chat workspace, stage panel, and settings).
- `/lab` — Internal Phase 0 feasibility harness (WebCodecs environment check, Remotion Player preview, MP4 export, Gemini REST test, and in-browser TSX compilation).

## Local Development
```bash
npm install
npm run dev
```

All API keys, preferences, projects, and chat messages stay in the user's browser (`localStorage` and `IndexedDB`). No server-side API keys or backend storage are used.
