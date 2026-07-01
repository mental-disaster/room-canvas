export type Point = {
  x: number;
  y: number;
};

export type WallToolType = "polyline" | "freehand";

export type Wall = {
  id: string;
  toolType: WallToolType;
  points: Point[];
  strokeWidth: number;
  color: string;
};

export type FurnitureType = "rect" | "circle";

export type FurnitureItem = {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  label: string;
  groupId?: string;
};

export type FurnitureGroup = {
  id: string;
  name: string;
  itemIds: string[];
};

export type RoomScene = {
  schemaVersion: 1;
  canvas: {
    width: number;
    height: number;
    gridSize: number;
    snapToGrid: boolean;
  };
  walls: Wall[];
  furniture: FurnitureItem[];
  groups: FurnitureGroup[];
  meta: {
    updatedAt?: string;
  };
};

export type RoomPayload = {
  shareId: string;
  name: string | null;
  width: number;
  height: number;
  scene: RoomScene;
  version: number;
  versionName: string;
  versionMemo: string | null;
  latestVersion: number;
  updatedAt: string;
};

export type RoomVersionSummary = {
  version: number;
  name: string;
  memo: string | null;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  isLatest: boolean;
};

export function createEmptyScene(width: number, height: number): RoomScene {
  return {
    schemaVersion: 1,
    canvas: {
      width,
      height,
      gridSize: 10,
      snapToGrid: true,
    },
    walls: [],
    furniture: [],
    groups: [],
    meta: {},
  };
}

export function parseScene(scene: string, width: number, height: number): RoomScene {
  try {
    const parsed = JSON.parse(scene) as Partial<RoomScene>;

    if (parsed.schemaVersion !== 1 || !parsed.canvas) {
      return createEmptyScene(width, height);
    }

    return {
      schemaVersion: 1,
      canvas: {
        width: safeDimension(parsed.canvas.width, width),
        height: safeDimension(parsed.canvas.height, height),
        gridSize: safeGridSize(parsed.canvas.gridSize),
        snapToGrid: Boolean(parsed.canvas.snapToGrid),
      },
      walls: Array.isArray(parsed.walls) ? parsed.walls : [],
      furniture: Array.isArray(parsed.furniture) ? parsed.furniture : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      meta: parsed.meta ?? {},
    };
  } catch {
    return createEmptyScene(width, height);
  }
}

export function serializeScene(scene: RoomScene): string {
  return JSON.stringify({
    ...scene,
    meta: {
      ...scene.meta,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function toRoomPayload(
  room: {
    shareId: string;
    name: string | null;
    latestVersion: number;
  },
  version: {
    version: number;
    name: string;
    memo: string | null;
    width: number;
    height: number;
    scene: string;
    updatedAt: Date;
  },
): RoomPayload {
  return {
    shareId: room.shareId,
    name: room.name,
    width: version.width,
    height: version.height,
    scene: parseScene(version.scene, version.width, version.height),
    version: version.version,
    versionName: version.name,
    versionMemo: version.memo,
    latestVersion: room.latestVersion,
    updatedAt: version.updatedAt.toISOString(),
  };
}

export function toRoomVersionSummary(
  version: {
    version: number;
    name: string;
    memo: string | null;
    width: number;
    height: number;
    createdAt: Date;
    updatedAt: Date;
  },
  latestVersion: number,
): RoomVersionSummary {
  return {
    version: version.version,
    name: version.name,
    memo: version.memo,
    width: version.width,
    height: version.height,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
    isLatest: version.version === latestVersion,
  };
}

export function safeDimension(value: unknown, fallback: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(8000, Math.max(100, Math.round(numeric)));
}

export function safeVersion(value: unknown): number | null {
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 1) {
    return null;
  }

  return numeric;
}

export function normalizeVersionName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 60) {
    return null;
  }

  return trimmed;
}

export function normalizeVersionMemo(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 500) {
    return undefined;
  }

  return trimmed;
}

function safeGridSize(value: unknown): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 10;
  }

  return Math.min(200, Math.max(2, Math.round(numeric)));
}
