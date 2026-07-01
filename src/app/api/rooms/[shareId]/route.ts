import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  normalizeRoomScene,
  safeVersion,
  serializeScene,
  toRoomPayload,
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

  const scene = normalizeRoomScene(body?.scene, 1000, 700, {
    requireCanvasDimensions: true,
    requireCollections: true,
  });

  if (!scene) {
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

  if (versionNumber !== existing.latestVersion) {
    return NextResponse.json(
      { message: "Only the latest version can be overwritten. Create a new version instead." },
      { status: 409 },
    );
  }

  const serializedScene = serializeScene(scene);
  const result = await prisma.$transaction(async (tx) => {
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
      return { status: "not-found" as const };
    }

    const updatedRoom = await tx.room.updateMany({
      where: {
        id: existing.id,
        latestVersion: versionNumber,
      },
      data: {
        width: scene.canvas.width,
        height: scene.canvas.height,
        scene: serializedScene,
      },
    });

    if (updatedRoom.count === 0) {
      return { status: "conflict" as const };
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

    return { status: "saved" as const, version: updatedVersion };
  });

  if (result.status === "not-found") {
    return NextResponse.json({ message: "Room version not found." }, { status: 404 });
  }

  if (result.status === "conflict") {
    return NextResponse.json(
      { message: "Only the latest version can be overwritten. Create a new version instead." },
      { status: 409 },
    );
  }

  return NextResponse.json(toRoomPayload(existing, result.version));
}
