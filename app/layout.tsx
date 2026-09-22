import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import PwaInstall from './PwaInstall';

export const metadata: Metadata = {
  title: { default: 'FuhsiMarket | Campus shopping made simple', template: '%s | FuhsiMarket' },
  description: 'Buy and sell simply with FUHSI students.',
  applicationName: 'FuhsiMarket',
  appleWebApp: { capable: true, title: 'FuhsiMarket', statusBarStyle: 'default' },
  icons: { icon: '/fuhsimarket-icon.svg', apple: '/fuhsimarket-icon.svg' },
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
