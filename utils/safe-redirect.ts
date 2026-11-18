/**
 * Resolve a user-controlled `next` / `redirect` query value to a safe,
 * same-origin relative path.
 *
 * A naive `startsWith('/') && !startsWith('//')` check is NOT enough: the WHATWG
 * URL parser normalises backslashes to forward slashes for http(s) URLs, so
 * `/\evil.com` becomes `//evil.com` and resolves to `https://evil.com`.
 * Encoding tricks and `javascript:` URLs are likewise caught here because we
 * parse against the trusted origin and require the resulting origin to match.
 *
 * The returned value is always a relative path (`/path?query#hash`) so callers
 * rebuild the final URL from their own trusted origin.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  trustedOrigin: string,
  fallback = '/buyer',
): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;

  let url: URL;
  try {
    url = new URL(value, trustedOrigin);
  } catch {
    return fallback;
  }

  // Absolute external URLs, protocol-relative `//host` URLs, backslash tricks
  // (/\evil.com) and non-special schemes (javascript:, data:) all fail here.
  if (url.origin !== trustedOrigin) return fallback;

  // http(s) pathnames always begin with '/'; reject `//...` defensively in case
  // a future scheme is allowed through the origin check.
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
    return fallback;
  }

  // A control character or encoded newline would be normalised by the parser;
  // returning the parsed components keeps the Location header well-formed.
  return `${url.pathname}${url.search}${url.hash}`;
}
