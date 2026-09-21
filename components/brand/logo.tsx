export function Logo({
  tone = "ink",
  className = "",
}: {
  tone?: "ink" | "light"
  className?: string
}) {
  const mark = tone === "light" ? "#F6F1E6" : "#16324F"
  const word = tone === "light" ? "text-[#f6f1e6]" : "text-foreground"

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={mark} />
        <path
          d="M8 22.5 13.2 9h2.3L21 22.5h-2.3l-1.1-2.8h-6.1l-1.1 2.8H8Zm4.2-4.6h4.3L14.3 12.6h-.1l-2 5.3Z"
          fill={tone === "light" ? "#16324F" : "#F6F1E6"}
        />
        <rect x="8" y="24.2" width="16" height="1.6" rx="0.8" fill="#C4A15A" />
      </svg>
      <span className={`leading-tight ${word}`}>
        <span className="block font-display text-base tracking-tight">WOLOYEM</span>
        <span className="block text-[10px] tracking-[0.22em] text-brass uppercase">Score</span>
      </span>
    </span>
  )
}
