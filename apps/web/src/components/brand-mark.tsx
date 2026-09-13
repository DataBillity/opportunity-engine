import { cn } from "@/lib/cn";

export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const icon = Math.round(size * 0.5);
  return (
    <div
      className={cn("rounded-lg bg-[var(--billity-bright)] flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    </div>
  );
}
