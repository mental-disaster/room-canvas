CREATE TABLE IF NOT EXISTS "Room" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "name" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "scene" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Room_shareId_key" ON "Room"("shareId");
