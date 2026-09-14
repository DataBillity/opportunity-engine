import { cn } from "@/lib/cn";

const LOGO_SRC = "/brand/databillity-horizontal-white.png";
const LOGO_ASPECT = 1024 / 140;

export function BrandMark({
  height = 22,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <img
      src={LOGO_SRC}
      alt="DataBillity"
      width={width}
      height={height}
      className={cn("w-auto shrink-0 select-none", className)}
      style={{ height }}
      draggable={false}
    />
  );
}

export function BrandLockup({
  height = 22,
  className,
  subtitle = "Opportunity Engine",
}: {
  height?: number;
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-center min-w-0", className)}>
      <BrandMark height={height} />
      <span className="mt-0.5 text-[10px] sm:text-[11px] font-semibold tracking-[0.08em] text-white/75 leading-none truncate">
        {subtitle}
      </span>
    </div>
  );
}
