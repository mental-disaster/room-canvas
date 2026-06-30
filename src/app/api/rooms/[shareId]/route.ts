import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseScene, serializeScene, type RoomPayload, type RoomScene } from "@/lib/scene";

type RouteContext = {
  params: Promise<{
    shareId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const room = await prisma.room.findUnique({
    where: { shareId },
  });

  if (!room) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  return NextResponse.json(toPayload(room));
}

export async function PUT(request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const body = await request.json().catch(() => null);

  if (!isRoomScene(body?.scene)) {
    return NextResponse.json({ message: "Invalid scene payload." }, { status: 400 });
  }

  const existing = await prisma.room.findUnique({
    where: { shareId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  const scene = body.scene as RoomScene;
  const room = await prisma.room.update({
    where: { shareId },
    data: {
      width: scene.canvas.width,
      height: scene.canvas.height,
      scene: serializeScene(scene),
    },
  });

  return NextResponse.json(toPayload(room));
}

function toPayload(room: {
  shareId: string;
  name: string | null;
  width: number;
  height: number;
  scene: string;
  updatedAt: Date;
}): RoomPayload {
  return {
    shareId: room.shareId,
    name: room.name,
    width: room.width,
    height: room.height,
    scene: parseScene(room.scene, room.width, room.height),
    updatedAt: room.updatedAt.toISOString(),
  };
}

function isRoomScene(value: unknown): value is RoomScene {
  if (!value || typeof value !== "object") {
    return false;
  }

  const scene = value as Partial<RoomScene>;

  return (
    scene.schemaVersion === 1 &&
    typeof scene.canvas?.width === "number" &&
    typeof scene.canvas?.height === "number" &&
    Array.isArray(scene.walls) &&
    Array.isArray(scene.furniture) &&
    Array.isArray(scene.groups)
  );
}
