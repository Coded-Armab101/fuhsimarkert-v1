import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FuhsiMarket',
    short_name: 'FuhsiMarket',
    description: 'A simple campus marketplace for FUHSI students.',
    start_url: '/buyer',
    display: 'standalone',
    background_color: '#fffdfa',
    theme_color: '#ef6b3b',
    icons: [
      { src: '/fuhsimarket-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/fuhsimarket-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
