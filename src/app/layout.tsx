import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bocchi SNS",
  description: "Local-first personal SNS home screen powered by Next.js and IndexedDB",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Bocchi SNS",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-secondary text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background shadow-2xl sm:border-x sm:border-border relative">
          {children}
        </div>
      </body>
    </html>
  );
}
