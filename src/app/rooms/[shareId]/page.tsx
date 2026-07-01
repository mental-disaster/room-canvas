import { notFound } from "next/navigation";

import { RoomEditor } from "@/components/RoomEditor";
import { prisma } from "@/lib/prisma";
import { safeVersion, toRoomPayload, type RoomPayload } from "@/lib/scene";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    shareId: string;
  }>;
  searchParams: Promise<{
    version?: string | string[];
  }>;
};

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const { shareId } = await params;
  const { version: versionParam } = await searchParams;
  const requestedVersion = safeVersion(Array.isArray(versionParam) ? versionParam[0] : versionParam);
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
    notFound();
  }

  const version = await prisma.roomVersion.findUnique({
    where: {
      roomId_version: {
        roomId: room.id,
        version: requestedVersion ?? room.latestVersion,
      },
    },
  });

  if (!version) {
    notFound();
  }

  const payload: RoomPayload = toRoomPayload(room, version);

  return <RoomEditor initialRoom={payload} />;
}
