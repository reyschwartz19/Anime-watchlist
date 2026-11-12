'use client';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="app-shell stack" role="alert"><h1>This page could not load</h1>
    <p>Your account or saved data is temporarily unavailable. Retry to continue.</p>
    <button type="button" onClick={retry}>Retry</button>
  </main>;
}
