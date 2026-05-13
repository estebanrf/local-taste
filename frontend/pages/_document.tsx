import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="description" content="Discover the must-try dishes in any city and find where locals actually eat them. Your personal food passport for culinary adventures around the world." />
        <meta property="og:title" content="Local Taste — Eat like a local, wherever you are" />
        <meta property="og:description" content="Discover the must-try dishes in any city and find where locals actually eat them. Your personal food passport for culinary adventures around the world." />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#9B6EC8" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
