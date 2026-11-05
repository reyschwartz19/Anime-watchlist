import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { updateUserInterests } from '../services/firebase';
import { GENRES } from '../types';
import { Check } from 'lucide-react';

export const OnboardingPage: React.FC = () => {
    const { user, refreshUserData } = useContext(AuthContext);
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [favoriteInput, setFavoriteInput] = useState('');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    const toggleGenre = (genre: string) => {
        if (selectedGenres.includes(genre)) {
            setSelectedGenres(selectedGenres.filter(g => g !== genre));
        } else {
            setSelectedGenres([...selectedGenres, genre]);
        }
    };

    const addFavorite = (e: React.FormEvent) => {
        e.preventDefault();
        if (favoriteInput.trim()) {
            setFavorites([...favorites, favoriteInput.trim()]);
            setFavoriteInput('');
        }
    };

    const removeFavorite = (fav: string) => {
        setFavorites(favorites.filter(f => f !== fav));
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (selectedGenres.length === 0) {
            alert("Please select at least one genre.");
            return;
        }

        setSubmitting(true);
        try {
            await updateUserInterests(user.uid, selectedGenres, favorites);
            await refreshUserData(); // Update context
            navigate('/');
        } catch (error) {
            console.error("Onboarding failed", error);
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-2xl p-6 md:p-8 shadow-xl">
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Welcome! Let's get to know you.</h1>
                <p className="text-slate-400 mb-8">This helps our AI recommend the best anime for you.</p>

                {/* Genres */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-3">Select Genres you like</h2>
                    <div className="flex flex-wrap gap-2">
                        {GENRES.map(genre => (
                            <button
                                key={genre}
                                onClick={() => toggleGenre(genre)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                                    selectedGenres.includes(genre)
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-800'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                            >
                                {genre}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Favorites */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-3">Any all-time favorites? (Optional)</h2>
                    <form onSubmit={addFavorite} className="flex gap-2 mb-3">
                        <input
                            type="text"
                            value={favoriteInput}
                            onChange={(e) => setFavoriteInput(e.target.value)}
                            placeholder="e.g. Naruto, Death Note..."
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                        />
                        <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg">
                            Add
                        </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                        {favorites.map(fav => (
                            <div key={fav} className="bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1 rounded-md flex items-center space-x-2 text-sm">
                                <span>{fav}</span>
                                <button onClick={() => removeFavorite(fav)} className="hover:text-red-400">×</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-indigo-600/20 transition flex items-center space-x-2"
                    >
                       {submitting ? <span>Saving...</span> : <><span>Get Started</span> <Check size={20} /></>}
                    </button>
                </div>
            </div>
        </div>
    );
};