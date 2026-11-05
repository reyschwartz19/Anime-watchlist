'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="app-shell stack" role="alert"><h1>This page could not load</h1>
    <p>Try again. If this is the first setup, check the server environment and database migrations.</p>
    <button type="button" onClick={reset}>Try again</button>
  </main>;
}
