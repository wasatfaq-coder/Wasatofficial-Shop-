import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut, testFirestoreConnection } from '../firebase';
import { retryWithDelays } from '../utils/network';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** The admins/{uid} document could not be read: the rights are unknown, the check is tried again (finding 20) */
  adminCheckFailed: boolean;
  loginWithGoogle: () => Promise<User | null>;
  logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  isAdmin: false,
  adminCheckFailed: false,
  loginWithGoogle: async () => null,
  logoutUser: async () => {},
});

// Must stay in sync with isAdmin() in firestore.rules
export const ADMIN_EMAIL = 'gunh83975@gmail.com';

const isOwnerAccount = (user: User) => user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

/** Whether the account has an /admins/{uid} document (created manually in Firebase Console); throws when unread */
async function hasAdminDoc(user: User): Promise<boolean> {
  return (await getDoc(doc(db, 'admins', user.uid))).exists();
}

/** A failed read of admins/{uid} is tried again after these delays, then reported to the owner (finding 20) */
const ADMIN_CHECK_RETRY_MS = [3_000, 10_000, 30_000] as const;

/**
 * Admin = verified owner Google account, or a user with an /admins/{uid} document. Firestore rules enforce the same
 * check. An unread document no longer makes the admin a customer silently (audit 07.10, finding 20): `failed` —
 * the profile says the rights are not checked, and the check goes on in the background.
 */
async function resolveIsAdmin(user: User | null): Promise<{ isAdmin: boolean; failed: boolean }> {
  if (!user) return { isAdmin: false, failed: false };
  if (isOwnerAccount(user)) return { isAdmin: true, failed: false };
  try {
    return { isAdmin: await hasAdminDoc(user), failed: false };
  } catch (err) {
    console.warn('Admin rights were not read, trying again:', err);
    return { isAdmin: false, failed: true };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  // the sign-in a check belongs to: a retry for an account that is gone does nothing
  const authGeneration = useRef(0);

  useEffect(() => {
    // Probe Firestore connection on app start as required by Firebase skill
    testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const generation = ++authGeneration.current;
      const admin = await resolveIsAdmin(user);
      if (generation !== authGeneration.current) return;
      setCurrentUser(user);
      setIsAdmin(admin.isAdmin);
      setAdminCheckFailed(admin.failed);
      setLoading(false);
      if (!admin.failed || !user) return;
      // the shop opens as for a customer at once; the panel appears when the document is read
      const stale = () => generation !== authGeneration.current;
      retryWithDelays(() => hasAdminDoc(user), ADMIN_CHECK_RETRY_MS, { shouldStop: stale }).then(
        (isAdminNow) => {
          if (stale()) return;
          setIsAdmin(isAdminNow);
          setAdminCheckFailed(false);
        },
        (err) => {
          if (!stale()) console.error('Admin rights were not checked:', err);
        }
      );
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
        adminCheckFailed,
        loginWithGoogle: handleGoogleLogin,
        logoutUser: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
