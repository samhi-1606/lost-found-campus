# lost-found-campus

CampusFind — a campus Lost & Found application.

## Structure

- `src/` — React + Vite frontend (Firebase Auth, Cloudinary uploads, Firestore report submission).
- `functions/` — Firebase Cloud Functions (reports, matching, ownership verification, secure handover).
- `ai/` — Featherless AI intelligence layer (`@lfc/ai`), server-side only.

## Run the frontend locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite, usually:

http://localhost:5173

## Notes

- Featherless AI is never called from the browser; it runs only in `ai/` behind Cloud Functions.
- `ai/` must be built (`npm --prefix ai run build`) before `functions/` can import `@lfc/ai`.
- Mock data used by not-yet-wired screens lives in `src/data/mockData.js`.
- The UI is intentionally warm, humanistic and non-gradient.
