import { AppProvider } from "@/components/app-provider";
import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <main className="mx-auto w-full max-w-lg px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-32">{children}</main>
      <BottomNav />
    </AppProvider>
  );
}
