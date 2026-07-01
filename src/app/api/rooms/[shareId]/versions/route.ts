import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  normalizeVersionMemo,
  normalizeVersionName,
  serializeScene,
  toRoomPayload,
  toRoomVersionSummary,
  type RoomScene,
} from "@/lib/scene";

type RouteContext = {
  params: Promise<{
    shareId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const room = await prisma.room.findUnique({
    where: { shareId },
    select: {
      id: true,
      latestVersion: true,
    },
  });

  if (!room) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  const versions = await prisma.roomVersion.findMany({
    where: {
      roomId: room.id,
    },
    orderBy: {
      version: "desc",
    },
  });

  return NextResponse.json({
    versions: versions.map((version) => toRoomVersionSummary(version, room.latestVersion)),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const body = await request.json().catch(() => null);
  const name = normalizeVersionName(body?.name);
  const memo = normalizeVersionMemo(body?.memo);

  if (!name) {
    return NextResponse.json({ message: "Version name is required." }, { status: 400 });
  }

  if (memo === undefined) {
    return NextResponse.json({ message: "Invalid version memo." }, { status: 400 });
  }

  if (!isRoomScene(body?.scene)) {
    return NextResponse.json({ message: "Invalid scene payload." }, { status: 400 });
  }

  const scene = body.scene as RoomScene;
  const serializedScene = serializeScene(scene);

  const payload = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { shareId },
      select: {
        id: true,
        shareId: true,
        name: true,
        latestVersion: true,
      },
    });

    if (!room) {
      return null;
    }

    const nextVersion = room.latestVersion + 1;
    const version = await tx.roomVersion.create({
      data: {
        roomId: room.id,
        version: nextVersion,
        name,
        memo,
        width: scene.canvas.width,
        height: scene.canvas.height,
        scene: serializedScene,
      },
    });
    const updatedRoom = await tx.room.update({
      where: {
        id: room.id,
      },
      data: {
        width: scene.canvas.width,
        height: scene.canvas.height,
        scene: serializedScene,
        latestVersion: nextVersion,
      },
      select: {
        shareId: true,
        name: true,
        latestVersion: true,
      },
    });

    return toRoomPayload(updatedRoom, version);
  });

  if (!payload) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  return NextResponse.json(payload, { status: 201 });
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
