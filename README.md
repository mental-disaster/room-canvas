# Room Canvas

Room Canvas is a shared room-layout editor for trying furniture placement before moving.

## Features

- Create a room canvas with custom pixel width and height.
- Upload a floor-plan image as a local-only tracing background.
- Draw walls with polyline or freehand tools.
- Add rectangle and circle furniture with pixel dimensions.
- Move, resize, rotate, delete, group, and ungroup furniture.
- Undo and redo local edits.
- Save layouts to SQLite and edit them through an anonymous share link.

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Konva / react-konva
- Prisma 7 + SQLite
- pnpm

## Development

```bash
pnpm install
pnpm prisma generate
pnpm prisma db push
pnpm dev
```

Open `http://localhost:3000`.

## Notes

- Uploaded floor-plan images are not saved to the server. Only the traced walls and furniture scene JSON are stored.
- The v1 save policy is last-write-wins for shared edit links.
- The local SQLite database is `dev.db` and is ignored by git.
