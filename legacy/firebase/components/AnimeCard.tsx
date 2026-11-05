import React from 'react';
import { Anime, AnimeStatus } from '../types';
import { Plus, Check, Clock, Eye, Trash2 } from 'lucide-react';

interface AnimeCardProps {
    anime: Anime;
    currentStatus?: AnimeStatus;
    onUpdateStatus: (anime: Anime, status: AnimeStatus) => void;
    onRemove?: (id: number) => void;
    recommendationReason?: string;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({ 
    anime, 
    currentStatus, 
    onUpdateStatus, 
    onRemove,
    recommendationReason 
}) => {
    return (
        <div className="bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700 hover:border-indigo-500/50 transition duration-300 flex flex-col h-full group">
            <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
                <img 
                    src={anime.images.jpg.large_image_url} 
                    alt={anime.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
                {anime.score && (
                    <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-sm text-yellow-400 font-bold px-2 py-1 rounded-md text-xs border border-slate-700">
                        ★ {anime.score}
                    </div>
                )}
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-semibold text-lg leading-tight mb-1 text-white line-clamp-2" title={anime.title}>
                    {anime.title}
                </h3>
                
                {/* Genres */}
                <div className="flex flex-wrap gap-1 mb-2">
                    {anime.genres?.slice(0, 3).map(g => (
                        <span key={g.name} className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                            {g.name}
                        </span>
                    ))}
                </div>

                {recommendationReason && (
                    <div className="mb-3 p-2 bg-indigo-900/30 border border-indigo-500/30 rounded text-xs text-indigo-200 italic">
                        "{recommendationReason}"
                    </div>
                )}

                <div className="mt-auto pt-3 flex flex-wrap gap-2">
                    {!currentStatus ? (
                        <button 
                            onClick={() => onUpdateStatus(anime, 'plan_to_watch')}
                            className="flex-1 flex items-center justify-center space-x-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded text-sm font-medium transition"
                        >
                            <Plus size={16} />
                            <span>Add to List</span>
                        </button>
                    ) : (
                        <div className="w-full space-y-2">
                             <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">
                                <span>Current: {currentStatus.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex gap-1">
                                {currentStatus !== 'watching' && (
                                    <button onClick={() => onUpdateStatus(anime, 'watching')} className="flex-1 bg-slate-700 hover:bg-sky-600 p-1.5 rounded text-slate-300 hover:text-white" title="Watching">
                                        <Eye size={16} className="mx-auto" />
                                    </button>
                                )}
                                {currentStatus !== 'completed' && (
                                    <button onClick={() => onUpdateStatus(anime, 'completed')} className="flex-1 bg-slate-700 hover:bg-green-600 p-1.5 rounded text-slate-300 hover:text-white" title="Completed">
                                        <Check size={16} className="mx-auto" />
                                    </button>
                                )}
                                {currentStatus !== 'plan_to_watch' && (
                                    <button onClick={() => onUpdateStatus(anime, 'plan_to_watch')} className="flex-1 bg-slate-700 hover:bg-purple-600 p-1.5 rounded text-slate-300 hover:text-white" title="Plan to Watch">
                                        <Clock size={16} className="mx-auto" />
                                    </button>
                                )}
                                {onRemove && (
                                    <button onClick={() => onRemove(anime.mal_id)} className="flex-1 bg-slate-700 hover:bg-red-600 p-1.5 rounded text-slate-300 hover:text-white" title="Remove">
                                        <Trash2 size={16} className="mx-auto" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};