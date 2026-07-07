# Room Canvas

이사 전 가구를 미리 배치해보거나, 배치를 다른 사람과 공유하고 의견을 나누기 위해 만들어진 프로젝트 입니다.

## Features

- 원하는 픽셀 크기의 n x m 크기의 직사각형 방 생성
- 실제 방 도면을 업로드해 배경으로 둔 뒤 벽을 그려보세요(이미지 업로드 기능은 없습니다.) 
- 픽셀단위 사각형/원형 가구 생성
- 가구 이동, 회전 등의 기능을 제공합니다.
- 만든 레이아웃을 저장해 다른 사람들에게 공유하거나 공유받은 배치를 기반으로 새로운 버전의 나만의 방을 만들 수 있어요.

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

## 주의사항

- 업로드한 배경사진의 서버 저장 기능이 없기 때문에 공유하려면 직접 벽을 그려야합니다.
- 동일한 버전 저장시 마지막 저장본이 해당 버전에 저장됩니다. 동시에 수정중이라면 마지막으로 저장한 사람의 데이터만 남으니 주의하세요.
