import type { Metadata } from "next";
import { Itim, Nunito } from "next/font/google";
import "./globals.css";

// Text font. The exact font of the reference is unknown, so this is a close
// rounded handwritten one; swapping it is a one-line change.
const itim = Itim({
  variable: "--font-itim",
  weight: "400",
  subsets: ["latin"],
});

// Numbers and amounts use a rounded sans in bold, as in the reference.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Household finances",
  description: "Shared household finances",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${itim.variable} ${nunito.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
