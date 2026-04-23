import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";

export default function AdvisorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <SessionTimeout />
      {/* pt-16 offsets the fixed 64px navbar so content is never hidden */}
      <div className="pt-16">{children}</div>
    </>
  );
}
