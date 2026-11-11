import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  /** Height of the coloured icon in pixels. The wordmark scales with it. */
  height?: number;
  className?: string;
};

/**
 * The official FuhsiMarket lock-up: the coloured icon with the official
 * wordmark beside it. Always use the files in `public/fuhsimarket-brand/logo/`
 * instead of retyping the name so the brand stays consistent.
 *
 * `height` controls the icon; the wordmark is sized from the same value so the
 * two pieces stay in proportion at every size.
 */
export default function BrandLogo({ href = '/', height = 40, className = '' }: BrandLogoProps) {
  const wordmarkHeight = Math.round(height * 0.58);

  return (
    <Link
      href={href}
      aria-label="FuhsiMarket home"
      className={`inline-flex select-none items-center gap-2.5 ${className}`}
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fuhsimarket-brand/logo/fuhsimarket-wordmark-color.svg"
        alt="FuhsiMarket"
        height={wordmarkHeight}
        draggable={false}
        style={{ height: wordmarkHeight, width: 'auto' }}
        className="shrink-0"
      />
    </Link>
  );
}
