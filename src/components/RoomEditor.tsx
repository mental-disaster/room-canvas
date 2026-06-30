"use client";

import type Konva from "konva";
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
  Group,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Ungroup,
  Undo2,
  Waypoints,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { FurnitureItem, Point, RoomPayload, RoomScene, WallToolType } from "@/lib/scene";

type Tool = "select" | "pan" | "wall-line" | "wall-freehand" | "rect" | "circle";
type SaveState = "idle" | "saving" | "saved" | "error";
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

const FURNITURE_COLORS = ["#d8eef2", "#f7d7cc", "#e9e1f5", "#dfead2", "#f3e2b8", "#dce3ee"];
const WALL_COLOR = "#26313f";
const MIN_SHAPE_SIZE = 20;

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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [updatedAt, setUpdatedAt] = useState(initialRoom.updatedAt);

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
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
  const wallStrokeWidthRef = useRef(3);
  const gridSizeRef = useRef(initialRoom.scene.canvas.gridSize);
  const snapToGridRef = useRef(initialRoom.scene.canvas.snapToGrid);
  const transformerRef = useRef<Konva.Transformer>(null);
  const blueprintRef = useRef<Konva.Image>(null);
  const blueprintTransformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});
  const dragStartRef = useRef<{
    itemId: string;
    ids: string[];
    positions: Record<string, Point>;
  } | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

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
  const zoomPercent = Math.round(zoom * 100);

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
  ]);

  const commitScene = useCallback((updater: RoomScene | ((current: RoomScene) => RoomScene)) => {
    setScene((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;

      if (next === current) {
        return current;
      }

      setHistory((currentHistory) => ({
        past: [...currentHistory.past.slice(-59), current],
        future: [],
      }));
      setSaveState("idle");
      return next;
    });
  }, []);

  const updateSceneWithoutHistory = useCallback((next: RoomScene) => {
    setScene(next);
    setSaveState("saved");
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      return;
    }

    commitScene((current) => {
      const selected = new Set(selectedIds);
      return {
        ...current,
        furniture: current.furniture.filter((item) => !selected.has(item.id)),
        groups: current.groups
          .map((group) => ({
            ...group,
            itemIds: group.itemIds.filter((itemId) => !selected.has(itemId)),
          }))
          .filter((group) => group.itemIds.length > 1),
      };
    });
    setSelectedIds([]);
  }, [commitScene, selectedIds]);

  const undo = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);

      if (!previous) {
        return currentHistory;
      }

      setScene(() => {
        setSelectedIds([]);
        return previous;
      });

      return {
        past: currentHistory.past.slice(0, -1),
        future: [scene, ...currentHistory.future],
      };
    });
  }, [scene]);

  const redo = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];

      if (!next) {
        return currentHistory;
      }

      setScene(() => {
        setSelectedIds([]);
        return next;
      });

      return {
        past: [...currentHistory.past, scene],
        future: currentHistory.future.slice(1),
      };
    });
  }, [scene]);

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    const nodes = selectedIds
      .map((id) => shapeRefs.current[id])
      .filter((node): node is Konva.Node => Boolean(node));

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
    const step = scene.canvas.gridSize;

    for (let x = 0; x <= scene.canvas.width; x += step) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, scene.canvas.height]}
          stroke={x % (step * 5) === 0 ? "#c8ced8" : "#e7ebf0"}
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
          stroke={y % (step * 5) === 0 ? "#c8ced8" : "#e7ebf0"}
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

  function handleStagePointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (isPanningMode) {
      return;
    }

    const clickedStage = event.target === event.target.getStage();
    const point = getPointerPoint();

    if (!point || !clickedStage) {
      return;
    }

    if (tool === "select") {
      setSelectedIds([]);
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

  function handleStagePointerMove() {
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

  function handleStagePointerUp() {
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
    const ids = selectedIds.includes(item.id) ? selectedIds : [item.id];
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
    const delta = {
      x: currentTopLeft.x - start.x,
      y: currentTopLeft.y - start.y,
    };

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
    const start = dragState?.positions[item.id] ?? { x: item.x, y: item.y };
    const rawTopLeft = topLeftFromNode(event.target);
    const nextTopLeft = scene.canvas.snapToGrid ? snapPoint(rawTopLeft, scene.canvas.gridSize) : rawTopLeft;
    const delta = {
      x: nextTopLeft.x - start.x,
      y: nextTopLeft.y - start.y,
    };
    const ids = dragState?.ids ?? [item.id];

    dragStartRef.current = null;

    commitScene((current) => ({
      ...current,
      furniture: current.furniture.map((candidate) => {
        if (!ids.includes(candidate.id)) {
          return candidate;
        }

        const origin = dragState?.positions[candidate.id] ?? { x: candidate.x, y: candidate.y };
        const nextX = clamp(origin.x + delta.x, 0, current.canvas.width - candidate.width);
        const nextY = clamp(origin.y + delta.y, 0, current.canvas.height - candidate.height);

        return {
          ...candidate,
          x: nextX,
          y: nextY,
        };
      }),
    }));
  }

  function handleTransformEnd(item: FurnitureItem, event: Konva.KonvaEventObject<Event>) {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = normalizeRotation(node.rotation());

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
                x: clamp(Math.round(node.x()), 0, current.canvas.width - diameter),
                y: clamp(Math.round(node.y()), 0, current.canvas.height - diameter),
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
              x: clamp(Math.round(node.x()), 0, current.canvas.width - width),
              y: clamp(Math.round(node.y()), 0, current.canvas.height - height),
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

    commitScene((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        selectedIds.includes(item.id) ? { ...item, groupId: id } : item,
      ),
      groups: [
        ...current.groups.filter((group) => !group.itemIds.some((itemId) => selectedIds.includes(itemId))),
        {
          id,
          name: `그룹 ${current.groups.length + 1}`,
          itemIds: [...selectedIds],
        },
      ],
    }));
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
    setSaveState("saving");

    try {
      const response = await fetch(`/api/rooms/${initialRoom.shareId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scene }),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const payload = (await response.json()) as RoomPayload;
      setUpdatedAt(payload.updatedAt);
      updateSceneWithoutHistory(payload.scene);
    } catch {
      setSaveState("error");
    }
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
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

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPanningMode) {
      return;
    }

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const panStart = panStartRef.current;
    const viewport = viewportRef.current;

    if (!panStart || !viewport || panStart.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    viewport.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
    viewport.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const panStart = panStartRef.current;
    const viewport = viewportRef.current;

    if (!panStart || !viewport || panStart.pointerId !== event.pointerId) {
      return;
    }

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    panStartRef.current = null;
  }

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) {
      handOffWheelToPageAtScrollEdge(event);
      return;
    }

    event.preventDefault();
    const viewport = viewportRef.current;
    const previousZoom = zoom;
    const previousPercent = Math.round(previousZoom * 100);
    const roundedPercent = Math.round(previousPercent / 10) * 10;
    const nextPercent = clamp(roundedPercent + (event.deltaY > 0 ? -10 : 10), 25, 300);
    const nextZoom = nextPercent / 100;

    if (!viewport || nextZoom === previousZoom) {
      setZoom(nextZoom);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const anchorX = (viewport.scrollLeft + pointerX) / previousZoom;
    const anchorY = (viewport.scrollTop + pointerY) / previousZoom;

    setZoom(nextZoom);

    requestAnimationFrame(() => {
      viewport.scrollLeft = anchorX * nextZoom - pointerX;
      viewport.scrollTop = anchorY * nextZoom - pointerY;
    });
  }

  function handOffWheelToPageAtScrollEdge(event: ReactWheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;

    if (!viewport || event.deltaY === 0) {
      return;
    }

    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const isAtTop = viewport.scrollTop <= 0;
    const isAtBottom = viewport.scrollTop >= maxScrollTop - 1;
    const shouldHandOff = (event.deltaY < 0 && isAtTop) || (event.deltaY > 0 && isAtBottom);

    if (!shouldHandOff) {
      return;
    }

    const pageScroller = document.scrollingElement;

    if (!pageScroller || pageScroller.scrollHeight <= pageScroller.clientHeight) {
      return;
    }

    event.preventDefault();
    pageScroller.scrollTop += event.deltaY;
  }

  function setZoomPercent(value: number) {
    setZoom(clamp(value, 25, 300) / 100);
  }

  function nudgeZoom(delta: number) {
    setZoom((current) => {
      const roundedPercent = Math.round((current * 100) / 10) * 10;
      return clamp(roundedPercent + delta, 25, 300) / 100;
    });
  }

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

  return (
    <div className="flex min-h-dvh flex-col bg-[#f5f6f8] text-[#15181c]">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#d9dee7] bg-white px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{initialRoom.name ?? "Room Canvas"}</h1>
          <p className="text-xs text-[#66707d]">
            {scene.canvas.width}px x {scene.canvas.height}px · 저장 {formatDate(updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="command-button" type="button" onClick={copyShareLink}>
            <Copy size={16} aria-hidden />
            링크 복사
          </button>
          <button className="primary-button" type="button" onClick={saveRoom} disabled={saveState === "saving"}>
            {saveState === "saved" ? <Check size={16} aria-hidden /> : <Save size={16} aria-hidden />}
            {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : "저장"}
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[64px_minmax(0,1fr)_300px]">
        <aside className="flex gap-2 overflow-x-auto border-b border-[#d9dee7] bg-white p-2 lg:flex-col lg:border-b-0 lg:border-r">
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
          className={`canvas-viewport relative overflow-auto bg-[#e7ebf0] ${isPanningMode ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
          onWheel={handleViewportWheel}
        >
          {saveState === "error" ? (
            <div className="absolute right-4 top-4 z-10 rounded-md border border-[#f2b8ad] bg-[#fff3f0] px-3 py-2 text-sm text-[#b42318]">
              저장하지 못했습니다.
            </div>
          ) : null}

          <div className="canvas-content">
            <div
              className="stage-shell"
              style={{
                width: stagePixelWidth,
                height: stagePixelHeight,
              }}
            >
              <Stage
                ref={stageRef}
                width={stagePixelWidth}
                height={stagePixelHeight}
                scaleX={zoom}
                scaleY={zoom}
                onMouseDown={handleStagePointerDown}
                onMouseMove={handleStagePointerMove}
                onMouseUp={handleStagePointerUp}
                onTouchStart={handleStagePointerDown}
                onTouchMove={handleStagePointerMove}
                onTouchEnd={handleStagePointerUp}
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
                        shapeRefs.current[item.id] = node;
                      }}
                      x={item.x}
                      y={item.y}
                      rotation={item.rotation}
                      draggable={tool === "select"}
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
        </main>

        <aside className="border-t border-[#d9dee7] bg-white p-4 lg:border-l lg:border-t-0">
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

function topLeftFromNode(node: Konva.Node): Point {
  return {
    x: node.x(),
    y: node.y(),
  };
}

function setNodeTopLeft(node: Konva.Node, point: Point) {
  node.position(point);
}

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
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
