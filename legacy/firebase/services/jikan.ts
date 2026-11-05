import { Anime } from '../types';

const BASE_URL = 'https://api.jikan.moe/v4';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const searchAnime = async (query: string): Promise<Anime[]> => {
    // Basic rate limiting prevention
    await wait(300); 
    try {
        const response = await fetch(`${BASE_URL}/anime?q=${encodeURIComponent(query)}&sfw=true&limit=12`);
        if (!response.ok) throw new Error('Jikan API Error');
        const data = await response.json();
        // Ensure data.data is an array before returning
        return Array.isArray(data.data) ? data.data as Anime[] : [];
    } catch (error) {
        console.error("Error searching anime:", error);
        return [];
    }
};

export const getAnimeDetails = async (id: number): Promise<Anime | null> => {
    await wait(300);
    try {
        const response = await fetch(`${BASE_URL}/anime/${id}`);
        if (!response.ok) throw new Error('Jikan API Error');
        const data = await response.json();
        return data.data as Anime;
    } catch (error) {
        console.error("Error getting anime details:", error);
        return null;
    }
};

// Helper to fetch details for multiple recommendations
export const getBulkAnimeDetails = async (titles: string[]): Promise<Anime[]> => {
    const results: Anime[] = [];
    for (const title of titles) {
        // We search by title and take the first result to get the metadata (image, etc)
        const searchResults = await searchAnime(title);
        if (searchResults.length > 0) {
            results.push(searchResults[0]);
        }
        await wait(500); // Respect rate limits strictly for bulk ops
    }
    return results;
};