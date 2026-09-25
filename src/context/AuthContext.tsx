import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut, testFirestoreConnection } from '../firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  loginWithGoogle: () => Promise<User | null>;
  logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  isAdmin: false,
  loginWithGoogle: async () => null,
  logoutUser: async () => {},
});

// Must stay in sync with isAdmin() in firestore.rules
export const ADMIN_EMAIL = 'gunh83975@gmail.com';

/**
 * Admin = verified owner Google account, or a user with an /admins/{uid} document
 * (created manually in Firebase Console). Firestore rules enforce the same check.
 */
async function resolveIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;
  if (user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Probe Firestore connection on app start as required by Firebase skill
    testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const admin = await resolveIsAdmin(user);
      setCurrentUser(user);
      setIsAdmin(admin);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const user = await signInWithGoogle();
      return user;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        isAdmin,
        loginWithGoogle: handleGoogleLogin,
        logoutUser: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
