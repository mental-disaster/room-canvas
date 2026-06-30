import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createEmptyScene, safeDimension, serializeScene } from "@/lib/scene";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const width = safeDimension(body.width, 1000);
  const height = safeDimension(body.height, 700);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const scene = createEmptyScene(width, height);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shareId = randomBytes(7).toString("base64url");

    try {
      const room = await prisma.room.create({
        data: {
          shareId,
          name,
          width,
          height,
          scene: serializeScene(scene),
        },
        select: {
          shareId: true,
        },
      });

      return NextResponse.json(room, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        continue;
      }

      throw error;
    }
  }

  return NextResponse.json(
    { message: "Could not allocate a share link. Try again." },
    { status: 500 },
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
