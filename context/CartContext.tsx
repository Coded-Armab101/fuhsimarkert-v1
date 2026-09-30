// context/CartContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface CartItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  image?: string | null;
  image_url?: string | null;
  seller_id?: string | null;
}

export type AddToCartInput = Omit<CartItem, 'quantity'> & { quantity?: number };

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: AddToCartInput) => void;
  addToCartOnce: (item: AddToCartInput) => void;
  removeFromCart: (id: string) => void;
  removeItems: (ids: string[]) => void;
  decreaseQuantity: (id: string) => void;
  clearCart: () => void;
  updateQuantity: (id: string, quantity: number) => void;
  getQuantity: (id: string) => number;
  totalAmount: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error("Failed to parse local cart:", e);
      }
    }
  }, []);

  const saveCart = (updatedCart: CartItem[]) => {
    setCart(updatedCart);
    localStorage.setItem("cart", JSON.stringify(updatedCart));
  };

  const addToCart = (item: AddToCartInput) => {
    const qty = item.quantity || 1;
    const existingIndex = cart.findIndex((i) => i.id === item.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += qty;
      saveCart(updated);
    } else {
      saveCart([...cart, { ...item, quantity: qty }]);
    }
  };

  const removeFromCart = (id: string) => {
    saveCart(cart.filter((item) => item.id !== id));
  };

  const removeItems = (ids: string[]) => {
    const updated = cart.filter((item) => !ids.includes(item.id));
    saveCart(updated);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    const updated = cart.map((item) =>
      item.id === id ? { ...item, quantity } : item
    );
    saveCart(updated);
  };

  const decreaseQuantity = (id: string) => {
    const item = cart.find((i) => i.id === id);
    if (item) {
      updateQuantity(id, item.quantity - 1);
    }
  };

  const addToCartOnce = (item: AddToCartInput) => {
    const existing = cart.find((i) => i.id === item.id);
    if (!existing) {
      saveCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const getQuantity = (id: string) => {
    const item = cart.find((i) => i.id === id);
    return item ? item.quantity : 0;
  };

  const clearCart = () => {
    saveCart([]);
  };

  // Calculate total price of all items in cart
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        addToCartOnce,
        removeFromCart,
        removeItems,
        decreaseQuantity,
        clearCart,
        updateQuantity,
        getQuantity,
        totalAmount,
        totalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
