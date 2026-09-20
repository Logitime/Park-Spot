import type { Metadata, Viewport } from "next";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParkSpot — Car Parking Guidance System",
  description:
    "Find, reserve, and navigate to available parking spots in real time.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ParkSpot",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased overflow-x-hidden">
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900 overflow-x-hidden w-full max-w-full" suppressHydrationWarning>
        <Navbar />
        <div className="flex flex-1 flex-col w-full max-w-full overflow-x-hidden">{children}</div>
        <footer className="border-t border-slate-200 bg-white py-6">
          <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-400 sm:px-6">
            ParkSpot · Car Parking Guidance System · Demo build
          </div>
        </footer>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}