import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import AppFrame from "@/components/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presence",
  description: "Sign in, sign out, and request leave.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=optional"
        />
      </head>
      <body>
        <div className="grain-overlay" aria-hidden />
        <AppFrame>{children}</AppFrame>
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 6000,
            style: {
              background: "#1c2321",
              color: "#f7f6f3",
              fontSize: "14px",
              borderRadius: "10px",
            },
          }}
        />
      </body>
    </html>
  );
}
