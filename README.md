# CampusFind — Campus Lost & Found AI

An AI-assisted campus Lost & Found platform that matches lost and found item reports, verifies ownership, and releases exact pickup locations only to the verified owner.

## Problem Statement

Campus lost & found today is a noticeboard and a WhatsApp group. Reports are unstructured free text, so nobody can reliably tell whether a "black bag near the library" is the same object as a "navy backpack at the library steps." Two failures follow:

- **Nothing gets matched.** Comparing every lost report against every found report by hand does not scale, so items sit unclaimed.
- **Nothing is safe.** Posting an exact found location publicly lets the first person to see the post collect an item that is not theirs, and it exposes the finder.

## Solution

CampusFind structures every report with AI, matches lost against found automatically, and puts a verification gate in front of the sensitive data.

Reports are submitted through a React frontend with Firebase Auth and Cloudinary image uploads. A Firestore trigger runs a server-side Featherless AI pipeline that extracts item attributes, reads the photo, and normalizes the free-text location into a known campus landmark. Candidates are ranked deterministically, and only the strongest are compared by AI, which returns a confidence score plus human-readable reasoning.

Crucially, the AI never decides ownership. It only proposes likely matches and recommends verification. A claimant must answer ownership-verification questions, and only after the backend marks that verification successful is the exact found location released — and only to that claimant.

## Key Features

- **AI attribute extraction** — turns free-text descriptions into structured, comparable item attributes.
- **Multimodal image understanding** — analyzes the uploaded photo for color, brand, material, and distinctive marks.
- **Campus location normalization** — maps natural language ("near the library steps") onto a trusted campus landmark set.
- **AI-assisted matching with confidence and reasoning** — every match carries a score, matched attributes, contradictions, and an explanation instead of an opaque verdict.
- **Firebase Authentication and Firestore** — per-user accounts, report storage, and security rules.
- **Cloudinary image uploads** — unsigned browser uploads; the API secret never reaches the client.
- **Ownership verification** — challenge answers checked server-side and recorded as a verification document.
- **Secure handover** — one-time handover code, stored only as a hash, single-use and expiring.
- **Privacy-preserving location release** — exact coordinates are kept in a separate collection and released only after successful verification.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 6, React Router 7 |
| Auth & data | Firebase Authentication, Cloud Firestore |
| Backend | Firebase Cloud Functions (Node.js) |
| Media | Cloudinary (unsigned upload) |
| AI | Featherless AI (text, vision, and comparison models) |
| Languages | TypeScript (AI layer), JavaScript (frontend, functions) |
| Validation & tests | Zod schemas, Vitest |

## AI Workflow

The AI layer (`@lfc/ai`) is server-only and runs behind Cloud Functions. It receives plain domain objects and knows nothing about Firebase, HTTP, or React.

1. **Per report** — extract item attributes from text, analyze the image if one exists, and normalize the location description to a campus landmark.
2. **Rank** — score all candidate reports of the opposite type deterministically, using attribute, location, and time plausibility.
3. **Compare top-K** — send only the highest-ranked candidates to the AI comparison model, avoiding an N×M explosion of API calls.
4. **Decide** — blend the AI evidence into a deterministic match decision (tier, score, evidence) and persist it with the match.

Each AI response is parsed against a Zod schema, so malformed model output is rejected rather than trusted. All Featherless traffic goes through a single client that owns timeouts, retries, and concurrency limits, and error messages are sanitized so the API key can never leak into logs.

## Security & Privacy Workflow

The exact found location is treated as the sensitive asset and is protected by a backend-only gate.

1. A finder submits the exact location; it is stored in a protected `foundLocations` collection, separate from the public report.
2. AI matching runs, but its decision always carries `revealExactLocation: false` — the pipeline cannot grant access, by construction.
3. A claimant completes ownership verification. Answers are checked server-side and the result is written as a verification document.
4. The claimant calls the `getVerifiedFoundLocation` callable. The gate releases coordinates only when the caller is authenticated, is the claimant on that verification, the verification refers to the requested found report, and its status is `successful`. Pending and failed always deny, and a confirmed match or a valid login is never sufficient.
5. Handover uses a one-time code that is stored only as a hash, can be redeemed once, and expires.

## Project Structure

```
├── src/                 React + Vite frontend (pages, components, Firebase config)
├── functions/           Firebase Cloud Functions
│   ├── data/            Firestore access: reports, matches, verification, handover
│   ├── matching/        Bridges Firestore documents to the AI pipeline
│   ├── verification/    Backend gate for revealing the exact found location
│   ├── https/           Callable endpoints (submit / get found location)
│   └── triggers/        onReportCreated — kicks off AI matching
├── ai/                  @lfc/ai — Featherless AI layer (TypeScript, server-only)
│   ├── src/services/    Extraction, image understanding, location, ranking, decision
│   ├── src/featherless/ Single network boundary to the AI provider
│   └── test/            Vitest suite
└── firestore.rules      Firestore security rules
```

## Run Locally

```bash
npm install
npm run dev
```

The app is served at the URL Vite prints, usually http://localhost:5173.

The AI layer is built separately before Cloud Functions can import it:

```bash
npm --prefix ai install && npm --prefix ai run build
```

## Build

```bash
npm run build
```

## Configuration

All keys are supplied through environment variables and **must never be committed**. `.env` and `.env.local` are gitignored; `ai/.env.example` documents variable names only and holds no values.

- **Frontend** (`.env.local`, safe-to-publish public config): `VITE_FIREBASE_*`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`.
- **Server-side secrets** (Cloud Functions runtime config, never in the browser bundle): `FEATHERLESS_API_KEY` and the other `FEATHERLESS_*` settings.

The Cloudinary API secret and any Firebase service-account credentials stay server-side and are never referenced by frontend code.

## Team Contributions

| Role | Contribution |
| --- | --- |
| Frontend | React + Vite application, routing, and UI for reporting, matches, verification, and handover |
| Firebase / Backend | Firebase project setup, Firestore data model and rules, Cloud Functions structure, report submission |
| Featherless AI | AI layer design: attribute extraction, image understanding, location normalization, ranking, comparison, and match decision |
| Verification / Handover | Ownership verification, secure one-time-code handover, and the backend gate for exact-location release |
| Integration / Testing | Branch integration, cross-module contracts, build and typecheck validation, AI test suite |
