import { NewRoomForm } from "@/components/NewRoomForm";

export default function Home() {
  return (
    <div className="min-h-full bg-[#f6f7f9] text-[#15181c]">
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl items-center px-5 py-8">
        <NewRoomForm />
      </main>
    </div>
  );
}
