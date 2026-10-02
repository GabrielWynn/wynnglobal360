import { Raleway } from "next/font/google";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import SubNav from "@/components/model-portfolio/SubNav";
import { requireAppAccess } from "@/lib/app-access";
import "./model-portfolio.css";

const mpFont = Raleway({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default async function ModelPortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Users with the Model Portfolio app only; admins also get the admin tab
  const hubUser = await requireAppAccess("model-portfolio");
  const isAdmin = hubUser.role === "admin";

  return (
    <>
      {/* Fixed nav bars would repeat on every printed page — hidden in print */}
      <div className="mp-no-print">
        <Navbar />
        {/* 40 px sub-nav sits directly below the 64 px main navbar */}
        <SubNav isAdmin={isAdmin} />
      </div>
      <SessionTimeout />
      {/* pt-[104px] = 64 px navbar + 40 px sub-nav */}
      <div
        className={`mp-shell pt-[104px] min-h-screen ${mpFont.className}`}
        style={{ background: "var(--wgi-bg)" }}
      >
        {children}
      </div>
    </>
  );
}
