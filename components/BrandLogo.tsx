import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  height?: number;
  className?: string;
};

/**
 * The official FuhsiMarket horizontal lock-up from
 * `public/fuhsimarket-brand/logo/`. Always use this instead of retyping the
 * wordmark so the brand stays consistent across pre-sign-in screens.
 */
export default function BrandLogo({ href = '/', height = 34, className = '' }: BrandLogoProps) {
  return (
    <Link
      href={href}
      aria-label="FuhsiMarket home"
      className={`inline-flex items-center ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fuhsimarket-brand/logo/fuhsimarket-horizontal-color.svg"
        alt="FuhsiMarket"
        height={height}
        style={{ height, width: 'auto' }}
      />
    </Link>
  );
}
