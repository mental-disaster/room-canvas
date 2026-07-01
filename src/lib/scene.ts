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

const MIN_FURNITURE_SIZE = 20;
const MAX_PRISMA_INT = 2_147_483_647;

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
    return normalizeRoomScene(JSON.parse(scene), width, height) ?? createEmptyScene(width, height);
  } catch {
    return createEmptyScene(width, height);
  }
}

export function normalizeRoomScene(
  value: unknown,
  fallbackWidth = 1000,
  fallbackHeight = 700,
  options: { requireCanvasDimensions?: boolean; requireCollections?: boolean } = {},
): RoomScene | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const scene = value as Partial<RoomScene>;

  if (scene.schemaVersion !== 1 || !scene.canvas) {
    return null;
  }

  const requireCollections = Boolean(options.requireCollections);
  const requireCanvasDimensions = Boolean(options.requireCanvasDimensions);
  const hasValidCollections =
    Array.isArray(scene.walls) && Array.isArray(scene.furniture) && Array.isArray(scene.groups);

  if (requireCollections && !hasValidCollections) {
    return null;
  }

  const hasValidCanvasDimensions =
    Number.isFinite(scene.canvas.width) && Number.isFinite(scene.canvas.height);

  if (requireCanvasDimensions && !hasValidCanvasDimensions) {
    return null;
  }

  const walls = normalizeCollection(scene.walls, normalizeWall, requireCollections);
  const furniture = normalizeCollection(
    scene.furniture,
    normalizeFurnitureItem,
    requireCollections,
  );
  const groups = normalizeCollection(scene.groups, normalizeFurnitureGroup, requireCollections);

  if (!walls || !furniture || !groups) {
    return null;
  }

  const uniqueWalls = uniqueById(walls, requireCollections);
  const uniqueFurniture = uniqueById(furniture, requireCollections);
  const uniqueGroups = uniqueById(groups, requireCollections);

  if (!uniqueWalls || !uniqueFurniture || !uniqueGroups) {
    return null;
  }

  const normalizedGroups = normalizeSceneFurnitureGroups(uniqueFurniture, uniqueGroups);

  return {
    schemaVersion: 1,
    canvas: {
      width: safeDimension(scene.canvas.width, fallbackWidth),
      height: safeDimension(scene.canvas.height, fallbackHeight),
      gridSize: safeGridSize(scene.canvas.gridSize),
      snapToGrid: Boolean(scene.canvas.snapToGrid),
    },
    walls: uniqueWalls,
    furniture: normalizedGroups.furniture,
    groups: normalizedGroups.groups,
    meta: scene.meta && typeof scene.meta === "object" ? scene.meta : {},
  };
}

function normalizeCollection<T extends { id: string }>(
  value: unknown,
  normalizeEntry: (entry: unknown) => T | null,
  rejectInvalidEntries: boolean,
): T[] | null {
  if (!Array.isArray(value)) {
    return rejectInvalidEntries ? null : [];
  }

  const entries: T[] = [];

  for (const entry of value) {
    const normalized = normalizeEntry(entry);

    if (!normalized) {
      if (rejectInvalidEntries) {
        return null;
      }

      continue;
    }

    entries.push(normalized);
  }

  return entries;
}

function normalizeWall(value: unknown): Wall | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id, { allowEmpty: false, maxLength: 120 });
  const toolType = value.toolType === "polyline" || value.toolType === "freehand" ? value.toolType : null;
  const points = Array.isArray(value.points) ? value.points.map(normalizePoint) : null;
  const strokeWidth = normalizeFiniteNumber(value.strokeWidth);
  const color = normalizeString(value.color, { allowEmpty: false, maxLength: 80 });

  if (!id || !toolType || !points || points.some((point) => !point) || strokeWidth === null || !color) {
    return null;
  }

  const normalizedPoints = points.filter((point): point is Point => Boolean(point));

  if (normalizedPoints.length < 2) {
    return null;
  }

  return {
    id,
    toolType,
    points: normalizedPoints,
    strokeWidth: Math.round(clampNumber(strokeWidth, 1, 40)),
    color,
  };
}

function normalizeFurnitureItem(value: unknown): FurnitureItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id, { allowEmpty: false, maxLength: 120 });
  const type = value.type === "rect" || value.type === "circle" ? value.type : null;
  const x = normalizeFiniteNumber(value.x);
  const y = normalizeFiniteNumber(value.y);
  const width = normalizeFiniteNumber(value.width);
  const height = normalizeFiniteNumber(value.height);
  const rotation = normalizeFiniteNumber(value.rotation);
  const fill = normalizeString(value.fill, { allowEmpty: false, maxLength: 80 });
  const label = normalizeString(value.label, { allowEmpty: true, maxLength: 32 });
  const groupId =
    value.groupId === undefined
      ? undefined
      : normalizeString(value.groupId, { allowEmpty: false, maxLength: 120 });

  if (
    !id ||
    !type ||
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0 ||
    rotation === null ||
    !fill ||
    label === null ||
    groupId === null
  ) {
    return null;
  }

  return {
    id,
    type,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(MIN_FURNITURE_SIZE, Math.round(width)),
    height: Math.max(MIN_FURNITURE_SIZE, Math.round(height)),
    rotation: normalizeRotationValue(rotation),
    fill,
    label,
    ...(groupId ? { groupId } : {}),
  };
}

function normalizeFurnitureGroup(value: unknown): FurnitureGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id, { allowEmpty: false, maxLength: 120 });
  const name = normalizeString(value.name, { allowEmpty: false, maxLength: 60 });
  const itemIds = Array.isArray(value.itemIds)
    ? value.itemIds.map((itemId) => normalizeString(itemId, { allowEmpty: false, maxLength: 120 }))
    : null;

  if (!id || !name || !itemIds || itemIds.some((itemId) => !itemId)) {
    return null;
  }

  return {
    id,
    name,
    itemIds: itemIds.filter((itemId): itemId is string => Boolean(itemId)),
  };
}

function normalizeSceneFurnitureGroups(
  furniture: FurnitureItem[],
  groups: FurnitureGroup[],
): Pick<RoomScene, "furniture" | "groups"> {
  const furnitureIds = new Set(furniture.map((item) => item.id));
  const itemGroupIds = new Map<string, string>();
  const normalizedGroups: FurnitureGroup[] = [];

  for (const group of groups) {
    const itemIds = group.itemIds.filter(
      (itemId, index, current) =>
        furnitureIds.has(itemId) && current.indexOf(itemId) === index && !itemGroupIds.has(itemId),
    );

    if (itemIds.length < 2) {
      continue;
    }

    for (const itemId of itemIds) {
      itemGroupIds.set(itemId, group.id);
    }

    normalizedGroups.push({ ...group, itemIds });
  }

  return {
    furniture: furniture.map((item) => {
      const groupId = itemGroupIds.get(item.id);

      if (groupId) {
        return item.groupId === groupId ? item : { ...item, groupId };
      }

      if (!item.groupId) {
        return item;
      }

      const itemWithoutGroup = { ...item };
      delete itemWithoutGroup.groupId;
      return itemWithoutGroup;
    }),
    groups: normalizedGroups,
  };
}

function uniqueById<T extends { id: string }>(items: T[], rejectDuplicates: boolean): T[] | null {
  const seen = new Set<string>();
  const uniqueItems: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      if (rejectDuplicates) {
        return null;
      }

      continue;
    }

    seen.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function normalizePoint(value: unknown): Point | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = normalizeFiniteNumber(value.x);
  const y = normalizeFiniteNumber(value.y);

  if (x === null || y === null) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

function normalizeString(
  value: unknown,
  options: { allowEmpty: boolean; maxLength: number },
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!options.allowEmpty && !trimmed) {
    return null;
  }

  if (trimmed.length > options.maxLength) {
    return null;
  }

  return trimmed;
}

function normalizeFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRotationValue(value: number) {
  return Math.round(((value % 360) + 360) % 360);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_PRISMA_INT) {
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
