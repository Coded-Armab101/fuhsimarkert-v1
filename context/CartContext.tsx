// context/CartContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase";

export interface CartItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  image?: string | null;
  image_url?: string | null;
  seller_id?: string | null;
  unit?: string | null;
  delivery_fee_kobo?: number | null;
}

export type AddToCartInput = Omit<CartItem, 'quantity'> & { quantity?: number };

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: AddToCartInput) => void;
  addToCartOnce: (item: AddToCartInput) => void;
  /** Replace the whole cart with one item — used by "Buy now" so a previous
   *  account's saved items can never be charged by accident. */
  startCartWith: (item: AddToCartInput) => void;
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

const CART_KEY = "cart";
const CART_OWNER_KEY = "cart_owner_id";

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const supabase = useMemo(() => createClient(), []);
  // Which account the persisted cart belongs to. A shared browser (a seller
  // testing with a second account, or two students on one phone) must never
  // inherit the previous account's cart — otherwise an old listing owned by the
  // new account can sit in the cart and trip the self-purchase guard.
  const ownerRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearPersistedCart = () => {
      setCart([]);
      localStorage.removeItem(CART_KEY);
    };

    const adoptOwner = (userId: string) => {
      const previous = ownerRef.current;
      if (userId !== "guest" && previous && previous !== "guest" && previous !== userId) {
        clearPersistedCart();
      }
      ownerRef.current = userId;
      localStorage.setItem(CART_OWNER_KEY, userId);
    };

    const loadCart = async () => {
      const savedCart = localStorage.getItem(CART_KEY);
      const savedOwner = localStorage.getItem(CART_OWNER_KEY);
      ownerRef.current = savedOwner;

      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const userId = user?.id ?? "guest";

      // A cart tagged with a different signed-in account is stale: drop it.
      // An untagged/guest cart is kept so items added before login survive.
      if (savedOwner && savedOwner !== "guest" && savedOwner !== userId) {
        clearPersistedCart();
      } else if (savedCart) {
        try {
          setCart(JSON.parse(savedCart));
        } catch (e) {
          console.error("Failed to parse local cart:", e);
        }
      }

      adoptOwner(userId);
    };

    loadCart();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        ownerRef.current = "guest";
        localStorage.setItem(CART_OWNER_KEY, "guest");
        clearPersistedCart();
        return;
      }
      adoptOwner(session?.user?.id ?? "guest");
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

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

  const startCartWith = (item: AddToCartInput) => {
    saveCart([{ ...item, quantity: item.quantity || 1 }]);
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
        startCartWith,
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
