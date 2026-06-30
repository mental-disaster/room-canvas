"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, DoorOpen } from "lucide-react";

export function NewRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("새 방 배치");
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(800);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function createRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, width, height }),
      });

      if (!response.ok) {
        throw new Error("Room creation failed");
      }

      const data = (await response.json()) as { shareId: string };
      router.push(`/rooms/${data.shareId}`);
    } catch {
      setError("방을 만들지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="max-w-2xl">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-[#1c4f8f] text-white">
          <DoorOpen size={22} aria-hidden />
        </div>
        <h1 className="text-4xl font-semibold tracking-normal text-[#111418] sm:text-5xl">
          Room Canvas
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#59616d]">
          이사 전 방 크기를 px 단위 캔버스로 만들고, 벽과 가구 배치를 공유 링크로 함께 편집합니다.
        </p>
      </div>

      <form
        onSubmit={createRoom}
        className="w-full rounded-lg border border-[#d9dee7] bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-[#252a31]">
            이름
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-md border border-[#cbd2dc] px-3 text-sm outline-none transition focus:border-[#1c4f8f] focus:ring-2 focus:ring-[#cfe0f6]"
              maxLength={60}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-[#252a31]">
              Width px
              <input
                type="number"
                min={100}
                max={8000}
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
                className="h-11 rounded-md border border-[#cbd2dc] px-3 text-sm outline-none transition focus:border-[#1c4f8f] focus:ring-2 focus:ring-[#cfe0f6]"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#252a31]">
              Height px
              <input
                type="number"
                min={100}
                max={8000}
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
                className="h-11 rounded-md border border-[#cbd2dc] px-3 text-sm outline-none transition focus:border-[#1c4f8f] focus:ring-2 focus:ring-[#cfe0f6]"
              />
            </label>
          </div>

          {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}

          <button
            type="submit"
            disabled={isCreating}
            className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1c4f8f] px-4 text-sm font-semibold text-white transition hover:bg-[#173f72] disabled:cursor-not-allowed disabled:bg-[#8ba9cc]"
          >
            {isCreating ? "생성 중" : "시작"}
            <ArrowRight size={17} aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
