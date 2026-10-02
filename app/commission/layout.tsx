import { Raleway, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import { requireAppAccess } from "@/lib/app-access";

// Commission design system typography (DESIGN-COMMISSION.md):
//  - Raleway is the WGI brand UI font, applied to all commission page content.
//  - JetBrains Mono is exposed as a CSS variable so components opt in for
//    monetary values and identifiers via `font-family: var(--font-jetbrains-mono)`.
// Scoped to /commission/** only — the shared hub Navbar sits outside the wrapper
// and keeps its own font.
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Auth and app access are verified by middleware; this server-side check is
// defence-in-depth and gives unauthenticated direct hits a clean redirect.
export default async function CommissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAppAccess("commission");

  return (
    <>
      <Navbar />
      <SessionTimeout />
      <div className={`${raleway.className} ${jetbrainsMono.variable} pt-16`}>{children}</div>
    </>
  );
}
