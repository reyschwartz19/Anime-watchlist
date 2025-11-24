import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { UserData, UserAnime, AnimeStatus } from '../types';

// NOTE: In a real app, these would come from process.env
// For this demo environment where users might not have keys immediately,
// We will implement a "Mock" mode if config is missing, to ensure the UI is reviewable.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Check if config is present
const isFirebaseConfigured = !!firebaseConfig.apiKey;

let auth: any;
let db: any;
let googleProvider: any;

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
}

// --- Auth Services ---

export const loginWithGoogle = async () => {
  if (isFirebaseConfigured) {
    return signInWithPopup(auth, googleProvider);
  } else {
    // Mock Login
    const mockUser = {
      uid: 'mock-user-123',
      displayName: 'Demo User',
      email: 'demo@example.com',
      photoURL: 'https://picsum.photos/200',
    };
    localStorage.setItem('mock_user', JSON.stringify(mockUser));
    window.location.reload(); // Force reload to pick up state
    return { user: mockUser };
  }
};

export const logout = async () => {
  if (isFirebaseConfigured) {
    return signOut(auth);
  } else {
    localStorage.removeItem('mock_user');
    window.location.reload();
  }
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  if (isFirebaseConfigured) {
    return onAuthStateChanged(auth, callback);
  } else {
    // Mock Auth State
    const stored = localStorage.getItem('mock_user');
    if (stored) {
      callback(JSON.parse(stored) as User);
    } else {
      callback(null);
    }
    return () => {};
  }
};

// --- Firestore/Data Services ---

const MOCK_DB_KEY = 'anime_checklist_mock_db';

const getMockData = (uid: string): UserData | null => {
    try {
        const data = localStorage.getItem(`${MOCK_DB_KEY}_${uid}`);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error("Error reading mock data", e);
        return null;
    }
};

const saveMockData = (uid: string, data: Partial<UserData>) => {
    try {
        const current = getMockData(uid) || { 
            uid, 
            email: 'demo@example.com', 
            displayName: 'Demo User', 
            photoURL: '', 
            interests: [], 
            favoriteAnimes: [], 
            onboarded: false,
            watchlist: {} 
        };
        const updated = { ...current, ...data };
        localStorage.setItem(`${MOCK_DB_KEY}_${uid}`, JSON.stringify(updated));
    } catch (e) {
        console.error("Error saving mock data", e);
    }
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
  try {
    if (isFirebaseConfigured) {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
        return docSnap.data() as UserData;
        }
        return null;
    } else {
        return getMockData(uid);
    }
  } catch (error) {
      console.error("Error fetching user data:", error);
      throw error;
  }
};

export const createUserProfile = async (user: User, initialData: Partial<UserData> = {}) => {
    const newData: UserData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        interests: [],
        favoriteAnimes: [],
        onboarded: false,
        watchlist: {},
        ...initialData
    };

    if (isFirebaseConfigured) {
        await setDoc(doc(db, 'users', user.uid), newData, { merge: true });
    } else {
        saveMockData(user.uid, newData);
    }
};

export const updateUserInterests = async (uid: string, interests: string[], favorites: string[]) => {
    if (isFirebaseConfigured) {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
            interests,
            favoriteAnimes: favorites,
            onboarded: true
        });
    } else {
        saveMockData(uid, { interests, favoriteAnimes: favorites, onboarded: true });
    }
};

export const updateUserProfile = async (uid: string, data: Partial<UserData>) => {
    if (isFirebaseConfigured) {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, data);
    } else {
        saveMockData(uid, data);
    }
};

export const updateAnimeStatus = async (uid: string, anime: UserAnime, status: AnimeStatus) => {
    if (isFirebaseConfigured) {
        const userRef = doc(db, 'users', uid);
        const animePayload = { ...anime, status, addedAt: Date.now() };
        
        // Use setDoc with merge to ensure we don't overwrite other fields,
        // and specifically target the watchlist map key.
        await setDoc(userRef, {
            watchlist: {
                [anime.mal_id]: animePayload
            }
        }, { merge: true });
    } else {
        const data = getMockData(uid);
        if (data) {
            const updatedWatchlist = { 
                ...data.watchlist, 
                [anime.mal_id]: { ...anime, status, addedAt: Date.now() } 
            };
            saveMockData(uid, { watchlist: updatedWatchlist });
        }
    }
};

export const removeAnime = async (uid: string, animeId: number) => {
     if (isFirebaseConfigured) {
         const userRef = doc(db, 'users', uid);
         // Use deleteField for atomic removal from the map
         await updateDoc(userRef, {
             [`watchlist.${animeId}`]: deleteField()
         });
     } else {
         const data = getMockData(uid);
         if (data) {
             const updatedList = { ...data.watchlist };
             delete updatedList[animeId];
             saveMockData(uid, { watchlist: updatedList });
         }
     }
};