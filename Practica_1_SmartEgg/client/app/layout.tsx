import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { ThemeProvider } from "@/lib/state/ThemeProvider";
import "@/styles/globals.css";

const themeBootScript = `
  try {
    const stored = localStorage.getItem("smartegg.theme");
    const theme = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
    document.documentElement.classList.remove("light", "dark", "system");
    document.documentElement.classList.add(theme);
  } catch (_) {}
`;

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SmartEgg · Control Core",
  description:
    "Consola de control de la incubadora inteligente SmartEgg — Nodo 01 · Lote A.",
  icons: { icon: "/smartegg-mark.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} system antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#f9fafc" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
