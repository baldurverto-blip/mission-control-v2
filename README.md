## Mission Control

Mission Control is a Next.js operating surface for VertoOS. It reads live workspace artifacts from `~/verto-workspace` and renders them into dashboard, ops, factory, and governance views.

## Surfaces

- `/` dashboard overview
- `/board` board MVP for board goals, latest summary/verdict, latest actions, and recent board meeting history

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open `http://localhost:3000`.

The Board MVP is file-backed only and reads:

- `company/board-goals.md`
- `ops/board-meetings/*.md`
- `ops/board-meetings/summaries/*.md`
- `ops/board-meetings/actions/*.json`
