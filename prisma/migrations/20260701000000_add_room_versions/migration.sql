ALTER TABLE "Room" ADD COLUMN "latestVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "RoomVersion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "scene" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RoomVersion" (
    "id",
    "roomId",
    "version",
    "name",
    "memo",
    "width",
    "height",
    "scene",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('version_', "id", '_1'),
    "id",
    1,
    '기본 버전',
    NULL,
    "width",
    "height",
    "scene",
    "createdAt",
    "updatedAt"
FROM "Room";

CREATE UNIQUE INDEX "RoomVersion_roomId_version_key" ON "RoomVersion"("roomId", "version");
CREATE INDEX "RoomVersion_roomId_version_idx" ON "RoomVersion"("roomId", "version");

ALTER TABLE "RoomVersion"
ADD CONSTRAINT "RoomVersion_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
