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

const themeInitScript = `
(() => {
  try {
    const mode = localStorage.getItem("bocchisns_theme") || "system";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = mode === "dark" || (mode === "system" && prefersDark) ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  } catch {
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export const metadata: Metadata = {
  title: "Hollog",
  description: "Local-first personal timeline for notes, clips, and saved media",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hollog",
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
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-secondary text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background shadow-2xl sm:border-x sm:border-border relative">
          {children}
        </div>
      </body>
    </html>
  );
}
