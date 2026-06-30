import { notFound } from "next/navigation";

import { RoomEditor } from "@/components/RoomEditor";
import { prisma } from "@/lib/prisma";
import { parseScene, type RoomPayload } from "@/lib/scene";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    shareId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { shareId } = await params;
  const room = await prisma.room.findUnique({
    where: { shareId },
  });

  if (!room) {
    notFound();
  }

  const payload: RoomPayload = {
    shareId: room.shareId,
    name: room.name,
    width: room.width,
    height: room.height,
    scene: parseScene(room.scene, room.width, room.height),
    updatedAt: room.updatedAt.toISOString(),
  };

  return <RoomEditor initialRoom={payload} />;
}
