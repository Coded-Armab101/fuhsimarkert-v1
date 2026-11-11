import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  /** Height of the coloured icon in pixels. The wordmark scales with it. */
  height?: number;
  className?: string;
};

/**
 * FuhsiMarket lock-up: the coloured icon with a plain-text wordmark beside it.
 *
 * The wordmark is real text rather than the SVG artwork so it is always legible
 * (the SVG relied on a white mask that disappeared on light backgrounds) and
 * stays crisp at every size. Keep the gap tight so the two read as one logo.
 */
export default function BrandLogo({ href = '/', height = 40, className = '' }: BrandLogoProps) {
  const textSize = Math.max(15, Math.round(height * 0.5));

  return (
    <Link
      href={href}
      aria-label="FuhsiMarket home"
      className={`inline-flex select-none items-center gap-1.5 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fuhsimarket-brand/logo/fuhsimarket-icon-color.svg"
        alt=""
        aria-hidden="true"
        height={height}
        width={height}
        draggable={false}
        style={{ height, width: height }}
        className="shrink-0 drop-shadow-[0_3px_8px_rgba(222,100,55,0.18)]"
      />
      <span
        className="shrink-0 font-black leading-none tracking-tight text-[#2C2C2C]"
        style={{ fontSize: textSize }}
      >
        Fuhsi<span className="text-[#DE6437]">Market</span>
      </span>
    </Link>
  );
}
