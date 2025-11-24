import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { getGeminiRecommendations } from '../services/gemini';
import { getBulkAnimeDetails } from '../services/jikan';
import { updateAnimeStatus } from '../services/firebase';
import { AnimeCard } from '../components/AnimeCard';
import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { Anime } from '../types';

export const RecommendationsPage: React.FC = () => {
    const { user, userData, refreshUserData } = useContext(AuthContext);
    const [recommendations, setRecommendations] = useState<{anime: Anime, reason: string}[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateRecommendations = async () => {
        if (!userData || !user) return;
        setLoading(true);
        setError(null);
        setRecommendations([]);

        try {
            // 1. Gather context
            const watchedList = Object.values(userData.watchlist)
                .filter(a => a.status === 'completed' || a.status === 'watching')
                .map(a => a.title)
                .slice(0, 10); // Limit to last 10 for prompt token economy

            // 2. Call Gemini
            const geminiResults = await getGeminiRecommendations(userData, watchedList);

            if (geminiResults.length === 0) {
                setError("AI couldn't generate recommendations at the moment. Please try again.");
                setLoading(false);
                return;
            }

            // 3. Hydrate with Jikan Data (Images, etc)
            const titles = geminiResults.map(r => r.title);
            const animeDetails = await getBulkAnimeDetails(titles);

            // Match details back to reasons (rough matching by index or title if possible, simple index map here for demo)
            // Note: Jikan search might return slightly different title, but usually top result is correct.
            const combined = animeDetails.map((details, index) => ({
                anime: details,
                reason: geminiResults[index]?.reason || "Recommended for you"
            }));

            setRecommendations(combined);

        } catch (err) {
            console.error(err);
            setError("Something went wrong while fetching recommendations.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddToList = async (anime: Anime, status: any) => {
        if (!user) return;
        await updateAnimeStatus(user.uid, anime as any, status);
        await refreshUserData();
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
                <div className="inline-block p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full mb-4">
                    <Sparkles className="w-10 h-10 text-indigo-400" />
                </div>
                <h1 className="text-4xl font-bold text-white mb-4">AI Curator</h1>
                <p className="text-slate-400 max-w-2xl mx-auto mb-8">
                    Gemini analyzes your interests ({userData?.interests.join(', ')}) and watch history 
                    to hand-pick the perfect series for you.
                </p>
                
                <button
                    onClick={generateRecommendations}
                    disabled={loading}
                    className={`
                        inline-flex items-center space-x-2 px-8 py-4 rounded-xl text-lg font-bold shadow-xl transition transform active:scale-95
                        ${loading 
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/30'
                        }
                    `}
                >
                    {loading ? (
                        <>
                            <RefreshCw className="animate-spin" />
                            <span>Analyzing tastes...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles />
                            <span>Generate Recommendations</span>
                        </>
                    )}
                </button>

                {!process.env.API_KEY && !loading && (
                    <div className="mt-4 text-xs text-yellow-500 flex items-center justify-center gap-1">
                        <AlertTriangle size={14} />
                        <span>Running in Demo Mode (Mock Data) because API_KEY is missing.</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg text-center mb-8">
                    {error}
                </div>
            )}

            {recommendations.length > 0 && (
                <div className="animate-fade-in-up">
                    <h2 className="text-2xl font-semibold text-white mb-6 border-l-4 border-indigo-500 pl-4">Top Picks for You</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {recommendations.map(({ anime, reason }) => {
                             const existing = userData?.watchlist[anime.mal_id];
                             return (
                                <AnimeCard
                                    key={anime.mal_id}
                                    anime={anime}
                                    currentStatus={existing?.status}
                                    onUpdateStatus={handleAddToList}
                                    recommendationReason={reason}
                                />
                             );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};