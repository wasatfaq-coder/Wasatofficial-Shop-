import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, initializeFirestore, getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';
import { FUNCTIONS_REGION, PLACE_ORDER_FUNCTION, PlaceOrderRequest, PlaceOrderResponse } from './shared/orderApi';

const app = initializeApp(firebaseConfig);

// `VITE_USE_EMULATORS=true bun run dev` talks to local Firebase emulators (see README)
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

function connectEmulators(firebaseApp: FirebaseApp, firestore: Firestore) {
  if (!USE_EMULATORS) return;
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectAuthEmulator(getAuth(firebaseApp), 'http://127.0.0.1:9099', { disableWarnings: true });
}

// CRITICAL: Must specify firestoreDatabaseId from configuration
// Using initializeFirestore with auto-detect long polling prevents 10s backend stream timeout warnings in sandboxes
function createFirestore(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(
      firebaseApp,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestore(app);
export const auth = getAuth(app);
connectEmulators(app, db);

const functions = getFunctions(app, FUNCTIONS_REGION);
if (USE_EMULATORS) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
const placeOrderCallable = httpsCallable<PlaceOrderRequest, PlaceOrderResponse>(functions, PLACE_ORDER_FUNCTION);

/** Places an order through the server (prices, stock and promo are validated there). */
export async function placeOrderOnServer(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  const result = await placeOrderCallable(request);
  return result.data;
}

/**
 * Support chat identity. Signed-in customers chat as themselves; guests get an anonymous
 * account in a separate Firebase app instance, so the storefront's own auth state
 * (currentUser) stays untouched. Each identity only sees its own chat thread.
 */
export interface ChatIdentity {
  uid: string;
  db: Firestore;
  isGuest: boolean;
}

let guestChat: { auth: Auth; db: Firestore } | null = null;

function getGuestChat() {
  if (!guestChat) {
    const guestApp = initializeApp(firebaseConfig, 'guest-chat');
    guestChat = { auth: getAuth(guestApp), db: createFirestore(guestApp) };
    connectEmulators(guestApp, guestChat.db);
  }
  return guestChat;
}

/** Restores a previously created guest chat session without creating a new one. */
export function restoreGuestChatIdentity(): Promise<ChatIdentity | null> {
  const guest = getGuestChat();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(guest.auth, (user) => {
      unsubscribe();
      resolve(user ? { uid: user.uid, db: guest.db, isGuest: true } : null);
    });
  });
}

/** Signs a guest in anonymously for the support chat (requires the Anonymous provider). */
export async function createGuestChatIdentity(): Promise<ChatIdentity> {
  const guest = getGuestChat();
  const credential = guest.auth.currentUser ? null : await signInAnonymously(guest.auth);
  const user = guest.auth.currentUser || credential!.user;
  return { uid: user.uid, db: guest.db, isGuest: true };
}
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection probe as required by Firebase skill
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Please check your Firebase configuration: the client is offline.');
    }
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

export async function logOut(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout Error:', error);
    throw error;
  }
}
