import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Local Taste - Discover Must-Try Food in Every City</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-violet-50">
        {/* Nav */}
        <nav className="px-8 py-6 bg-white shadow-sm">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="text-2xl font-bold text-dark">
              🍜 <span className="text-primary">Local Taste</span>
            </div>
            <div className="flex gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="px-6 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors">
                    Get Started
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <div className="flex items-center gap-4">
                  <Link href="/dashboard">
                    <button className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors">
                      Open App
                    </button>
                  </Link>
                  <UserButton afterSignOutUrl="/" />
                </div>
              </SignedIn>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="px-8 py-24 text-center">
          <div className="max-w-4xl mx-auto">
            <div className="text-7xl mb-6">🌍</div>
            <h1 className="text-5xl font-bold text-dark mb-6">
              Eat like a local,<br />wherever you are
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Tell us the city. Our AI finds the 5 dishes you <em>must</em> try — then ranks the best places to eat them, using Google Maps ratings, review counts, and local knowledge.
            </p>
            <div className="flex gap-4 justify-center">
              <SignedOut>
                <SignUpButton mode="modal">
                  <button className="px-8 py-4 bg-primary text-white text-lg rounded-lg hover:bg-purple-700 transition-colors shadow-lg">
                    Start Exploring
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link href="/explore">
                  <button className="px-8 py-4 bg-primary text-white text-lg rounded-lg hover:bg-purple-700 transition-colors shadow-lg">
                    Start Exploring
                  </button>
                </Link>
              </SignedIn>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-8 py-20 bg-white">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-dark mb-12">How it works</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-8">
                <div className="text-5xl mb-4">🏙️</div>
                <h3 className="text-xl font-semibold text-dark mb-2">1. Enter a city</h3>
                <p className="text-gray-600">Type any city in the world. Our AI researches its food scene in real time.</p>
              </div>
              <div className="text-center p-8">
                <div className="text-5xl mb-4">🍽️</div>
                <h3 className="text-xl font-semibold text-dark mb-2">2. Get top-5 dishes</h3>
                <p className="text-gray-600">Receive the 5 most iconic, must-try specialities — ranked with context on why they matter.</p>
              </div>
              <div className="text-center p-8">
                <div className="text-5xl mb-4">📍</div>
                <h3 className="text-xl font-semibold text-dark mb-2">3. Find the best spot</h3>
                <p className="text-gray-600">Click any dish to get 5 restaurants, AI-ranked by Google rating, review count, and local reputation.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Passport feature */}
        <section className="px-8 py-20 bg-gradient-to-r from-purple-50 to-violet-50">
          <div className="max-w-4xl mx-auto text-center">
            <div className="text-5xl mb-4">🛂</div>
            <h2 className="text-3xl font-bold text-dark mb-4">Your Food Passport</h2>
            <p className="text-xl text-gray-600 mb-8">
              Log every dish you try, where you ate it, and your personal rating. Build a lifetime record of your culinary adventures.
            </p>
            <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-3xl font-bold text-primary">∞</p>
                <p className="text-sm text-gray-500">Cities</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-3xl font-bold text-primary">5★</p>
                <p className="text-sm text-gray-500">Your ratings</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-3xl font-bold text-primary">📝</p>
                <p className="text-sm text-gray-500">Notes & memories</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-8 py-20 bg-dark text-white text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready to eat like a local?</h2>
            <p className="text-lg mb-8 opacity-80">Join food lovers discovering the world one dish at a time.</p>
            <SignUpButton mode="modal">
              <button className="px-8 py-4 bg-accent text-dark font-semibold text-lg rounded-lg hover:bg-violet-300 transition-colors shadow-lg">
                Create your Food Passport
              </button>
            </SignUpButton>
          </div>
        </section>

        <footer className="px-8 py-6 bg-gray-900 text-gray-400 text-center text-sm">
          <p>© 2025 Local Taste. AI-powered food discovery. Always verify opening hours before visiting.</p>
        </footer>
      </div>
    </>
  );
}
