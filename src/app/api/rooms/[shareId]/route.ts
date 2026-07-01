import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  safeVersion,
  serializeScene,
  toRoomPayload,
  type RoomScene,
} from "@/lib/scene";

type RouteContext = {
  params: Promise<{
    shareId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const requestUrl = new URL(_request.url);
  const requestedVersion = safeVersion(requestUrl.searchParams.get("version"));
  const room = await prisma.room.findUnique({
    where: { shareId },
    select: {
      id: true,
      shareId: true,
      name: true,
      latestVersion: true,
    },
  });

  if (!room) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  const versionNumber = requestedVersion ?? room.latestVersion;
  const version = await prisma.roomVersion.findUnique({
    where: {
      roomId_version: {
        roomId: room.id,
        version: versionNumber,
      },
    },
  });

  if (!version) {
    return NextResponse.json({ message: "Room version not found." }, { status: 404 });
  }

  return NextResponse.json(toRoomPayload(room, version));
}

export async function PUT(request: Request, context: RouteContext) {
  const { shareId } = await context.params;
  const body = await request.json().catch(() => null);

  if (!isRoomScene(body?.scene)) {
    return NextResponse.json({ message: "Invalid scene payload." }, { status: 400 });
  }

  const versionNumber = safeVersion(body.version);

  if (!versionNumber) {
    return NextResponse.json({ message: "Invalid version." }, { status: 400 });
  }

  const existing = await prisma.room.findUnique({
    where: { shareId },
    select: {
      id: true,
      shareId: true,
      name: true,
      latestVersion: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ message: "Room not found." }, { status: 404 });
  }

  const scene = body.scene as RoomScene;
  const serializedScene = serializeScene(scene);
  const version = await prisma.$transaction(async (tx) => {
    const targetVersion = await tx.roomVersion.findUnique({
      where: {
        roomId_version: {
          roomId: existing.id,
          version: versionNumber,
        },
      },
      select: {
        id: true,
      },
    });

    if (!targetVersion) {
      return null;
    }

    const updatedVersion = await tx.roomVersion.update({
      where: {
        id: targetVersion.id,
      },
      data: {
        width: scene.canvas.width,
        height: scene.canvas.height,
        scene: serializedScene,
      },
    });

    if (versionNumber === existing.latestVersion) {
      await tx.room.update({
        where: { id: existing.id },
        data: {
          width: scene.canvas.width,
          height: scene.canvas.height,
          scene: serializedScene,
        },
      });
    }

    return updatedVersion;
  });

  if (!version) {
    return NextResponse.json({ message: "Room version not found." }, { status: 404 });
  }

  return NextResponse.json(toRoomPayload(existing, version));
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
