import Image from "next/image";

export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#0B0B0C] overflow-hidden">
      {/* Ambient glow behind the logo */}
      <div className="absolute h-72 w-72 rounded-full bg-[rgba(57,255,20,0.06)] blur-[80px]" />

      <div
        className="relative flex flex-col items-center gap-7"
      >
        {/* Logo */}
        <div className="h-[52px] w-[210px]">
          <Image
            src="/streak-logo-header-tight.png"
            alt="Streak"
            width={220}
            height={54}
            className="h-full w-full object-contain"
            priority
          />
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#39FF14]"
              style={{
                animation: `dotPulse 1.4s ease-in-out ${i * 0.18}s infinite`,
                opacity: 0.35,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
