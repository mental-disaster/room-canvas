"use client";

import Konva from "konva";
import type { Node as KonvaNode } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Image as KonvaImageNode } from "konva/lib/shapes/Image";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";
import {
  Circle,
  Group as KonvaGroup,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import {
  Check,
  CircleIcon,
  Copy,
  Download,
  Group,
  Hand,
  History,
  ImagePlus,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Settings,
  Square,
  Trash2,
  Ungroup,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import type {
  FurnitureGroup,
  FurnitureItem,
  Point,
  RoomPayload,
  RoomScene,
  RoomVersionSummary,
  WallToolType,
} from "@/lib/scene";

type Tool = "select" | "pan" | "wall-line" | "wall-freehand" | "rect" | "circle";
type SaveState = "idle" | "saving" | "saved" | "error";
type ExportState = "idle" | "exporting" | "error";
type VersionListState = "idle" | "loading" | "error";
type VersionActionState = "idle" | "creating" | "switching" | "updating";
type MobilePanelTab = "canvas" | "blueprint" | "selection";
type HistoryState = {
  past: RoomScene[];
  future: RoomScene[];
};
type BlueprintPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};
type PanStart = {
  pointerId: number;
  x: number;
  y: number;
  offset: Point;
  hasMoved: boolean;
  clearSelectionOnClick: boolean;
};
type PinchStart = {
  distance: number;
  center: Point;
  zoom: number;
  offset: Point;
};

const FURNITURE_COLORS = ["#d8eef2", "#f7d7cc", "#e9e1f5", "#dfead2", "#f3e2b8", "#dce3ee"];
const WALL_COLOR = "#26313f";
const MIN_SHAPE_SIZE = 20;
const MAX_GRID_LINES = 900;
const EXPORT_MAX_LONG_EDGE = 4096;
const EXPORT_MAX_PIXEL_RATIO = 2;

export function RoomEditor({ initialRoom }: { initialRoom: RoomPayload }) {
  const [scene, setScene] = useState(initialRoom.scene);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentWallPoints, setCurrentWallPoints] = useState<Point[]>([]);
  const [isLineDrawing, setIsLineDrawing] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
  const [isFreehandDrawing, setIsFreehandDrawing] = useState(false);
  const [wallStrokeWidth, setWallStrokeWidth] = useState(3);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffsetState] = useState<Point>({ x: 0, y: 0 });
  const [blueprintUrl, setBlueprintUrl] = useState<string | null>(null);
  const [blueprintImage, setBlueprintImage] = useState<HTMLImageElement | null>(null);
  const [blueprintPlacement, setBlueprintPlacement] = useState<BlueprintPlacement>({
    x: 0,
    y: 0,
    width: initialRoom.scene.canvas.width,
    height: initialRoom.scene.canvas.height,
    rotation: 0,
  });
  const [blueprintOpacity, setBlueprintOpacity] = useState(0.45);
  const [isBlueprintEditing, setIsBlueprintEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [updatedAt, setUpdatedAt] = useState(initialRoom.updatedAt);
  const [currentVersion, setCurrentVersion] = useState(initialRoom.version);
  const [latestVersion, setLatestVersion] = useState(initialRoom.latestVersion);
  const [versionName, setVersionName] = useState(initialRoom.versionName);
  const [versionMemo, setVersionMemo] = useState(initialRoom.versionMemo);
  const [versions, setVersions] = useState<RoomVersionSummary[]>([]);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [versionListState, setVersionListState] = useState<VersionListState>("idle");
  const [versionActionState, setVersionActionState] = useState<VersionActionState>("idle");
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<MobilePanelTab>("canvas");

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage>(null);
  const sceneRef = useRef(initialRoom.scene);
  const historyRef = useRef<HistoryState>({ past: [], future: [] });
  const canvasSizeRef = useRef({
    width: initialRoom.scene.canvas.width,
    height: initialRoom.scene.canvas.height,
  });
  const currentWallPointsRef = useRef<Point[]>([]);
  const freehandPointsRef = useRef<Point[]>([]);
  const isLineDrawingRef = useRef(false);
  const isFreehandDrawingRef = useRef(false);
  const finishLineDrawingRef = useRef<() => void>(() => undefined);
  const finishFreehandDrawingRef = useRef<() => void>(() => undefined);
  const toolRef = useRef<Tool>("select");
  const zoomRef = useRef(1);
  const canvasOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const didCenterInitialCanvasRef = useRef(false);
  const wallStrokeWidthRef = useRef(3);
  const gridSizeRef = useRef(initialRoom.scene.canvas.gridSize);
  const snapToGridRef = useRef(initialRoom.scene.canvas.snapToGrid);
  const transformerRef = useRef<KonvaTransformer>(null);
  const blueprintRef = useRef<KonvaImageNode>(null);
  const blueprintTransformerRef = useRef<KonvaTransformer>(null);
  const shapeRefs = useRef<Record<string, KonvaNode | null>>({});
  const dragStartRef = useRef<{
    itemId: string;
    ids: string[];
    positions: Record<string, Point>;
  } | null>(null);
  const panStartRef = useRef<PanStart | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const pinchStartRef = useRef<PinchStart | null>(null);

  const selectedItems = useMemo(
    () => scene.furniture.filter((item) => selectedIds.includes(item.id)),
    [scene.furniture, selectedIds],
  );
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const selectedGroups = useMemo(
    () =>
      scene.groups.filter((group) =>
        group.itemIds.some((itemId) => selectedIds.includes(itemId)),
      ),
    [scene.groups, selectedIds],
  );
  const stagePixelWidth = scene.canvas.width * zoom;
  const stagePixelHeight = scene.canvas.height * zoom;
  const isPanningMode = tool === "pan" || isSpacePressed;
  const canBlankPan = tool === "select" || isPanningMode;
  const zoomPercent = Math.round(zoom * 100);
  const hasUnsavedChanges = saveState === "idle" || saveState === "error";
  const isHistoricalVersion = currentVersion < latestVersion;

  useEffect(() => {
    canvasSizeRef.current = {
      width: scene.canvas.width,
      height: scene.canvas.height,
    };
    currentWallPointsRef.current = currentWallPoints;
    freehandPointsRef.current = freehandPoints;
    isLineDrawingRef.current = isLineDrawing;
    isFreehandDrawingRef.current = isFreehandDrawing;
    toolRef.current = tool;
    zoomRef.current = zoom;
    canvasOffsetRef.current = canvasOffset;
    wallStrokeWidthRef.current = wallStrokeWidth;
    gridSizeRef.current = scene.canvas.gridSize;
    snapToGridRef.current = scene.canvas.snapToGrid;
  }, [
    currentWallPoints,
    freehandPoints,
    isFreehandDrawing,
    isLineDrawing,
    scene.canvas.gridSize,
    scene.canvas.height,
    scene.canvas.snapToGrid,
    scene.canvas.width,
    tool,
    wallStrokeWidth,
    zoom,
    canvasOffset,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    const currentUrl = window.location.href;
    function handlePopState() {
      if (window.confirm("저장하지 않은 변경사항이 사라집니다. 이동할까요?")) {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.location.reload();
        return;
      }

      window.history.pushState(null, "", currentUrl);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedChanges]);

  const commitScene = useCallback((updater: RoomScene | ((current: RoomScene) => RoomScene)) => {
    const current = sceneRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;

    if (next === current) {
      return;
    }

    const nextHistory: HistoryState = {
      past: [...historyRef.current.past.slice(-59), current],
      future: [],
    };

    sceneRef.current = next;
    historyRef.current = nextHistory;
    setScene(next);
    setHistory(nextHistory);
    setSaveState("idle");
  }, []);

  const loadVersions = useCallback(async () => {
    setVersionListState("loading");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}/versions`);

      if (!response.ok) {
        throw new Error("Version list failed");
      }

      const payload = (await response.json()) as { versions: RoomVersionSummary[] };
      const latest = payload.versions.find((version) => version.isLatest);

      setVersions(payload.versions);
      if (latest) {
        setLatestVersion(latest.version);
      }
      setVersionListState("idle");
    } catch {
      setVersionListState("error");
    }
  }, [initialRoom.shareId]);

  function clearInProgressDrawing() {
    setCurrentWallPoints([]);
    currentWallPointsRef.current = [];
    setIsLineDrawing(false);
    isLineDrawingRef.current = false;
    setFreehandPoints([]);
    freehandPointsRef.current = [];
    setIsFreehandDrawing(false);
    isFreehandDrawingRef.current = false;
  }

  function setCanvasOffset(nextOffset: Point | ((current: Point) => Point)) {
    setCanvasOffsetState((current) => {
      const next = typeof nextOffset === "function" ? nextOffset(current) : nextOffset;
      canvasOffsetRef.current = next;
      return next;
    });
  }

  function centerCanvasInViewport(targetScene: RoomScene, targetZoom = zoomRef.current) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const isMobileViewport = viewport.clientWidth < 1024;
    const nextZoom = isMobileViewport
      ? calculateFitZoom(targetScene, viewport.clientWidth, viewport.clientHeight)
      : targetZoom;

    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setCanvasOffset({
      x: Math.round((viewport.clientWidth - targetScene.canvas.width * nextZoom) / 2),
      y: Math.round((viewport.clientHeight - targetScene.canvas.height * nextZoom) / 2),
    });
  }

  function fitCanvasToViewport() {
    centerCanvasInViewport(scene);
  }

  function applyRoomPayload(payload: RoomPayload, options: { centerCanvas?: boolean } = {}) {
    const emptyHistory: HistoryState = { past: [], future: [] };

    sceneRef.current = payload.scene;
    historyRef.current = emptyHistory;
    setScene(payload.scene);
    setUpdatedAt(payload.updatedAt);
    setCurrentVersion(payload.version);
    setLatestVersion(payload.latestVersion);
    setVersionName(payload.versionName);
    setVersionMemo(payload.versionMemo);
    setHistory(emptyHistory);
    setSelectedIds([]);
    clearInProgressDrawing();
    setSaveState("saved");

    if (options.centerCanvas) {
      requestAnimationFrame(() => centerCanvasInViewport(payload.scene));
    }
  }

  function pushVersionUrl(version: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("version", String(version));
    window.history.pushState(null, "", url);
  }

  function openVersionPanel() {
    setIsVersionPanelOpen(true);
    void loadVersions();
  }

  function openMobilePanel(tab: MobilePanelTab) {
    setMobilePanelTab(tab);
    setIsMobilePanelOpen(true);
  }

  useEffect(() => {
    if (didCenterInitialCanvasRef.current) {
      return;
    }

    didCenterInitialCanvasRef.current = true;
    const animationFrame = requestAnimationFrame(() => centerCanvasInViewport(scene));

    return () => cancelAnimationFrame(animationFrame);
  });

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      return;
    }

    commitScene((current) => {
      const selected = new Set(selectedIds);
      const furniture = current.furniture.filter((item) => !selected.has(item.id));
      const groups = current.groups.map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !selected.has(itemId)),
      }));
      const normalized = normalizeFurnitureGroups(furniture, groups);

      return {
        ...current,
        furniture: normalized.furniture,
        groups: normalized.groups,
      };
    });
    setSelectedIds([]);
  }, [commitScene, selectedIds]);

  const undo = useCallback(() => {
    const currentHistory = historyRef.current;
    const previous = currentHistory.past.at(-1);

    if (!previous) {
      return;
    }

    const currentScene = sceneRef.current;
    const nextHistory: HistoryState = {
      past: currentHistory.past.slice(0, -1),
      future: [currentScene, ...currentHistory.future],
    };

    sceneRef.current = previous;
    historyRef.current = nextHistory;
    setScene(previous);
    setHistory(nextHistory);
    setSelectedIds([]);
    setSaveState("idle");
  }, []);

  const redo = useCallback(() => {
    const currentHistory = historyRef.current;
    const next = currentHistory.future[0];

    if (!next) {
      return;
    }

    const currentScene = sceneRef.current;
    const nextHistory: HistoryState = {
      past: [...currentHistory.past, currentScene],
      future: currentHistory.future.slice(1),
    };

    sceneRef.current = next;
    historyRef.current = nextHistory;
    setScene(next);
    setHistory(nextHistory);
    setSelectedIds([]);
    setSaveState("idle");
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    const nodes = selectedIds
      .map((id) => shapeRefs.current[id])
      .filter((node): node is KonvaNode => Boolean(node));

    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [scene.furniture, selectedIds]);

  useEffect(() => {
    const transformer = blueprintTransformerRef.current;
    const imageNode = blueprintRef.current;

    if (!transformer) {
      return;
    }

    transformer.nodes(isBlueprintEditing && imageNode ? [imageNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [blueprintImage, blueprintPlacement, isBlueprintEditing]);

  useEffect(() => {
    if (!blueprintUrl) {
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      const canvasSize = canvasSizeRef.current;
      setBlueprintPlacement(fitInsideCanvas(image.width, image.height, canvasSize.width, canvasSize.height));
      setBlueprintImage(image);
      setIsBlueprintEditing(true);
      setSelectedIds([]);
      setTool("select");
    };
    image.src = blueprintUrl;

    return () => {
      image.onload = null;
    };
  }, [blueprintUrl]);

  useEffect(() => {
    return () => {
      if (blueprintUrl) {
        URL.revokeObjectURL(blueprintUrl);
      }
    };
  }, [blueprintUrl]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePressed(true);
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }

      if (event.key === "Escape") {
        setCurrentWallPoints([]);
        currentWallPointsRef.current = [];
        setIsLineDrawing(false);
        isLineDrawingRef.current = false;
        setFreehandPoints([]);
        freehandPointsRef.current = [];
        setIsFreehandDrawing(false);
        isFreehandDrawingRef.current = false;
        setTool("select");
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [deleteSelected, redo, undo]);

  const gridLines = useMemo(() => {
    const lines: ReactElement[] = [];
    let step = Math.max(1, scene.canvas.gridSize);

    while (
      Math.floor(scene.canvas.width / step) + Math.floor(scene.canvas.height / step) + 2 > MAX_GRID_LINES
    ) {
      step *= 5;
    }
    const majorStep = step * 5;

    for (let x = 0; x <= scene.canvas.width; x += step) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, scene.canvas.height]}
          stroke={x % majorStep === 0 ? "#c8ced8" : "#e7ebf0"}
          strokeWidth={1}
          listening={false}
        />,
      );
    }

    for (let y = 0; y <= scene.canvas.height; y += step) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, scene.canvas.width, y]}
          stroke={y % majorStep === 0 ? "#c8ced8" : "#e7ebf0"}
          strokeWidth={1}
          listening={false}
        />,
      );
    }

    return lines;
  }, [scene.canvas.gridSize, scene.canvas.height, scene.canvas.width]);

  function setActiveTool(nextTool: Tool) {
    setTool(nextTool);
    setCurrentWallPoints([]);
    currentWallPointsRef.current = [];
    setIsLineDrawing(false);
    isLineDrawingRef.current = false;
    setFreehandPoints([]);
    freehandPointsRef.current = [];
    setIsFreehandDrawing(false);
    isFreehandDrawingRef.current = false;

    if (nextTool !== "select") {
      setSelectedIds([]);
    }
  }

  function getPointerPoint(): Point | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (!stage || !pointer) {
      return null;
    }

    return {
      x: clamp(pointer.x / zoom, 0, scene.canvas.width),
      y: clamp(pointer.y / zoom, 0, scene.canvas.height),
    };
  }

  function pointForTool(point: Point) {
    return scene.canvas.snapToGrid && tool !== "wall-freehand" ? snapPoint(point, scene.canvas.gridSize) : point;
  }

  function handleStagePointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (isPanningMode) {
      return;
    }

    const clickedStage = event.target === event.target.getStage();
    const point = getPointerPoint();

    if (!point || !clickedStage) {
      return;
    }

    if (tool === "select") {
      event.evt.preventDefault();
      event.evt.stopPropagation();
      updateActivePointer(event.evt.pointerId, event.evt.clientX, event.evt.clientY);

      if (activePointersRef.current.size >= 2) {
        startPinchIfReady();
        return;
      }

      beginCanvasPan(event.evt.pointerId, event.evt.clientX, event.evt.clientY, true);
      return;
    }

    if (tool === "rect" || tool === "circle") {
      addFurniture(tool, pointForTool(point));
      return;
    }

    if (tool === "wall-line") {
      const start = pointForTool(point);
      currentWallPointsRef.current = [start, start];
      setIsLineDrawing(true);
      isLineDrawingRef.current = true;
      setCurrentWallPoints([start, start]);
      return;
    }

    if (tool === "wall-freehand") {
      freehandPointsRef.current = [point];
      setIsFreehandDrawing(true);
      isFreehandDrawingRef.current = true;
      setFreehandPoints([point]);
    }
  }

  function handleStagePointerMove(event: Konva.KonvaEventObject<PointerEvent>) {
    if (pinchStartRef.current) {
      updateActivePointer(event.evt.pointerId, event.evt.clientX, event.evt.clientY);
      updatePinchGesture();
      return;
    }

    if (panStartRef.current) {
      return;
    }

    if (isLineDrawing && tool === "wall-line") {
      const point = getPointerPoint();

      if (!point) {
        return;
      }

      setCurrentWallPoints((points) => {
        const start = points[0] ?? pointForTool(point);
        const next = [start, pointForTool(point)];
        currentWallPointsRef.current = next;
        return next;
      });
      return;
    }

    if (!isFreehandDrawing || tool !== "wall-freehand") {
      return;
    }

    const point = getPointerPoint();

    if (!point) {
      return;
    }

    setFreehandPoints((points) => {
      const next = [...points, point];
      freehandPointsRef.current = next;
      return next;
    });
  }

  function handleStagePointerUp(event: Konva.KonvaEventObject<PointerEvent>) {
    removeActivePointer(event.evt.pointerId);

    if (pinchStartRef.current) {
      return;
    }

    if (panStartRef.current) {
      return;
    }

    if (isLineDrawing && tool === "wall-line") {
      finishLineDrawing();
      return;
    }

    if (!isFreehandDrawing || tool !== "wall-freehand") {
      return;
    }

    finishFreehandDrawing();
  }

  function finishLineDrawing() {
    const points = currentWallPointsRef.current;

    setIsLineDrawing(false);
    isLineDrawingRef.current = false;

    if (points.length === 2 && distance(points[0], points[1]) >= 4) {
      addWall("polyline", points);
    }

    currentWallPointsRef.current = [];
    setCurrentWallPoints([]);
  }

  function finishFreehandDrawing() {
    const points = freehandPointsRef.current;

    setIsFreehandDrawing(false);
    isFreehandDrawingRef.current = false;

    if (points.length > 1) {
      addWall("freehand", points);
    }

    freehandPointsRef.current = [];
    setFreehandPoints([]);
  }

  function addWall(toolType: WallToolType, points: Point[]) {
    if (points.length < 2) {
      return;
    }

    commitScene((current) => ({
      ...current,
      walls: [
        ...current.walls,
        {
          id: createId("wall"),
          toolType,
          points,
          strokeWidth: wallStrokeWidthRef.current,
          color: WALL_COLOR,
        },
      ],
    }));
  }

  function addFurniture(kind: "rect" | "circle", point: Point) {
    const width = kind === "rect" ? 140 : 96;
    const height = kind === "rect" ? 90 : 96;
    const id = createId(kind);
    const nextItem: FurnitureItem = {
      id,
      type: kind,
      x: clamp(point.x - width / 2, 0, scene.canvas.width - width),
      y: clamp(point.y - height / 2, 0, scene.canvas.height - height),
      width,
      height,
      rotation: 0,
      fill: FURNITURE_COLORS[scene.furniture.length % FURNITURE_COLORS.length],
      label: kind === "rect" ? "가구" : "원형 가구",
    };

    commitScene((current) => ({
      ...current,
      furniture: [...current.furniture, nextItem],
    }));
    setSelectedIds([id]);
    setTool("select");
  }

  function selectFurniture(item: FurnitureItem, event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    event.cancelBubble = true;

    if (tool !== "select") {
      return;
    }

    const group = item.groupId ? scene.groups.find((candidate) => candidate.id === item.groupId) : null;
    const ids = group ? group.itemIds : [item.id];
    const nativeEvent = event.evt as MouseEvent | TouchEvent;

    if (nativeEvent.shiftKey || nativeEvent.ctrlKey || nativeEvent.metaKey) {
      setSelectedIds((current) => mergeSelection(current, ids));
    } else {
      setSelectedIds(ids);
    }
  }

  function handleDragStart(item: FurnitureItem) {
    const group = item.groupId ? scene.groups.find((candidate) => candidate.id === item.groupId) : null;
    const groupIds = group ? group.itemIds : [item.id];
    const ids = selectedIds.includes(item.id) ? selectedIds : groupIds;

    if (!selectedIds.includes(item.id) && group) {
      setSelectedIds(groupIds);
    }

    dragStartRef.current = {
      itemId: item.id,
      ids,
      positions: Object.fromEntries(
        scene.furniture
          .filter((candidate) => ids.includes(candidate.id))
          .map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]),
      ),
    };
  }

  function handleDragMove(item: FurnitureItem, event: Konva.KonvaEventObject<DragEvent>) {
    const dragState = dragStartRef.current;

    if (!dragState || dragState.itemId !== item.id || dragState.ids.length < 2) {
      return;
    }

    const start = dragState.positions[item.id];
    const currentTopLeft = topLeftFromNode(event.target);
    const rawDelta = {
      x: currentTopLeft.x - start.x,
      y: currentTopLeft.y - start.y,
    };
    const delta = clampFurnitureDragDelta(
      dragState.ids,
      dragState.positions,
      scene.furniture,
      rawDelta,
      scene.canvas,
    );

    setNodeTopLeft(event.target, {
      x: start.x + delta.x,
      y: start.y + delta.y,
    });

    for (const id of dragState.ids) {
      if (id === item.id) {
        continue;
      }

      const node = shapeRefs.current[id];
      const targetStart = dragState.positions[id];

      if (!node || !targetStart) {
        continue;
      }

      setNodeTopLeft(node, {
        x: targetStart.x + delta.x,
        y: targetStart.y + delta.y,
      });
    }
  }

  function handleDragEnd(item: FurnitureItem, event: Konva.KonvaEventObject<DragEvent>) {
    const dragState = dragStartRef.current;
    const rawTopLeft = topLeftFromNode(event.target);
    const ids = dragState?.ids ?? [item.id];
    const positions = dragState?.positions ?? { [item.id]: { x: item.x, y: item.y } };

    dragStartRef.current = null;

    commitScene((current) => {
      const start = positions[item.id] ?? { x: item.x, y: item.y };
      const nextTopLeft = current.canvas.snapToGrid ? snapPoint(rawTopLeft, current.canvas.gridSize) : rawTopLeft;
      const rawDelta = {
        x: nextTopLeft.x - start.x,
        y: nextTopLeft.y - start.y,
      };
      const delta = clampFurnitureDragDelta(ids, positions, current.furniture, rawDelta, current.canvas);

      return {
        ...current,
        furniture: current.furniture.map((candidate) => {
          if (!ids.includes(candidate.id)) {
            return candidate;
          }

          const origin = positions[candidate.id] ?? { x: candidate.x, y: candidate.y };

          return {
            ...candidate,
            x: origin.x + delta.x,
            y: origin.y + delta.y,
          };
        }),
      };
    });
  }

  function handleTransformEnd(item: FurnitureItem, event: Konva.KonvaEventObject<Event>) {
    const node = event.target;
    const scaleX = Math.abs(node.scaleX());
    const scaleY = Math.abs(node.scaleY());
    const rotation = normalizeRotation(node.rotation());
    const position = clampNodeBoundsToCanvas(node, scene.canvas);

    node.scaleX(1);
    node.scaleY(1);

    if (item.type === "circle") {
      const diameter = Math.max(MIN_SHAPE_SIZE, Math.round(item.width * Math.max(scaleX, scaleY)));

      commitScene((current) => ({
        ...current,
        furniture: current.furniture.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                x: position.x,
                y: position.y,
                width: diameter,
                height: diameter,
                rotation,
              }
            : candidate,
        ),
      }));
      return;
    }

    const width = Math.max(MIN_SHAPE_SIZE, Math.round(item.width * scaleX));
    const height = Math.max(MIN_SHAPE_SIZE, Math.round(item.height * scaleY));

    commitScene((current) => ({
      ...current,
      furniture: current.furniture.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              x: position.x,
              y: position.y,
              width,
              height,
              rotation,
            }
          : candidate,
      ),
    }));
  }

  function updateItem(id: string, patch: Partial<FurnitureItem>) {
    commitScene((current) => ({
      ...current,
      furniture: current.furniture.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function updateCanvas(patch: Partial<RoomScene["canvas"]>) {
    commitScene((current) => ({
      ...current,
      canvas: {
        ...current.canvas,
        ...patch,
      },
    }));
  }

  function groupSelected() {
    if (selectedIds.length < 2) {
      return;
    }

    const id = createId("group");

    commitScene((current) => {
      const selected = new Set(selectedIds);
      const furniture = current.furniture.map((item) =>
        selected.has(item.id) ? { ...item, groupId: id } : item,
      );
      const groups = [
        ...current.groups.map((group) => ({
          ...group,
          itemIds: group.itemIds.filter((itemId) => !selected.has(itemId)),
        })),
        {
          id,
          name: `그룹 ${current.groups.length + 1}`,
          itemIds: [...selectedIds],
        },
      ];
      const normalized = normalizeFurnitureGroups(furniture, groups);

      return {
        ...current,
        furniture: normalized.furniture,
        groups: normalized.groups,
      };
    });
  }

  function ungroupSelected() {
    if (selectedGroups.length === 0) {
      return;
    }

    const groupIds = new Set(selectedGroups.map((group) => group.id));

    commitScene((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        item.groupId && groupIds.has(item.groupId) ? { ...item, groupId: undefined } : item,
      ),
      groups: current.groups.filter((group) => !groupIds.has(group.id)),
    }));
  }

  async function saveRoom() {
    if (isHistoricalVersion) {
      openVersionPanel();
      return;
    }

    setSaveState("saving");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: currentVersion, scene }),
      });

      if (response.status === 409) {
        await loadVersions();
        setSaveState("idle");
        setIsVersionPanelOpen(true);
        return;
      }

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const payload = (await response.json()) as RoomPayload;
      applyRoomPayload(payload);
      await loadVersions();
    } catch {
      setSaveState("error");
    }
  }

  async function openVersion(version: number) {
    if (version === currentVersion) {
      setIsVersionPanelOpen(false);
      return;
    }

    if (
      hasUnsavedChanges &&
      !window.confirm("저장하지 않은 변경사항이 사라집니다. 다른 버전을 열까요?")
    ) {
      return;
    }

    setVersionActionState("switching");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}?version=${version}`);

      if (!response.ok) {
        throw new Error("Version open failed");
      }

      const payload = (await response.json()) as RoomPayload;
      applyRoomPayload(payload, { centerCanvas: true });
      pushVersionUrl(payload.version);
      setVersionListState("idle");
      setIsVersionPanelOpen(false);
    } catch {
      setVersionListState("error");
    } finally {
      setVersionActionState("idle");
    }
  }

  async function createVersion(name: string, memo: string) {
    setVersionActionState("creating");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, memo, scene }),
      });

      if (!response.ok) {
        throw new Error("Version creation failed");
      }

      const payload = (await response.json()) as RoomPayload;
      applyRoomPayload(payload);
      pushVersionUrl(payload.version);
      await loadVersions();
    } catch {
      setVersionListState("error");
    } finally {
      setVersionActionState("idle");
    }
  }

  async function updateVersionMeta(version: number, name: string, memo: string) {
    setVersionActionState("updating");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}/versions/${version}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, memo }),
      });

      if (!response.ok) {
        throw new Error("Version update failed");
      }

      const payload = (await response.json()) as { version: RoomVersionSummary };
      setVersions((current) =>
        current.map((candidate) =>
          candidate.version === payload.version.version ? payload.version : candidate,
        ),
      );
      setVersionListState("idle");

      if (payload.version.version === currentVersion) {
        setVersionName(payload.version.name);
        setVersionMemo(payload.version.memo);
        setUpdatedAt(payload.version.updatedAt);
      }
    } catch {
      setVersionListState("error");
    } finally {
      setVersionActionState("idle");
    }
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
  }

  async function exportRoomImage() {
    if (exportState === "exporting") {
      return;
    }

    setExportState("exporting");

    try {
      const blob = await createRoomImageBlob({
        scene,
        blueprintImage,
        blueprintPlacement,
        blueprintOpacity,
      });
      const filename = createExportFileName(initialRoom.name, currentVersion);

      downloadBlob(blob, filename);
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  }

  function handleBlueprintUpload(file: File | null) {
    if (!file) {
      return;
    }

    const nextUrl = URL.createObjectURL(file);

    if (blueprintUrl) {
      URL.revokeObjectURL(blueprintUrl);
    }

    setBlueprintUrl(nextUrl);
  }

  function updateBlueprintPlacement(patch: Partial<BlueprintPlacement>) {
    setBlueprintPlacement((current) => ({
      ...current,
      ...patch,
    }));
  }

  function fitBlueprintToCanvas() {
    setBlueprintPlacement({
      x: 0,
      y: 0,
      width: scene.canvas.width,
      height: scene.canvas.height,
      rotation: 0,
    });
  }

  function fitBlueprintWithRatio() {
    if (!blueprintImage) {
      return;
    }

    setBlueprintPlacement(fitInsideCanvas(blueprintImage.width, blueprintImage.height, scene.canvas.width, scene.canvas.height));
  }

  function handleBlueprintTransformEnd(event: Konva.KonvaEventObject<Event>) {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    node.scaleX(1);
    node.scaleY(1);

    setBlueprintPlacement({
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(10, Math.round(blueprintPlacement.width * scaleX)),
      height: Math.max(10, Math.round(blueprintPlacement.height * scaleY)),
      rotation: normalizeRotation(node.rotation()),
    });
  }

  function updateActivePointer(pointerId: number, clientX: number, clientY: number) {
    const point = viewportPointFromClient(clientX, clientY);

    if (!point) {
      return;
    }

    activePointersRef.current.set(pointerId, point);
  }

  function removeActivePointer(pointerId: number) {
    activePointersRef.current.delete(pointerId);

    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
  }

  function getPrimaryTouchPair(): [Point, Point] | null {
    const points = Array.from(activePointersRef.current.values());

    if (points.length < 2) {
      return null;
    }

    return [points[0], points[1]];
  }

  function startPinchIfReady() {
    const pair = getPrimaryTouchPair();

    if (!pair) {
      return false;
    }

    const [first, second] = pair;
    const center = midpoint(first, second);
    const distanceBetweenPointers = distance(first, second);

    if (distanceBetweenPointers <= 0) {
      return false;
    }

    clearInProgressDrawing();
    panStartRef.current = null;
    pinchStartRef.current = {
      distance: distanceBetweenPointers,
      center,
      zoom: zoomRef.current,
      offset: canvasOffsetRef.current,
    };

    return true;
  }

  function updatePinchGesture() {
    const pinchStart = pinchStartRef.current;
    const pair = getPrimaryTouchPair();

    if (!pinchStart || !pair) {
      return false;
    }

    const [first, second] = pair;
    const center = midpoint(first, second);
    const nextZoom = clamp(
      pinchStart.zoom * (distance(first, second) / pinchStart.distance),
      0.25,
      3,
    );
    const anchorX = (pinchStart.center.x - pinchStart.offset.x) / pinchStart.zoom;
    const anchorY = (pinchStart.center.y - pinchStart.offset.y) / pinchStart.zoom;
    const nextOffset = {
      x: center.x - anchorX * nextZoom,
      y: center.y - anchorY * nextZoom,
    };

    zoomRef.current = nextZoom;
    canvasOffsetRef.current = nextOffset;
    setZoom(nextZoom);
    setCanvasOffsetState(nextOffset);
    return true;
  }

  function beginCanvasPan(
    pointerId: number,
    clientX: number,
    clientY: number,
    clearSelectionOnClick: boolean,
  ) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    try {
      if (!viewport.hasPointerCapture(pointerId)) {
        viewport.setPointerCapture(pointerId);
      }
    } catch {
      // Pointer capture can fail if the browser has already released this pointer.
    }

    panStartRef.current = {
      pointerId,
      x: clientX,
      y: clientY,
      offset: canvasOffsetRef.current,
      hasMoved: false,
      clearSelectionOnClick,
    };
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    if (isCanvasUiTarget(event.target)) {
      return;
    }

    updateActivePointer(event.pointerId, event.clientX, event.clientY);

    if (activePointersRef.current.size >= 2) {
      event.preventDefault();
      startPinchIfReady();
      return;
    }

    const stageShell = viewport.querySelector(".stage-shell");
    const target = event.target;
    const isInsideStage = target instanceof Node && stageShell?.contains(target);
    const shouldPan = isPanningMode || (tool === "select" && !isInsideStage);

    if (!shouldPan) {
      return;
    }

    event.preventDefault();
    beginCanvasPan(event.pointerId, event.clientX, event.clientY, tool === "select");
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panStartRef.current && !pinchStartRef.current && isCanvasUiTarget(event.target)) {
      return;
    }

    updateActivePointer(event.pointerId, event.clientX, event.clientY);

    if (pinchStartRef.current) {
      event.preventDefault();
      updatePinchGesture();
      return;
    }

    const panStart = panStartRef.current;

    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panStart.x;
    const deltaY = event.clientY - panStart.y;
    const hasMoved = panStart.hasMoved || Math.hypot(deltaX, deltaY) >= 4;

    panStartRef.current = {
      ...panStart,
      hasMoved,
    };

    if (!hasMoved) {
      return;
    }

    event.preventDefault();
    setCanvasOffset({
      x: panStart.offset.x + deltaX,
      y: panStart.offset.y + deltaY,
    });
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const panStart = panStartRef.current;
    const viewport = viewportRef.current;

    removeActivePointer(event.pointerId);

    if (!panStart || !viewport || panStart.pointerId !== event.pointerId) {
      return;
    }

    try {
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore late pointer cleanup after the pointer was released by the browser.
    }

    if (panStart.clearSelectionOnClick && !panStart.hasMoved) {
      setSelectedIds([]);
    }

    panStartRef.current = null;
  }

  function viewportPointFromClient(clientX: number, clientY: number): Point | null {
    const viewport = viewportRef.current;

    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function viewportCenterPoint(): Point | null {
    const viewport = viewportRef.current;

    if (!viewport) {
      return null;
    }

    return {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
    };
  }

  function setZoomAtViewportPoint(nextZoom: number, viewportPoint: Point | null) {
    const previousZoom = zoomRef.current;
    const clampedZoom = clamp(nextZoom, 0.25, 3);

    if (!viewportPoint || clampedZoom === previousZoom) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }

    const offset = canvasOffsetRef.current;
    const anchorX = (viewportPoint.x - offset.x) / previousZoom;
    const anchorY = (viewportPoint.y - offset.y) / previousZoom;
    const nextOffset = {
      x: viewportPoint.x - anchorX * clampedZoom,
      y: viewportPoint.y - anchorY * clampedZoom,
    };

    zoomRef.current = clampedZoom;
    canvasOffsetRef.current = nextOffset;
    setZoom(clampedZoom);
    setCanvasOffsetState(nextOffset);
  }

  function handleNativeViewportWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey) {
      const previousZoom = zoomRef.current;
      const previousPercent = Math.round(previousZoom * 100);
      const roundedPercent = Math.round(previousPercent / 10) * 10;
      const nextPercent = clamp(roundedPercent + (event.deltaY > 0 ? -10 : 10), 25, 300);
      setZoomAtViewportPoint(nextPercent / 100, viewportPointFromClient(event.clientX, event.clientY));
      return;
    }

    setCanvasOffset((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }

  function setZoomPercent(value: number) {
    setZoomAtViewportPoint(clamp(value, 25, 300) / 100, viewportCenterPoint());
  }

  function nudgeZoom(delta: number) {
    const roundedPercent = Math.round((zoomRef.current * 100) / 10) * 10;
    setZoomAtViewportPoint(clamp(roundedPercent + delta, 25, 300) / 100, viewportCenterPoint());
  }

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.addEventListener("wheel", handleNativeViewportWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleNativeViewportWheel);
    };
  });

  useEffect(() => {
    finishLineDrawingRef.current = finishLineDrawing;
    finishFreehandDrawingRef.current = finishFreehandDrawing;
  });

  useEffect(() => {
    function pointFromWindowEvent(event: PointerEvent): Point | null {
      const stage = stageRef.current;
      const container = stage?.container();

      if (!container) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      const canvasSize = canvasSizeRef.current;

      return {
        x: clamp((event.clientX - rect.left) / zoomRef.current, 0, canvasSize.width),
        y: clamp((event.clientY - rect.top) / zoomRef.current, 0, canvasSize.height),
      };
    }

    function pointForWindowTool(point: Point) {
      return snapToGridRef.current && toolRef.current !== "wall-freehand"
        ? snapPoint(point, gridSizeRef.current)
        : point;
    }

    function handleWindowPointerMove(event: PointerEvent) {
      if (!isLineDrawingRef.current && !isFreehandDrawingRef.current) {
        return;
      }

      const point = pointFromWindowEvent(event);

      if (!point) {
        return;
      }

      if (isLineDrawingRef.current && toolRef.current === "wall-line") {
        setCurrentWallPoints((points) => {
          const start = points[0] ?? point;
          const next = [start, pointForWindowTool(point)];
          currentWallPointsRef.current = next;
          return next;
        });
      }

      if (isFreehandDrawingRef.current && toolRef.current === "wall-freehand") {
        setFreehandPoints((points) => {
          const next = [...points, point];
          freehandPointsRef.current = next;
          return next;
        });
      }
    }

    function handleWindowPointerUp() {
      if (isLineDrawingRef.current) {
        finishLineDrawingRef.current();
      }

      if (isFreehandDrawingRef.current) {
        finishFreehandDrawingRef.current();
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("mouseup", handleWindowPointerUp);
    window.addEventListener("touchend", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("mouseup", handleWindowPointerUp);
      window.removeEventListener("touchend", handleWindowPointerUp);
    };
  }, []);

  function renderCanvasControls() {
    return (
      <section className="grid gap-3">
        <PanelTitle title="캔버스" />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            value={scene.canvas.width}
            min={100}
            max={8000}
            onChange={(value) => updateCanvas({ width: value })}
          />
          <NumberField
            label="Height"
            value={scene.canvas.height}
            min={100}
            max={8000}
            onChange={(value) => updateCanvas({ height: value })}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <NumberField
            label="Grid"
            value={scene.canvas.gridSize}
            min={2}
            max={200}
            onChange={(value) => updateCanvas({ gridSize: value })}
          />
          <label className="flex h-10 items-center gap-2 rounded-md border border-[#cbd2dc] px-3 text-sm">
            <input
              type="checkbox"
              checked={scene.canvas.snapToGrid}
              onChange={(event) => updateCanvas({ snapToGrid: event.target.checked })}
            />
            Snap
          </label>
        </div>
        <div className="flex items-center gap-2">
          <IconButton title="축소" onClick={() => nudgeZoom(-10)}>
            <Minus size={18} aria-hidden />
          </IconButton>
          <div className="w-24">
            <NumberField
              label="Zoom %"
              value={zoomPercent}
              min={25}
              max={300}
              onChange={setZoomPercent}
            />
          </div>
          <IconButton title="확대" onClick={() => nudgeZoom(10)}>
            <Plus size={18} aria-hidden />
          </IconButton>
          <button className="small-button ml-auto" type="button" onClick={fitCanvasToViewport}>
            맞춤
          </button>
        </div>
      </section>
    );
  }

  function renderWallControls() {
    return (
      <section className="grid gap-3">
        <PanelTitle title="벽" />
        <NumberField
          label="Stroke px"
          value={wallStrokeWidth}
          min={1}
          max={40}
          onChange={setWallStrokeWidth}
        />
      </section>
    );
  }

  function renderBlueprintControls() {
    return (
      <section className="grid gap-3">
        <PanelTitle title="도면" />
        <label className="command-button justify-center">
          <ImagePlus size={16} aria-hidden />
          이미지 선택
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => handleBlueprintUpload(event.target.files?.[0] ?? null)}
          />
        </label>
        {blueprintImage ? (
          <>
            <label className="flex h-10 items-center gap-2 rounded-md border border-[#cbd2dc] px-3 text-sm">
              <input
                type="checkbox"
                checked={isBlueprintEditing}
                onChange={(event) => {
                  setIsBlueprintEditing(event.target.checked);
                  setSelectedIds([]);
                  setTool("select");
                }}
              />
              도면 조정
            </label>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="X"
                value={blueprintPlacement.x}
                min={-8000}
                max={8000}
                onChange={(value) => updateBlueprintPlacement({ x: value })}
              />
              <NumberField
                label="Y"
                value={blueprintPlacement.y}
                min={-8000}
                max={8000}
                onChange={(value) => updateBlueprintPlacement({ y: value })}
              />
              <NumberField
                label="Width"
                value={blueprintPlacement.width}
                min={10}
                max={16000}
                onChange={(value) => updateBlueprintPlacement({ width: value })}
              />
              <NumberField
                label="Height"
                value={blueprintPlacement.height}
                min={10}
                max={16000}
                onChange={(value) => updateBlueprintPlacement({ height: value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="small-button justify-center" type="button" onClick={fitBlueprintToCanvas}>
                캔버스 맞춤
              </button>
              <button className="small-button justify-center" type="button" onClick={fitBlueprintWithRatio}>
                비율 맞춤
              </button>
            </div>
            <label className="grid gap-2 text-sm font-medium text-[#252a31]">
              Opacity
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={blueprintOpacity}
                onChange={(event) => setBlueprintOpacity(Number(event.target.value))}
              />
            </label>
            <button
              className="small-button"
              type="button"
              onClick={() => {
                if (blueprintUrl) {
                  URL.revokeObjectURL(blueprintUrl);
                }

                setBlueprintUrl(null);
                setBlueprintImage(null);
                setIsBlueprintEditing(false);
              }}
            >
              제거
            </button>
          </>
        ) : null}
      </section>
    );
  }

  function renderSelectionControls() {
    return (
      <section className="grid gap-3">
        <PanelTitle title="선택" />
        {selectedItem ? (
          <SelectedItemInspector item={selectedItem} onUpdate={updateItem} />
        ) : selectedItems.length > 1 ? (
          <p className="text-sm text-[#59616d]">{selectedItems.length}개 선택됨</p>
        ) : (
          <p className="text-sm text-[#59616d]">선택된 가구 없음</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="command-button justify-center" type="button" onClick={groupSelected} disabled={selectedIds.length < 2}>
            <Group size={16} aria-hidden />
            그룹
          </button>
          <button className="command-button justify-center" type="button" onClick={ungroupSelected} disabled={selectedGroups.length === 0}>
            <Ungroup size={16} aria-hidden />
            해제
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden flex-col bg-[#f5f6f8] text-[#15181c]">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[#d9dee7] bg-white px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{initialRoom.name ?? "Room Canvas"}</h1>
          <p className="truncate text-xs text-[#66707d]">
            v{currentVersion}
            {isHistoricalVersion ? ` / 최신 v${latestVersion}` : ""} · {scene.canvas.width}px x {scene.canvas.height}px · 저장{" "}
            {formatDate(updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="command-button max-w-[8.5rem] px-2 sm:max-w-[12rem] sm:px-3"
            type="button"
            onClick={openVersionPanel}
            title={versionMemo ? `${versionName} - ${versionMemo}` : versionName}
          >
            <History size={16} aria-hidden />
            <span className="truncate">v{currentVersion} {versionName}</span>
          </button>
          <button className="command-button" type="button" onClick={copyShareLink}>
            <Copy size={16} aria-hidden />
            <span className="hidden sm:inline">링크 복사</span>
          </button>
          <div className="hidden lg:block">
            <button
              className="command-button"
              type="button"
              onClick={() => void exportRoomImage()}
              disabled={exportState === "exporting"}
            >
              <Download size={16} aria-hidden />
              <span>{exportState === "exporting" ? "생성 중" : "이미지 저장"}</span>
            </button>
          </div>
          <button className="primary-button" type="button" onClick={saveRoom} disabled={saveState === "saving"}>
            {!isHistoricalVersion && saveState === "saved" ? <Check size={16} aria-hidden /> : <Save size={16} aria-hidden />}
            <span className="hidden sm:inline">
              {isHistoricalVersion ? "새 버전" : saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : "저장"}
            </span>
          </button>
        </div>
      </header>

      {isVersionPanelOpen ? (
        <VersionPanel
          key={latestVersion}
          versions={versions}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          listState={versionListState}
          actionState={versionActionState}
          onClose={() => setIsVersionPanelOpen(false)}
          onRefresh={loadVersions}
          onSelect={openVersion}
          onCreate={createVersion}
          onUpdate={updateVersionMeta}
        />
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[64px_minmax(0,1fr)_300px]">
        <aside className="hidden min-h-0 gap-2 overflow-x-hidden overflow-y-auto border-r border-[#d9dee7] bg-white p-2 lg:flex lg:flex-col">
          <IconButton active={tool === "select"} title="선택" onClick={() => setActiveTool("select")}>
            <MousePointer2 size={19} aria-hidden />
          </IconButton>
          <IconButton active={tool === "pan"} title="캔버스 이동" onClick={() => setActiveTool("pan")}>
            <Hand size={19} aria-hidden />
          </IconButton>
          <IconButton active={tool === "wall-line"} title="직선 벽" onClick={() => setActiveTool("wall-line")}>
            <Waypoints size={19} aria-hidden />
          </IconButton>
          <IconButton active={tool === "wall-freehand"} title="프리드로우 벽" onClick={() => setActiveTool("wall-freehand")}>
            <Pencil size={19} aria-hidden />
          </IconButton>
          <IconButton active={tool === "rect"} title="사각형 가구" onClick={() => setActiveTool("rect")}>
            <Square size={19} aria-hidden />
          </IconButton>
          <IconButton active={tool === "circle"} title="원형 가구" onClick={() => setActiveTool("circle")}>
            <CircleIcon size={19} aria-hidden />
          </IconButton>
          <div className="mx-1 h-8 w-px bg-[#d9dee7] lg:h-px lg:w-8" />
          <IconButton title="되돌리기" disabled={history.past.length === 0} onClick={undo}>
            <Undo2 size={19} aria-hidden />
          </IconButton>
          <IconButton title="다시 실행" disabled={history.future.length === 0} onClick={redo}>
            <Redo2 size={19} aria-hidden />
          </IconButton>
          <IconButton title="삭제" disabled={selectedIds.length === 0} onClick={deleteSelected}>
            <Trash2 size={19} aria-hidden />
          </IconButton>
        </aside>

        <main
          ref={viewportRef}
          className={`canvas-viewport relative min-h-0 overflow-hidden bg-[#e7ebf0] ${canBlankPan ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
        >
          {saveState === "error" ? (
            <div className="absolute right-4 top-4 z-10 rounded-md border border-[#f2b8ad] bg-[#fff3f0] px-3 py-2 text-sm text-[#b42318]">
              저장하지 못했습니다.
            </div>
          ) : null}
          {exportState === "error" ? (
            <div
              className={`absolute right-4 z-10 rounded-md border border-[#f2b8ad] bg-[#fff3f0] px-3 py-2 text-sm text-[#b42318] ${
                saveState === "error" ? "top-16" : "top-4"
              }`}
            >
              이미지 추출에 실패했습니다.
            </div>
          ) : null}
          {isHistoricalVersion ? (
            <div className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-md border border-[#f1d18a] bg-[#fff8e5] px-3 py-2 text-sm text-[#6f4b00]">
              과거 버전 편집 중입니다. 저장하려면 새 버전을 만드세요.
            </div>
          ) : null}

          <div className="canvas-content">
            <div
              className="stage-shell"
              style={{
                width: stagePixelWidth,
                height: stagePixelHeight,
                transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0)`,
              }}
            >
              <Stage
                ref={stageRef}
                width={stagePixelWidth}
                height={stagePixelHeight}
                scaleX={zoom}
                scaleY={zoom}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
              >
                <Layer>
                  <Rect
                    x={0}
                    y={0}
                    width={scene.canvas.width}
                    height={scene.canvas.height}
                    fill="#ffffff"
                    listening={false}
                  />
                  {blueprintImage ? (
                    <KonvaImage
                      ref={blueprintRef}
                      image={blueprintImage}
                      x={blueprintPlacement.x}
                      y={blueprintPlacement.y}
                      width={blueprintPlacement.width}
                      height={blueprintPlacement.height}
                      rotation={blueprintPlacement.rotation}
                      opacity={blueprintOpacity}
                      draggable={isBlueprintEditing}
                      listening={isBlueprintEditing}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        setSelectedIds([]);
                        setIsBlueprintEditing(true);
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        setSelectedIds([]);
                        setIsBlueprintEditing(true);
                      }}
                      onDragEnd={(event) =>
                        updateBlueprintPlacement({
                          x: Math.round(event.target.x()),
                          y: Math.round(event.target.y()),
                        })
                      }
                      onTransformEnd={handleBlueprintTransformEnd}
                    />
                  ) : null}
                  {gridLines}
                  {scene.walls.map((wall) => (
                    <Line
                      key={wall.id}
                      points={flattenPoints(wall.points)}
                      stroke={wall.color}
                      strokeWidth={wall.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      tension={wall.toolType === "freehand" ? 0.35 : 0}
                      listening={false}
                    />
                  ))}
                  {currentWallPoints.length > 0 ? (
                    <Line
                      points={flattenPoints(currentWallPoints)}
                      stroke="#1c4f8f"
                      strokeWidth={wallStrokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      dash={[12, 8]}
                      listening={false}
                    />
                  ) : null}
                  {freehandPoints.length > 0 ? (
                    <Line
                      points={flattenPoints(freehandPoints)}
                      stroke="#1c4f8f"
                      strokeWidth={wallStrokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      tension={0.35}
                      listening={false}
                    />
                  ) : null}
                  {scene.furniture.map((item) => (
                    <KonvaGroup
                      key={item.id}
                      ref={(node) => {
                        if (node) {
                          shapeRefs.current[item.id] = node;
                        } else {
                          delete shapeRefs.current[item.id];
                        }
                      }}
                      x={item.x}
                      y={item.y}
                      rotation={item.rotation}
                      draggable={tool === "select" && !isPanningMode}
                      onClick={(event) => selectFurniture(item, event)}
                      onTap={(event) => selectFurniture(item, event)}
                      onDragStart={() => handleDragStart(item)}
                      onDragMove={(event) => handleDragMove(item, event)}
                      onDragEnd={(event) => handleDragEnd(item, event)}
                      onTransformEnd={(event) => handleTransformEnd(item, event)}
                    >
                      {item.type === "rect" ? (
                        <Rect
                          x={0}
                          y={0}
                          width={item.width}
                          height={item.height}
                          fill={item.fill}
                          stroke={selectedIds.includes(item.id) ? "#1c4f8f" : "#3d4652"}
                          strokeWidth={selectedIds.includes(item.id) ? 2 : 1}
                        />
                      ) : (
                        <Circle
                          x={item.width / 2}
                          y={item.height / 2}
                          radius={item.width / 2}
                          fill={item.fill}
                          stroke={selectedIds.includes(item.id) ? "#1c4f8f" : "#3d4652"}
                          strokeWidth={selectedIds.includes(item.id) ? 2 : 1}
                        />
                      )}
                      <Text
                        x={0}
                        y={item.height / 2 - 7}
                        width={item.width}
                        text={item.label}
                        align="center"
                        fontSize={13}
                        fill="#252a31"
                        listening={false}
                      />
                    </KonvaGroup>
                  ))}
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    flipEnabled={false}
                    keepRatio={selectedItems.some((item) => item.type === "circle")}
                    boundBoxFunc={(oldBox, newBox) =>
                      Math.abs(newBox.width) < MIN_SHAPE_SIZE || Math.abs(newBox.height) < MIN_SHAPE_SIZE
                        ? oldBox
                      : newBox
                    }
                  />
                  <Transformer
                    ref={blueprintTransformerRef}
                    rotateEnabled={false}
                    enabledAnchors={[
                      "top-left",
                      "top-center",
                      "top-right",
                      "middle-left",
                      "middle-right",
                      "bottom-left",
                      "bottom-center",
                      "bottom-right",
                    ]}
                    boundBoxFunc={(oldBox, newBox) =>
                      Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox
                    }
                  />
                </Layer>
              </Stage>
            </div>
          </div>

          <div
            className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 lg:hidden"
            data-canvas-ui="true"
          >
            <span className="rounded-md border border-[#cbd2dc] bg-white/95 px-2 py-1 text-xs font-semibold text-[#303742] shadow-sm">
              {zoomPercent}%
            </span>
            <button
              className="pointer-events-auto rounded-md border border-[#cbd2dc] bg-white/95 px-3 py-1 text-xs font-semibold text-[#303742] shadow-sm"
              type="button"
              onClick={fitCanvasToViewport}
            >
              맞춤
            </button>
          </div>

          <div className="absolute inset-x-3 bottom-3 z-10 lg:hidden" data-canvas-ui="true">
            <div className="flex gap-2 overflow-x-auto rounded-md border border-[#cbd2dc] bg-white/95 p-2 shadow-lg">
              {selectedIds.length > 0 ? (
                <>
                  <div className="flex h-11 min-w-[8.5rem] shrink-0 items-center rounded-md border border-[#cbd2dc] bg-[#f8fafc] px-3">
                    <span className="truncate text-sm font-semibold text-[#252a31]">
                      {selectedItem ? selectedItem.label : `${selectedIds.length}개 선택`}
                    </span>
                  </div>
                  <MobileToolButton title="선택 설정" onClick={() => openMobilePanel("selection")}>
                    <Settings size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton
                    title={exportState === "exporting" ? "이미지 생성 중" : "이미지 저장"}
                    disabled={exportState === "exporting"}
                    onClick={() => void exportRoomImage()}
                  >
                    <Download size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="그룹" disabled={selectedIds.length < 2} onClick={groupSelected}>
                    <Group size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="그룹 해제" disabled={selectedGroups.length === 0} onClick={ungroupSelected}>
                    <Ungroup size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="삭제" onClick={deleteSelected}>
                    <Trash2 size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="선택 해제" onClick={() => setSelectedIds([])}>
                    <X size={19} aria-hidden />
                  </MobileToolButton>
                </>
              ) : (
                <>
                  <MobileToolButton active={tool === "select"} title="선택" onClick={() => setActiveTool("select")}>
                    <MousePointer2 size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton active={tool === "pan"} title="이동" onClick={() => setActiveTool("pan")}>
                    <Hand size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton active={tool === "wall-line"} title="직선 벽" onClick={() => setActiveTool("wall-line")}>
                    <Waypoints size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton active={tool === "wall-freehand"} title="프리드로우 벽" onClick={() => setActiveTool("wall-freehand")}>
                    <Pencil size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton active={tool === "rect"} title="사각형 가구" onClick={() => setActiveTool("rect")}>
                    <Square size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton active={tool === "circle"} title="원형 가구" onClick={() => setActiveTool("circle")}>
                    <CircleIcon size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="되돌리기" disabled={history.past.length === 0} onClick={undo}>
                    <Undo2 size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title={isHistoricalVersion ? "새 버전으로 저장" : "저장"} disabled={saveState === "saving"} onClick={saveRoom}>
                    {!isHistoricalVersion && saveState === "saved" ? <Check size={19} aria-hidden /> : <Save size={19} aria-hidden />}
                  </MobileToolButton>
                  <MobileToolButton
                    title={exportState === "exporting" ? "이미지 생성 중" : "이미지 저장"}
                    disabled={exportState === "exporting"}
                    onClick={() => void exportRoomImage()}
                  >
                    <Download size={19} aria-hidden />
                  </MobileToolButton>
                  <MobileToolButton title="설정" onClick={() => openMobilePanel("canvas")}>
                    <Settings size={19} aria-hidden />
                  </MobileToolButton>
                </>
              )}
            </div>
          </div>
        </main>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-[#d9dee7] bg-white p-4 lg:block">
          <div className="grid gap-6">
            <section className="grid gap-3">
              <PanelTitle title="캔버스" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Width"
                  value={scene.canvas.width}
                  min={100}
                  max={8000}
                  onChange={(value) => updateCanvas({ width: value })}
                />
                <NumberField
                  label="Height"
                  value={scene.canvas.height}
                  min={100}
                  max={8000}
                  onChange={(value) => updateCanvas({ height: value })}
                />
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <NumberField
                  label="Grid"
                  value={scene.canvas.gridSize}
                  min={2}
                  max={200}
                  onChange={(value) => updateCanvas({ gridSize: value })}
                />
                <label className="flex h-10 items-center gap-2 rounded-md border border-[#cbd2dc] px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={scene.canvas.snapToGrid}
                    onChange={(event) => updateCanvas({ snapToGrid: event.target.checked })}
                  />
                  Snap
                </label>
              </div>
              <div className="flex items-center gap-2">
                <IconButton title="축소" onClick={() => nudgeZoom(-10)}>
                  <Minus size={18} aria-hidden />
                </IconButton>
                <div className="w-24">
                  <NumberField
                    label="Zoom %"
                    value={zoomPercent}
                    min={25}
                    max={300}
                    onChange={setZoomPercent}
                  />
                </div>
                <IconButton title="확대" onClick={() => nudgeZoom(10)}>
                  <Plus size={18} aria-hidden />
                </IconButton>
              </div>
            </section>

            <section className="grid gap-3">
              <PanelTitle title="벽" />
              <NumberField
                label="Stroke px"
                value={wallStrokeWidth}
                min={1}
                max={40}
                onChange={setWallStrokeWidth}
              />
            </section>

            <section className="grid gap-3">
              <PanelTitle title="도면" />
              <label className="command-button justify-center">
                <ImagePlus size={16} aria-hidden />
                이미지 선택
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => handleBlueprintUpload(event.target.files?.[0] ?? null)}
                />
              </label>
              {blueprintImage ? (
                <>
                  <label className="flex h-10 items-center gap-2 rounded-md border border-[#cbd2dc] px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={isBlueprintEditing}
                      onChange={(event) => {
                        setIsBlueprintEditing(event.target.checked);
                        setSelectedIds([]);
                        setTool("select");
                      }}
                    />
                    도면 조정
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label="X"
                      value={blueprintPlacement.x}
                      min={-8000}
                      max={8000}
                      onChange={(value) => updateBlueprintPlacement({ x: value })}
                    />
                    <NumberField
                      label="Y"
                      value={blueprintPlacement.y}
                      min={-8000}
                      max={8000}
                      onChange={(value) => updateBlueprintPlacement({ y: value })}
                    />
                    <NumberField
                      label="Width"
                      value={blueprintPlacement.width}
                      min={10}
                      max={16000}
                      onChange={(value) => updateBlueprintPlacement({ width: value })}
                    />
                    <NumberField
                      label="Height"
                      value={blueprintPlacement.height}
                      min={10}
                      max={16000}
                      onChange={(value) => updateBlueprintPlacement({ height: value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="small-button justify-center" type="button" onClick={fitBlueprintToCanvas}>
                      캔버스 맞춤
                    </button>
                    <button className="small-button justify-center" type="button" onClick={fitBlueprintWithRatio}>
                      비율 맞춤
                    </button>
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-[#252a31]">
                    Opacity
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={blueprintOpacity}
                      onChange={(event) => setBlueprintOpacity(Number(event.target.value))}
                    />
                  </label>
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => {
                      if (blueprintUrl) {
                        URL.revokeObjectURL(blueprintUrl);
                      }

                      setBlueprintUrl(null);
                      setBlueprintImage(null);
                      setIsBlueprintEditing(false);
                    }}
                  >
                    제거
                  </button>
                </>
              ) : null}
            </section>

            <section className="grid gap-3">
              <PanelTitle title="선택" />
              {selectedItem ? (
                <SelectedItemInspector item={selectedItem} onUpdate={updateItem} />
              ) : selectedItems.length > 1 ? (
                <p className="text-sm text-[#59616d]">{selectedItems.length}개 선택됨</p>
              ) : (
                <p className="text-sm text-[#59616d]">선택된 가구 없음</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button className="command-button justify-center" type="button" onClick={groupSelected} disabled={selectedIds.length < 2}>
                  <Group size={16} aria-hidden />
                  그룹
                </button>
                <button className="command-button justify-center" type="button" onClick={ungroupSelected} disabled={selectedGroups.length === 0}>
                  <Ungroup size={16} aria-hidden />
                  해제
                </button>
              </div>
            </section>
          </div>
        </aside>
      </div>

      {isMobilePanelOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-[#15181c]/35"
            type="button"
            aria-label="설정 닫기"
            onClick={() => setIsMobilePanelOpen(false)}
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[72dvh] rounded-t-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#d9dee7] px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-[#15181c]">설정</h2>
                <p className="text-xs text-[#66707d]">캔버스는 시트 밖에서 계속 조작할 수 있습니다.</p>
              </div>
              <IconButton title="닫기" onClick={() => setIsMobilePanelOpen(false)}>
                <X size={18} aria-hidden />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 border-b border-[#d9dee7] p-2">
              <MobileTabButton
                active={mobilePanelTab === "canvas"}
                label="캔버스"
                onClick={() => setMobilePanelTab("canvas")}
              />
              <MobileTabButton
                active={mobilePanelTab === "blueprint"}
                label="도면"
                onClick={() => setMobilePanelTab("blueprint")}
              />
              <MobileTabButton
                active={mobilePanelTab === "selection"}
                label="선택"
                onClick={() => setMobilePanelTab("selection")}
              />
            </div>
            <div className="max-h-[calc(72dvh-7.5rem)] overflow-y-auto p-4">
              <div className="grid gap-6">
                {mobilePanelTab === "canvas" ? (
                  <>
                    {renderCanvasControls()}
                    {renderWallControls()}
                  </>
                ) : null}
                {mobilePanelTab === "blueprint" ? renderBlueprintControls() : null}
                {mobilePanelTab === "selection" ? renderSelectionControls() : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function VersionPanel({
  versions,
  currentVersion,
  latestVersion,
  listState,
  actionState,
  onClose,
  onRefresh,
  onSelect,
  onCreate,
  onUpdate,
}: {
  versions: RoomVersionSummary[];
  currentVersion: number;
  latestVersion: number;
  listState: VersionListState;
  actionState: VersionActionState;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onSelect: (version: number) => void | Promise<void>;
  onCreate: (name: string, memo: string) => void | Promise<void>;
  onUpdate: (version: number, name: string, memo: string) => void | Promise<void>;
}) {
  const [newName, setNewName] = useState(`버전 ${latestVersion + 1}`);
  const [newMemo, setNewMemo] = useState("");
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const isBusy = actionState !== "idle";

  function submitNewVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newName.trim()) {
      return;
    }

    void onCreate(newName, newMemo);
  }

  function beginEdit(version: RoomVersionSummary) {
    setEditingVersion(version.version);
    setEditName(version.name);
    setEditMemo(version.memo ?? "");
  }

  function submitEditVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingVersion || !editName.trim()) {
      return;
    }

    void onUpdate(editingVersion, editName, editMemo);
    setEditingVersion(null);
  }

  return (
    <div className="fixed inset-0 z-30 bg-[#15181c]/35">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="버전 관리"
        className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex min-h-14 items-center justify-between border-b border-[#d9dee7] px-4">
          <div>
            <h2 className="text-base font-semibold text-[#15181c]">버전</h2>
            <p className="text-xs text-[#66707d]">기본 링크는 v{latestVersion}을 엽니다.</p>
          </div>
          <IconButton title="닫기" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>

        <div className="grid gap-5 overflow-y-auto p-4">
          <form onSubmit={submitNewVersion} className="grid gap-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] p-3">
            <PanelTitle title="새 버전" />
            <label className="grid gap-2 text-sm font-medium text-[#252a31]">
              이름
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="field-input"
                maxLength={60}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#252a31]">
              메모
              <textarea
                value={newMemo}
                onChange={(event) => setNewMemo(event.target.value)}
                className="min-h-20 w-full resize-y rounded-md border border-[#cbd2dc] bg-white p-3 text-sm outline-none transition focus:border-[#1c4f8f] focus:ring-2 focus:ring-[#cfe0f6]"
                maxLength={500}
              />
            </label>
            <button
              className="primary-button justify-center"
              type="submit"
              disabled={isBusy || !newName.trim()}
            >
              <Plus size={16} aria-hidden />
              {actionState === "creating" ? "생성 중" : "새 버전 만들기"}
            </button>
          </form>

          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle title="버전 목록" />
              <button
                className="small-button"
                type="button"
                onClick={() => void onRefresh()}
                disabled={isBusy || listState === "loading"}
              >
                새로고침
              </button>
            </div>

            {listState === "error" ? (
              <p className="rounded-md border border-[#f2b8ad] bg-[#fff3f0] px-3 py-2 text-sm text-[#b42318]">
                버전 정보를 불러오지 못했습니다.
              </p>
            ) : null}

            {listState === "loading" && versions.length === 0 ? (
              <p className="text-sm text-[#59616d]">불러오는 중</p>
            ) : null}

            <div className="grid gap-2">
              {versions.map((version) => {
                const isCurrent = version.version === currentVersion;
                const isEditing = version.version === editingVersion;

                return (
                  <article
                    key={version.version}
                    className={`grid gap-3 rounded-md border p-3 ${
                      isCurrent ? "border-[#1c4f8f] bg-[#f2f7fd]" : "border-[#d9dee7] bg-white"
                    }`}
                  >
                    {isEditing ? (
                      <form onSubmit={submitEditVersion} className="grid gap-3">
                        <label className="grid gap-2 text-sm font-medium text-[#252a31]">
                          이름
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            className="field-input"
                            maxLength={60}
                            required
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#252a31]">
                          메모
                          <textarea
                            value={editMemo}
                            onChange={(event) => setEditMemo(event.target.value)}
                            className="min-h-20 w-full resize-y rounded-md border border-[#cbd2dc] bg-white p-3 text-sm outline-none transition focus:border-[#1c4f8f] focus:ring-2 focus:ring-[#cfe0f6]"
                            maxLength={500}
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className="primary-button justify-center"
                            type="submit"
                            disabled={isBusy || !editName.trim()}
                          >
                            저장
                          </button>
                          <button
                            className="small-button justify-center"
                            type="button"
                            onClick={() => setEditingVersion(null)}
                            disabled={isBusy}
                          >
                            취소
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#15181c]">v{version.version}</span>
                            <span className="min-w-0 truncate text-sm font-medium text-[#252a31]">
                              {version.name}
                            </span>
                            {version.isLatest ? (
                              <span className="rounded-sm bg-[#dfead2] px-1.5 py-0.5 text-xs font-semibold text-[#30451d]">
                                최신
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <span className="rounded-sm bg-[#dbeafe] px-1.5 py-0.5 text-xs font-semibold text-[#143a66]">
                                현재
                              </span>
                            ) : null}
                          </div>
                          {version.memo ? (
                            <p className="mt-1 line-clamp-2 text-sm text-[#59616d]">{version.memo}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-[#66707d]">
                            {version.width}px x {version.height}px · {formatDate(version.updatedAt)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className="command-button justify-center"
                            type="button"
                            onClick={() => void onSelect(version.version)}
                            disabled={isBusy || isCurrent}
                          >
                            {isCurrent ? "열림" : actionState === "switching" ? "여는 중" : "열기"}
                          </button>
                          <button
                            className="small-button justify-center"
                            type="button"
                            onClick={() => beginEdit(version)}
                            disabled={isBusy}
                          >
                            수정
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function SelectedItemInspector({
  item,
  onUpdate,
}: {
  item: FurnitureItem;
  onUpdate: (id: string, patch: Partial<FurnitureItem>) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-2 text-sm font-medium text-[#252a31]">
        이름
        <input
          value={item.label}
          onChange={(event) => onUpdate(item.id, { label: event.target.value })}
          className="field-input"
          maxLength={32}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="X" value={item.x} min={0} max={8000} onChange={(value) => onUpdate(item.id, { x: value })} />
        <NumberField label="Y" value={item.y} min={0} max={8000} onChange={(value) => onUpdate(item.id, { y: value })} />
      </div>
      {item.type === "circle" ? (
        <NumberField
          label="Diameter"
          value={item.width}
          min={MIN_SHAPE_SIZE}
          max={2000}
          onChange={(value) => onUpdate(item.id, { width: value, height: value })}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            value={item.width}
            min={MIN_SHAPE_SIZE}
            max={4000}
            onChange={(value) => onUpdate(item.id, { width: value })}
          />
          <NumberField
            label="Height"
            value={item.height}
            min={MIN_SHAPE_SIZE}
            max={4000}
            onChange={(value) => onUpdate(item.id, { height: value })}
          />
        </div>
      )}
      <NumberField
        label="Rotation"
        value={item.rotation}
        min={0}
        max={359}
        onChange={(value) => onUpdate(item.id, { rotation: normalizeRotation(value) })}
      />
      <label className="grid gap-2 text-sm font-medium text-[#252a31]">
        Color
        <input
          type="color"
          value={item.fill}
          onChange={(event) => onUpdate(item.id, { fill: event.target.value })}
          className="h-10 w-full rounded-md border border-[#cbd2dc] bg-white p-1"
        />
      </label>
    </div>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="text-xs font-semibold uppercase tracking-normal text-[#66707d]">{title}</h2>;
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  function commitDraft(input: HTMLInputElement) {
    const numeric = Number(input.value);

    if (!Number.isFinite(numeric)) {
      input.value = String(Math.round(value));
      return;
    }

    const next = Math.round(clamp(numeric, min, max));
    input.value = String(next);
    onChange(next);
  }

  return (
    <label className="grid gap-2 text-sm font-medium text-[#252a31]">
      {label}
      <input
        key={`${label}-${value}`}
        type="text"
        inputMode="decimal"
        defaultValue={String(Math.round(value))}
        onBlur={(event) => commitDraft(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="field-input"
      />
    </label>
  );
}

function IconButton({
  active = false,
  title,
  disabled = false,
  children,
  onClick,
}: {
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-sm transition ${
        active
          ? "border-[#1c4f8f] bg-[#e7f0fb] text-[#143a66]"
          : "border-[#cbd2dc] bg-white text-[#303742] hover:bg-[#f2f4f7]"
      } disabled:cursor-not-allowed disabled:border-[#e4e8ee] disabled:text-[#a6afbb]`}
    >
      {children}
    </button>
  );
}

function MobileToolButton({
  active = false,
  title,
  disabled = false,
  children,
  onClick,
}: {
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-sm transition ${
        active
          ? "border-[#1c4f8f] bg-[#e7f0fb] text-[#143a66]"
          : "border-[#cbd2dc] bg-white text-[#303742] active:bg-[#f2f4f7]"
      } disabled:cursor-not-allowed disabled:border-[#e4e8ee] disabled:text-[#a6afbb]`}
    >
      {children}
    </button>
  );
}

function MobileTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-md text-sm font-semibold transition ${
        active ? "bg-[#e7f0fb] text-[#143a66]" : "text-[#59616d] active:bg-[#f2f4f7]"
      }`}
    >
      {label}
    </button>
  );
}

async function createRoomImageBlob({
  scene,
  blueprintImage,
  blueprintPlacement,
  blueprintOpacity,
}: {
  scene: RoomScene;
  blueprintImage: HTMLImageElement | null;
  blueprintPlacement: BlueprintPlacement;
  blueprintOpacity: number;
}) {
  const exportScale = getExportScale(scene.canvas.width, scene.canvas.height);
  const exportWidth = Math.max(1, Math.round(scene.canvas.width * exportScale));
  const exportHeight = Math.max(1, Math.round(scene.canvas.height * exportScale));
  const previousPixelRatio = Konva.pixelRatio;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "-100000px";
  container.style.width = `${exportWidth}px`;
  container.style.height = `${exportHeight}px`;
  document.body.appendChild(container);

  let stage: KonvaStage | null = null;

  try {
    Konva.pixelRatio = 1;
    stage = new Konva.Stage({
      container,
      width: exportWidth,
      height: exportHeight,
    });

    const layer = new Konva.Layer({
      listening: false,
      scaleX: exportScale,
      scaleY: exportScale,
    });
    stage.add(layer);

    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: scene.canvas.width,
        height: scene.canvas.height,
        fill: "#ffffff",
        listening: false,
      }),
    );

    if (blueprintImage) {
      layer.add(
        new Konva.Image({
          image: blueprintImage,
          x: blueprintPlacement.x,
          y: blueprintPlacement.y,
          width: blueprintPlacement.width,
          height: blueprintPlacement.height,
          rotation: blueprintPlacement.rotation,
          opacity: clamp(blueprintOpacity, 0, 1),
          listening: false,
        }),
      );
    }

    for (const wall of scene.walls) {
      layer.add(
        new Konva.Line({
          points: flattenPoints(wall.points),
          stroke: wall.color,
          strokeWidth: wall.strokeWidth,
          lineCap: "round",
          lineJoin: "round",
          tension: wall.toolType === "freehand" ? 0.35 : 0,
          listening: false,
        }),
      );
    }

    for (const item of scene.furniture) {
      const group = new Konva.Group({
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        listening: false,
      });

      if (item.type === "rect") {
        group.add(
          new Konva.Rect({
            x: 0,
            y: 0,
            width: item.width,
            height: item.height,
            fill: item.fill,
            stroke: "#3d4652",
            strokeWidth: 1,
            listening: false,
          }),
        );
      } else {
        group.add(
          new Konva.Circle({
            x: item.width / 2,
            y: item.height / 2,
            radius: item.width / 2,
            fill: item.fill,
            stroke: "#3d4652",
            strokeWidth: 1,
            listening: false,
          }),
        );
      }

      group.add(
        new Konva.Text({
          x: 0,
          y: item.height / 2 - 7,
          width: item.width,
          text: item.label,
          align: "center",
          fontSize: 13,
          fill: "#252a31",
          listening: false,
        }),
      );
      layer.add(group);
    }

    layer.draw();

    const blob = (await stage.toBlob({
      mimeType: "image/png",
      pixelRatio: 1,
    })) as Blob | null;

    if (!blob) {
      throw new Error("Image export failed");
    }

    return blob;
  } finally {
    stage?.destroy();
    container.remove();
    Konva.pixelRatio = previousPixelRatio;
  }
}

function getExportScale(width: number, height: number) {
  const longestEdge = Math.max(width, height);

  if (longestEdge <= 0) {
    return 1;
  }

  return Math.min(EXPORT_MAX_PIXEL_RATIO, EXPORT_MAX_LONG_EDGE / longestEdge);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createExportFileName(name: string | null, version: number) {
  const baseName = sanitizeFileName(name?.trim() || "room-canvas");

  return `${baseName}-v${version}.png`;
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return sanitized || "room-canvas";
}

function flattenPoints(points: Point[]) {
  return points.flatMap((point) => [point.x, point.y]);
}

function snapPoint(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mergeSelection(current: string[], next: string[]) {
  const merged = new Set(current);

  for (const id of next) {
    if (merged.has(id)) {
      merged.delete(id);
    } else {
      merged.add(id);
    }
  }

  return Array.from(merged);
}

function topLeftFromNode(node: KonvaNode): Point {
  return {
    x: node.x(),
    y: node.y(),
  };
}

function setNodeTopLeft(node: KonvaNode, point: Point) {
  node.position(point);
}

function normalizeFurnitureGroups(
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

function clampFurnitureDragDelta(
  ids: string[],
  positions: Record<string, Point>,
  furniture: FurnitureItem[],
  delta: Point,
  canvas: RoomScene["canvas"],
): Point {
  const selectedIds = new Set(ids);
  const selected = furniture.filter((item) => selectedIds.has(item.id) && positions[item.id]);

  if (selected.length === 0) {
    return delta;
  }

  const bounds = selected.reduce(
    (current, item) => {
      const position = positions[item.id];

      return {
        left: Math.min(current.left, position.x),
        top: Math.min(current.top, position.y),
        right: Math.max(current.right, position.x + item.width),
        bottom: Math.max(current.bottom, position.y + item.height),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    x: clampToRange(delta.x, -bounds.left, canvas.width - bounds.right),
    y: clampToRange(delta.y, -bounds.top, canvas.height - bounds.bottom),
  };
}

function clampNodeBoundsToCanvas(node: KonvaNode, canvas: RoomScene["canvas"]): Point {
  const bounds = node.getClientRect({ relativeTo: node.getParent() ?? undefined });
  const offset = {
    x: clampOverflowOffset(bounds.x, bounds.width, canvas.width),
    y: clampOverflowOffset(bounds.y, bounds.height, canvas.height),
  };

  return {
    x: Math.round(node.x() + offset.x),
    y: Math.round(node.y() + offset.y),
  };
}

function clampOverflowOffset(position: number, size: number, limit: number) {
  if (size > limit) {
    return -position;
  }

  if (position < 0) {
    return -position;
  }

  if (position + size > limit) {
    return limit - (position + size);
  }

  return 0;
}

function clampToRange(value: number, min: number, max: number) {
  if (min > max) {
    return 0;
  }

  return clamp(value, min, max);
}

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function calculateFitZoom(scene: RoomScene, viewportWidth: number, viewportHeight: number) {
  const availableWidth = Math.max(100, viewportWidth - 24);
  const availableHeight = Math.max(100, viewportHeight - 120);
  const fitZoom = Math.min(
    availableWidth / scene.canvas.width,
    availableHeight / scene.canvas.height,
  );

  return clamp(fitZoom, 0.25, 1);
}

function fitInsideCanvas(imageWidth: number, imageHeight: number, canvasWidth: number, canvasHeight: number): BlueprintPlacement {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      rotation: 0,
    };
  }

  const ratio = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = Math.max(10, Math.round(imageWidth * ratio));
  const height = Math.max(10, Math.round(imageHeight * ratio));

  return {
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
    rotation: 0,
  };
}

function normalizeRotation(value: number) {
  return Math.round(((value % 360) + 360) % 360);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function isCanvasUiTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      '[data-canvas-ui="true"], button, a, input, textarea, select, label, [role="button"]',
    ),
  );
}
