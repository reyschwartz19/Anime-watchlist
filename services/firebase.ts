import * as firebaseApp from 'firebase/app';
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged, 
    User,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    updateEmail,
    updatePassword,
    updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { UserData, UserAnime, AnimeStatus } from '../types';
import { ENV } from '../config/env';

// Initialize based on ENV
const isFirebaseConfigured = !ENV.IS_DEMO_MODE;

let auth: any;
let db: any;
let googleProvider: any;

if (isFirebaseConfigured) {
  const app = firebaseApp.initializeApp(ENV.FIREBASE);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
}

// --- Auth Services ---

// Error mapping for better user experience
const mapAuthError = (error: any): string => {
    const code = error.code || '';
    switch (code) {
        case 'auth/email-already-in-use': return 'Email is already in use.';
        case 'auth/invalid-email': return 'Invalid email address.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/user-not-found': return 'No account found with this email.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/requires-recent-login': return 'Please re-login to perform this security action.';
        default: return error.message || 'An authentication error occurred.';
    }
};

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
      emailVerified: true
    };
    localStorage.setItem('mock_user', JSON.stringify(mockUser));
    window.location.reload(); 
    return { user: mockUser };
  }
};

export const registerWithEmail = async (email: string, pass: string, name: string) => {
    if (isFirebaseConfigured) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: name });
            await sendEmailVerification(userCredential.user);
            return userCredential.user;
        } catch (error) {
            throw new Error(mapAuthError(error));
        }
    } else {
        const mockUser = { uid: 'mock-' + Date.now(), email, displayName: name, photoURL: null, emailVerified: false };
        localStorage.setItem('mock_user', JSON.stringify(mockUser));
        window.location.reload();
        return mockUser;
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    if (isFirebaseConfigured) {
        try {
            const result = await signInWithEmailAndPassword(auth, email, pass);
            return result.user;
        } catch (error) {
            throw new Error(mapAuthError(error));
        }
    } else {
        // Mock Login
        const mockUser = { uid: 'mock-user-123', displayName: 'Demo User', email, photoURL: null, emailVerified: true };
        localStorage.setItem('mock_user', JSON.stringify(mockUser));
        window.location.reload();
        return mockUser;
    }
};

export const resendVerificationEmail = async (user: User) => {
    if (isFirebaseConfigured && user) {
        await sendEmailVerification(user);
    } else {
        console.log("Mock verification email sent to " + user.email);
    }
};

export const updateUserEmailAddress = async (user: User, newEmail: string) => {
    if (isFirebaseConfigured) {
        try {
            await updateEmail(user, newEmail);
            await sendEmailVerification(user);
        } catch (error) {
            throw new Error(mapAuthError(error));
        }
    } else {
        console.log("Mock email updated to " + newEmail);
    }
};

export const updateUserPasswordString = async (user: User, newPass: string) => {
    if (isFirebaseConfigured) {
        try {
            await updatePassword(user, newPass);
        } catch (error) {
            throw new Error(mapAuthError(error));
        }
    } else {
        console.log("Mock password updated");
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