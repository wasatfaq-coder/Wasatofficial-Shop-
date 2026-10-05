import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { BodyMeasurements, UserProfile } from '../types';
import { GUEST_USER_PROFILE } from '../data/products';
import { ADMIN_EMAIL } from '../context/AuthContext';
import { auth } from '../firebase';
import { saveUserProfileToFirestore } from '../utils/firebaseSync';
import type { AddToast, Persist } from './useToasts';

// Default profile of earlier versions (the shop admin's name, email, phone and office address)
function isLegacyDemoProfile(profile: Partial<UserProfile>): boolean {
  return (
    profile.name === 'Администратор MANSTYLE' ||
    (profile.email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
    (profile.savedAddresses || []).some((a) => a.id === 'addr-1' && a.title === 'Офис MANSTYLE')
  );
}

type ProfileOptions = {
  authLoading: boolean;
  currentUser: User | null;
  /** The signed-in customer's own profile document (every profile for the admin) */
  allUsers: UserProfile[];
  persist: Persist;
  addToast: AddToast;
};

/**
 * The visitor's profile: cached in this browser (`manstyle_user_profile`), filled from the account and its document
 * after a sign-in, written to Firestore only for the account signed in now, dropped from the browser on sign-out.
 */
export function useProfile({ authLoading, currentUser, allUsers, persist, addToast }: ProfileOptions) {
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('manstyle_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Older versions shipped the shop admin's personal data as the default profile and
        // cached it in every visitor's browser. Drop such a cache; the admin's own profile
        // is restored from Firebase Auth after sign-in.
        if (parsed && typeof parsed === 'object' && !isLegacyDemoProfile(parsed)) {
          return { ...GUEST_USER_PROFILE, ...parsed };
        }
        localStorage.removeItem('manstyle_user_profile');
      }
    } catch {}
    return GUEST_USER_PROFILE;
  });

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
    try {
      localStorage.setItem('manstyle_user_profile', JSON.stringify(updated));
    } catch {}
    // Only into the account that is signed in right now: right after «Выйти» this closure still holds the previous
    // user, and the guest profile used to overwrite their addresses and measurements (audit 02.10, finding 23)
    if (currentUser?.uid && auth.currentUser?.uid === currentUser.uid) {
      // The profile (addresses, measurements) must not be lost silently: a refused write says so
      void persist('профиль', saveUserProfileToFirestore(currentUser.uid, updated));
    }
  };

  // Signed out: the profile of that account leaves this browser (only locally — nothing is written); the chat
  // clears itself (useSupportChat.ts)
  const signedInUidRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (authLoading) return;
    const uid = currentUser?.uid ?? null;
    if (signedInUidRef.current && !uid) {
      setUserProfile(GUEST_USER_PROFILE);
      try {
        localStorage.removeItem('manstyle_user_profile');
      } catch {}
    }
    signedInUidRef.current = uid;
  }, [authLoading, currentUser]);

  // Sync profile from Firebase Auth user & users collection
  React.useEffect(() => {
    if (currentUser) {
      const existing = allUsers.find(
        (u) =>
          (u.uid && u.uid === currentUser.uid) ||
          (u.email && u.email.toLowerCase() === (currentUser.email || '').toLowerCase())
      );
      setUserProfile((prev) => {
        const merged: UserProfile = {
          ...prev,
          ...(existing || {}),
          // The name the buyer saved (Фамилия Имя Отчество) wins over the Google account's name
          name: existing?.name || currentUser.displayName || prev.name,
          email: currentUser.email || existing?.email || prev.email,
          avatar: currentUser.photoURL || existing?.avatar || prev.avatar,
          bonusPoints: existing?.bonusPoints ?? prev.bonusPoints ?? 0,
        };
        try {
          localStorage.setItem('manstyle_user_profile', JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [currentUser, allUsers]);


  const handleSaveMeasurements = (measurements: BodyMeasurements) => {
    const updated: UserProfile = {
      ...userProfile,
      bodyMeasurements: measurements,
    };
    handleUpdateProfile(updated);
    addToast(
      measurements.preferredSize
        ? `Параметры и размер ${measurements.preferredSize} сохранены в профиле`
        : 'Параметры фигуры сохранены в профиле',
      'success'
    );
  };

  return { userProfile, handleUpdateProfile, handleSaveMeasurements };
}
