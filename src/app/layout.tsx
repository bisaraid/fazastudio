import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ThemeDefaults } from "@/components/layout/theme-defaults";
import { PostHogProvider } from "@/components/PostHogProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Faza Studio",
  description: "Buat konten viral dengan AI. Script, Audio, Subtitle, Video — semua otomatis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* Normalisasi nilai tema lama ("system") sekali setelah mount. */}
          <ThemeDefaults />
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}