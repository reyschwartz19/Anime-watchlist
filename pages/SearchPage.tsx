import React, { useState, useContext } from 'react';
import { searchAnime } from '../services/jikan';
import { Anime } from '../types';
import { AnimeCard } from '../components/AnimeCard';
import { AuthContext } from '../context/AuthContext';
import { updateAnimeStatus } from '../services/firebase';
import { Search, Loader } from 'lucide-react';

export const SearchPage: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Anime[]>([]);
    const [loading, setLoading] = useState(false);
    const { user, userData, refreshUserData } = useContext(AuthContext);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        const data = await searchAnime(query);
        setResults(data);
        setLoading(false);
    };

    const handleAddToList = async (anime: Anime, status: any) => {
        if (!user) return;
        await updateAnimeStatus(user.uid, anime as any, status);
        await refreshUserData();
    };

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Discover Anime</h1>
            
            <form onSubmit={handleSearch} className="relative mb-10">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for titles (e.g. Attack on Titan)..."
                    className="w-full bg-slate-800 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                />
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={24} />
                <button 
                    type="submit" 
                    className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-lg font-medium transition"
                    disabled={loading}
                >
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {loading && (
                <div className="flex justify-center py-12">
                    <Loader className="animate-spin text-indigo-500" size={40} />
                </div>
            )}

            {!loading && results.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {results.map(anime => {
                        // Check if already in list
                        const existing = userData?.watchlist[anime.mal_id];
                        return (
                            <AnimeCard 
                                key={anime.mal_id} 
                                anime={anime} 
                                currentStatus={existing?.status}
                                onUpdateStatus={handleAddToList}
                            />
                        );
                    })}
                </div>
            )}

            {!loading && results.length === 0 && query && (
                <div className="text-center text-slate-500">
                    No results found. Try a different term.
                </div>
            )}
        </div>
    );
};