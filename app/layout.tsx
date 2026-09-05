import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';

export const metadata: Metadata = {
  title: 'FUHSI Market',
  description: 'Campus marketplace for FUHSI students',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        {/* CartProvider keeps cart data available for the buyer side */}
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}