import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-container min-h-screen bg-neutral-900">
      {children}
    </div>
  );
}