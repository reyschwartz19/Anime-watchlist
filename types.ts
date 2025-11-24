export type AnimeStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped';

export interface Anime {
  mal_id: number;
  title: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  synopsis: string;
  episodes?: number;
  score?: number;
  genres?: { name: string }[];
}

export interface UserAnime extends Anime {
  status: AnimeStatus;
  progress?: number; // episodes watched
  addedAt: number; // timestamp
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  interests: string[]; // genres
  favoriteAnimes: string[]; // names of favorites
  onboarded: boolean;
}

export interface UserData extends UserProfile {
  watchlist: Record<string, UserAnime>; // Keyed by mal_id for O(1) access
}

export const GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", 
    "Horror", "Mystery", "Romance", "Sci-Fi", "Slice of Life", 
    "Sports", "Supernatural", "Thriller", "Isekai", "Mecha"
];
