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
    updateProfile,
    Auth
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteField, Firestore } from 'firebase/firestore';
import { UserData, UserAnime, AnimeStatus } from '../types';
import { ENV } from '../config/env';

// Initialize based on ENV
let app: firebaseApp.FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let googleProvider: GoogleAuthProvider | undefined;

if (ENV.FIREBASE.apiKey) {
    try {
        app = firebaseApp.initializeApp(ENV.FIREBASE);
        auth = getAuth(app);
        db = getFirestore(app);
        googleProvider = new GoogleAuthProvider();
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
    }
} else {
    console.warn("Firebase API Keys are missing. App will not function correctly.");
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
    if (!auth || !googleProvider) throw new Error("Firebase not initialized");
    return signInWithPopup(auth, googleProvider);
};

export const registerWithEmail = async (email: string, pass: string, name: string) => {
    if (!auth) throw new Error("Firebase not initialized");
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(userCredential.user, { displayName: name });
        await sendEmailVerification(userCredential.user);
        return userCredential.user;
    } catch (error) {
        throw new Error(mapAuthError(error));
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    if (!auth) throw new Error("Firebase not initialized");
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        throw new Error(mapAuthError(error));
    }
};

export const resendVerificationEmail = async (user: User) => {
    if (user) {
        await sendEmailVerification(user);
    }
};

export const updateUserEmailAddress = async (user: User, newEmail: string) => {
    try {
        await updateEmail(user, newEmail);
        await sendEmailVerification(user);
    } catch (error) {
        throw new Error(mapAuthError(error));
    }
};

export const updateUserPasswordString = async (user: User, newPass: string) => {
    try {
        await updatePassword(user, newPass);
    } catch (error) {
        throw new Error(mapAuthError(error));
    }
};

export const logout = async () => {
    if (!auth) return;
    return signOut(auth);
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
    if (!auth) {
        callback(null);
        return () => { };
    }
    return onAuthStateChanged(auth, callback);
};

// --- Firestore/Data Services ---

export const getUserData = async (uid: string): Promise<UserData | null> => {
    if (!db) return null;
    try {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as UserData;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user data:", error);
        throw error;
    }
};

export const createUserProfile = async (user: User, initialData: Partial<UserData> = {}) => {
    if (!db) return;
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

    await setDoc(doc(db, 'users', user.uid), newData, { merge: true });
};

export const updateUserInterests = async (uid: string, interests: string[], favorites: string[]) => {
    if (!db) return;
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
        interests,
        favoriteAnimes: favorites,
        onboarded: true
    });
};

export const updateUserProfile = async (uid: string, data: Partial<UserData>) => {
    if (!db) return;
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, data);
};

export const updateAnimeStatus = async (uid: string, anime: UserAnime, status: AnimeStatus) => {
    if (!db) return;
    const userRef = doc(db, 'users', uid);
    const animePayload = { ...anime, status, addedAt: Date.now() };

    await setDoc(userRef, {
        watchlist: {
            [anime.mal_id]: animePayload
        }
    }, { merge: true });
};

export const removeAnime = async (uid: string, animeId: number) => {
    if (!db) return;
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
        [`watchlist.${animeId}`]: deleteField()
    });
};