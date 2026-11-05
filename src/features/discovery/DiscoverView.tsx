'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AnimeCard } from '@/features/library/AnimeCard';
import { FeedbackControls } from '@/features/feedback/FeedbackControls';
import { generateRecommendations, type RecommendationView } from './actions';

export function DiscoverView() {
  const [recommendations, setRecommendations] = useState<RecommendationView[]>([]);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [generation, setGeneration] = useState(0);

  function generate() {
    setMessage('');
    startTransition(async () => {
      const result = await generateRecommendations();
      if (result.ok) {
        setRecommendations(result.recommendations);
        setGeneration((current) => current + 1);
      } else setMessage(result.message);
    });
  }

  return <div className="stack">
    <p>Get recommendations based on your interests, favorites, watch history and feedback.</p>
    <div className="row wrap">
      <button type="button" className="button primary" disabled={pending} onClick={generate}>{pending ? 'Finding recommendations…' : recommendations.length ? 'Find new recommendations' : 'Generate recommendations'}</button>
      <Link href="/profile">Edit preferences</Link>
      <Link href="/search">Search anime</Link>
    </div>
    <p role="status">{message}</p>
    {recommendations.length ? <div className="anime-grid">
      {recommendations.map((pick) => <AnimeCard key={`${generation}-${pick.anime.mal_id}`} anime={pick.anime} currentStatus={pick.currentStatus} reason={pick.reason}>
        <FeedbackControls animeId={pick.anime.mal_id} initialValue={pick.feedback} />
      </AnimeCard>)}
    </div> : <p className="muted">Generate a set of picks when you are ready. Your existing library stays in My List.</p>}
  </div>;
}
