import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { VoiceProvider } from "@/context/VoiceContext";
import { AuraVoiceWidget } from "@/components/qa/AuraVoiceWidget";

// Force all pages to be dynamically rendered (avoid useSearchParams SSG errors)
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PitchVision | Compliance Intelligence Platform",
  description: "AI-powered call quality monitoring and compliance analytics for sales teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <VoiceProvider>
            {children}
            <AuraVoiceWidget />
          </VoiceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
