import { useUser, UserButton, Protect } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";
import PageTransition from "./PageTransition";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useUser();
  const router = useRouter();

  const isActive = (path: string) => router.pathname === path || router.pathname.startsWith(path + "/");

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors ${
        isActive(href) ? "text-primary" : "text-gray-600 hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <Protect fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to sign in...</p>
        </div>
      </div>
    }>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-8">
                <Link href="/explore" className="flex items-center">
                  <h1 className="text-xl font-bold text-dark">
                    🍜 <span className="text-primary">Local Taste</span>
                  </h1>
                </Link>
                <div className="hidden md:flex items-center gap-6">
                  {navLink("/explore", "Explore")}
                  {navLink("/plan", "Plan")}
                  {navLink("/passport", "Passport")}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline text-sm text-gray-600">
                  {user?.firstName || user?.emailAddresses[0]?.emailAddress}
                </span>
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
            {/* Mobile nav */}
            <div className="md:hidden flex items-center gap-4 pb-3">
              {navLink("/explore", "Explore")}
              {navLink("/plan", "Plan")}
              {navLink("/passport", "Passport")}
            </div>
          </div>
        </nav>

        <main className="flex-1">
          <PageTransition>{children}</PageTransition>
        </main>

        <footer className="bg-white border-t mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-xs text-gray-500 text-center">
              © 2026 Local Taste. Discover the world, one dish at a time — always verify opening hours before visiting.
            </p>
          </div>
        </footer>
      </div>
    </Protect>
  );
}
