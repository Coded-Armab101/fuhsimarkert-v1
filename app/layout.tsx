import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import PwaInstall from './PwaInstall';

export const metadata: Metadata = {
  title: {
    default: 'FuhsiMarket | Buy and sell simply with FUHSI students',
    template: '%s | FuhsiMarket',
  },
  description: 'Buy and sell simply with FUHSI students. A campus marketplace for textbooks, gadgets, food and hostel essentials, protected by escrow.',
  applicationName: 'FuhsiMarket',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FuhsiMarket',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/fuhsimarket-icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'FuhsiMarket',
    description: 'Buy and sell simply with FUHSI students.',
    siteName: 'FuhsiMarket',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#DE6437',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#fffdfa] text-[#251d18] antialiased" suppressHydrationWarning>
        {/* CartProvider keeps cart data available for the buyer side */}
        <CartProvider>
          {children}
          <PwaInstall />
        </CartProvider>
      </body>
    </html>
  );
}
