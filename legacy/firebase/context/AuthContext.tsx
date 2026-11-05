import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { subscribeToAuthChanges, getUserData, createUserProfile } from '../services/firebase';
import { UserData } from '../types';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  refreshUserData: async () => { },
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (uid: string) => {
    try {
      const data = await getUserData(uid);
      setUserData(data);
    } catch (err) {
      console.error("Error fetching user data", err);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // Check if user exists in DB, if not create basic profile
          let data = await getUserData(firebaseUser.uid);
          if (!data) {
            await createUserProfile(firebaseUser);
            data = await getUserData(firebaseUser.uid);
          }
          setUserData(data);
        } catch (error: any) {
          console.error("Error fetching/creating user profile:", error);
          if (error.code === 'permission-denied') {
            console.error("CRITICAL: Firestore Security Rules are blocking access. Please update your Firestore rules in the Firebase Console.");
          }
          // Fallback: Set basic user data from Auth object so app doesn't hang
          setUserData({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'User',
            photoURL: firebaseUser.photoURL || '',
            interests: [],
            favoriteAnimes: [],
            onboarded: false,
            watchlist: {}
          });
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
};