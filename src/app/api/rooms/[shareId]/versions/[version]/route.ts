import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  normalizeVersionMemo,
  normalizeVersionName,
  safeVersion,
  toRoomVersionSummary,
} from "@/lib/scene";

type RouteContext = {
  params: Promise<{
    shareId: string;
    version: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { shareId, version } = await context.params;
  const versionNumber = safeVersion(version);

  if (!versionNumber) {
    return NextResponse.json({ message: "Invalid version." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = normalizeVersionName(body?.name);
  const memo = normalizeVersionMemo(body?.memo);

  if (!name) {
    return NextResponse.json({ message: "Version name is required." }, { status: 400 });
  }

  if (memo === undefined) {
    return NextResponse.json({ message: "Invalid version memo." }, { status: 400 });
  }

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

  const existing = await prisma.roomVersion.findUnique({
    where: {
      roomId_version: {
        roomId: room.id,
        version: versionNumber,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ message: "Room version not found." }, { status: 404 });
  }

  const updatedVersion = await prisma.roomVersion.update({
    where: {
      id: existing.id,
    },
    data: {
      name,
      memo,
    },
  });

  return NextResponse.json({
    version: toRoomVersionSummary(updatedVersion, room.latestVersion),
  });
}
