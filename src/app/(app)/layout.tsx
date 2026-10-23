import { Sidebar } from "./sidebar";

// The shell for every signed-in page. It is not a security boundary: each page
// still validates the session itself.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
