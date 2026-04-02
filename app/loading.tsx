import Image from "next/image";

export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#0B0B0C]">
      <div className="flex flex-col items-center gap-6">
        <div className="h-[46px] w-[188px] sm:h-[54px] sm:w-[220px] animate-pulse">
          <Image
            src="/streak-logo-header-tight.png"
            alt="Streak"
            width={220}
            height={54}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <div className="flex items-center gap-3 text-[#A1A1AA]">
          <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-medium tracking-wide">Cooking magic...</span>
        </div>
      </div>
    </div>
  );
}
