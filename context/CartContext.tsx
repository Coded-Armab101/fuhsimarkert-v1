'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  title: string;
  /** Kobo, matching `products.price`. Format with `formatNaira` to display. */
  price: number;
  image_url?: string;
  seller_id: string;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: any) => void;
  /** Decrement one unit; removes the line entirely at quantity 1. */
  decreaseQuantity: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  /** Quantity of an item already in the cart, or 0 if absent. */
  getQuantity: (productId: string) => number;
  totalAmount: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load saved cart items from browser storage when page loads
  useEffect(() => {
    const saved = localStorage.getItem('fuhsi_cart');
    if (saved) {
      try {
        setCart(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Automatically save to browser storage whenever cart changes
  useEffect(() => {
    localStorage.setItem('fuhsi_cart', JSON.stringify(cart));
  }, [cart]);

  // Function to add a product to the cart
  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          title: product.title,
          price: Number(product.price),
          image_url: product.image_url,
          seller_id: product.seller_id,
          quantity: 1,
        },
      ];
    });
  };

  // Function to remove an item from the cart
  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  // Decrement one unit; drop the line entirely when it would reach 0.
  const decreaseQuantity = (productId: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // Quantity of an item in the cart, or 0 if it is not there yet.
  const getQuantity = (productId: string) => {
    return cart.find((item) => item.id === productId)?.quantity ?? 0;
  };

  // Function to clear the cart
  const clearCart = () => setCart([]);

  // Calculate total price (kobo); the badge count is the number of DISTINCT
  // products in the cart (one per unique product), not the summed quantity.
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const totalItems = cart.length;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        decreaseQuantity,
        removeFromCart,
        clearCart,
        getQuantity,
        totalAmount,
        totalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Custom Hook to use cart anywhere
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}