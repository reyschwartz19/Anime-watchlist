import { GoogleGenAI, Type } from "@google/genai";
import { UserData } from "../types";
import { ENV } from "../config/env";

const ai = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });

export interface RecommendationResult {
    title: string;
    reason: string;
}

export const getGeminiRecommendations = async (
    userProfile: UserData,
    recentHistory: string[]
): Promise<RecommendationResult[]> => {
    if (!ENV.GEMINI_API_KEY) {
        console.warn("Gemini API Key is missing. Returning mock data.");
        return [
            { title: "Cowboy Bebop", reason: "Classic sci-fi noir that matches your interest in action." },
            { title: "Fullmetal Alchemist: Brotherhood", reason: "Top tier adventure and deep story." },
            { title: "Steins;Gate", reason: "Excellent thriller with time travel elements." }
        ];
    }

    const genreString = userProfile.interests.join(", ");
    const historyString = recentHistory.length > 0 
        ? `I have recently watched or plan to watch: ${recentHistory.join(", ")}.` 
        : "I am new to anime.";

    const prompt = `
        I am an anime fan. 
        My favorite genres are: ${genreString}.
        ${historyString}
        
        Please recommend exactly 4 anime series that I haven't watched yet.
        Do not include any from my history list.
        Provide the exact English or Romaji title that can be found in a database like MyAnimeList.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "The exact title of the anime" },
                            reason: { type: Type.STRING, description: "Why you recommend this based on my interests" }
                        },
                        required: ["title", "reason"]
                    }
                }
            }
        });

        // Defensive parsing: remove any markdown code block syntax if present
        const jsonStr = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
        
        if (!jsonStr) return [];
        return JSON.parse(jsonStr) as RecommendationResult[];

    } catch (error) {
        console.error("Gemini API Error:", error);
        return [];
    }
};
