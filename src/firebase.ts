import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';
import { FUNCTIONS_REGION, PLACE_ORDER_FUNCTION, PlaceOrderRequest, PlaceOrderResponse } from './shared/orderApi';
import { firestoreOperationError } from './utils/firestoreErrors';

const app = initializeApp(firebaseConfig);

// `VITE_USE_EMULATORS=true bun run dev` talks to local Firebase emulators (see README)
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

// App Check (reCAPTCHA v3, free on Spark): with enforcement on in the console the database answers only requests from
// this site, not scripts with the public config (audit 02.10, stage 5 without Blaze). The site key is the build
// variable VITE_RECAPTCHA_SITE_KEY (GitHub variable RECAPTCHA_SITE_KEY); without it App Check is off
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

function protectWithAppCheck(firebaseApp: FirebaseApp) {
  if (!RECAPTCHA_SITE_KEY || USE_EMULATORS) return;
  try {
    initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.error('App Check was not started:', err);
  }
}
protectWithAppCheck(app);

function connectEmulators(firestore: Firestore, targetAuth: Auth) {
  if (!USE_EMULATORS) return;
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectAuthEmulator(targetAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

// Stage 4 of docs/performance-plan.md: `initializeAuth` without `browserPopupRedirectResolver`, so on mobile browsers
// Firebase Auth does not load Google's `apis.google.com/js/api.js` and auth iframe on every visit before «Войти» is tapped
function createAuth(firebaseApp: FirebaseApp): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const NAMED_FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';
export const FIRESTORE_DATABASE_ID =
  (import.meta.env.VITE_FIRESTORE_DATABASE_ID as string | undefined)?.trim() || NAMED_FIRESTORE_DATABASE_ID;

const IS_IN_IFRAME = typeof window !== 'undefined' && window.self !== window.top;
const DEFAULT_PERSISTENT_CACHE =
  (import.meta.env.PROD && !USE_EMULATORS && !IS_IN_IFRAME) || import.meta.env.VITE_FIRESTORE_CACHE === 'true';

// CRITICAL: Must specify firestoreDatabaseId from configuration
// Using initializeFirestore with auto-detect long polling prevents 10s backend stream timeout warnings in sandboxes.
// Stage 6 of docs/performance-plan.md: persistent IndexedDB cache in production (and when VITE_FIRESTORE_CACHE=true);
// memory cache in emulators, dev server and sandboxed iframes so StrictMode double-mounts and cross-frame IndexedDB
// contention do not trigger primary lease errors.
function createFirestore(
  firebaseApp: FirebaseApp,
  withPersistentCache = DEFAULT_PERSISTENT_CACHE,
  databaseId = FIRESTORE_DATABASE_ID
): Firestore {
  try {
    return initializeFirestore(
      firebaseApp,
      {
        experimentalAutoDetectLongPolling: true,
        ...(withPersistentCache
          ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
          : {}),
      },
      databaseId
    );
  } catch {
    return getFirestore(firebaseApp, databaseId);
  }
}

const firestoreInstances = new Map<string, Firestore>();

export function getFirestoreById(databaseId: string): Firestore {
  const normalized = databaseId.trim() || DEFAULT_FIRESTORE_DATABASE_ID;
  const existing = firestoreInstances.get(normalized);
  if (existing) return existing;
  const instance = createFirestore(app, normalized === FIRESTORE_DATABASE_ID && DEFAULT_PERSISTENT_CACHE, normalized);
  if (USE_EMULATORS) {
    try {
      connectFirestoreEmulator(instance, '127.0.0.1', 8080);
    } catch {}
  }
  firestoreInstances.set(normalized, instance);
  return instance;
}

export const db = createFirestore(app);
firestoreInstances.set(FIRESTORE_DATABASE_ID, db);
export const auth = createAuth(app);
connectEmulators(db, auth);

// Scenario tests (tests/e2e) sign in to the Auth emulator without Google's popup. Only in the emulator build:
// the production build drops this block
if (USE_EMULATORS) {
  (window as Window & { e2eSignIn?: (user: { sub: string; email: string; name: string }) => Promise<unknown> }).e2eSignIn =
    (user) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ ...user, email_verified: true })));
}

// The Functions client is loaded only for server orders («Витрина» → «Проверка заказов на сервере»): ≈ 8 КБ gzip off
// the main bundle (audit 02.10, finding 37)
let placeOrderCallablePromise: Promise<(request: PlaceOrderRequest) => Promise<{ data: PlaceOrderResponse }>> | null = null;
function placeOrderCallable(request: PlaceOrderRequest) {
  placeOrderCallablePromise ??= import('firebase/functions').then(({ connectFunctionsEmulator, getFunctions, httpsCallable }) => {
    const functions = getFunctions(app, FUNCTIONS_REGION);
    if (USE_EMULATORS) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    return httpsCallable<PlaceOrderRequest, PlaceOrderResponse>(functions, PLACE_ORDER_FUNCTION);
  });
  return placeOrderCallablePromise.then((call) => call(request));
}

/**
 * True when the placeOrder function is deployed and answers: an empty request comes back as
 * «invalid-argument». Without the function the call fails with «internal» or «not-found».
 */
export async function isPlaceOrderAvailable(): Promise<boolean> {
  try {
    await placeOrderCallable({} as PlaceOrderRequest);
    return true;
  } catch (err) {
    return (err as { code?: string }).code === 'functions/invalid-argument';
  }
}

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
    protectWithAppCheck(guestApp);
    const guestAuth = createAuth(guestApp);
    const guestDb = createFirestore(guestApp, false);
    guestChat = { auth: guestAuth, db: guestDb };
    connectEmulators(guestDb, guestAuth);
  }
  return guestChat;
}

// Internal key (CLAUDE.md, «manstyle_*»): this browser has a guest's anonymous sign-in (chat or order). Without it the
// second Firebase app is not started on every visit (audit 07.10, finding 52)
const GUEST_SESSION_KEY = 'manstyle_guest_session';
// A guest of an earlier version has no mark yet: their orders or chat kept in this browser say there is a session
const GUEST_TRACE_KEYS = ['manstyle_guest_orders', 'manstyle_chat_messages_v2'];

// '1' — there is a guest sign-in; '0' — checked, there is none: the traces below (a signed-in buyer keeps the chat cache too)
// are read only until the first check
function hasGuestSession(): boolean {
  try {
    const mark = localStorage.getItem(GUEST_SESSION_KEY);
    if (mark === '1') return true;
    if (mark === '0') return false;
    return GUEST_TRACE_KEYS.some((key) => {
      const saved = localStorage.getItem(key);
      return Boolean(saved && saved !== '[]');
    });
  } catch {
    // storage closed (private mode): look for the session as before
    return true;
  }
}

function markGuestSession(present: boolean): void {
  try {
    localStorage.setItem(GUEST_SESSION_KEY, present ? '1' : '0');
  } catch {}
}

/** Restores a previously created guest chat session without creating a new one. */
export function restoreGuestChatIdentity(): Promise<ChatIdentity | null> {
  if (!guestChat && !hasGuestSession()) return Promise.resolve(null);
  const guest = getGuestChat();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(guest.auth, (user) => {
      unsubscribe();
      markGuestSession(Boolean(user));
      resolve(user ? { uid: user.uid, db: guest.db, isGuest: true } : null);
    });
  });
}

/** Signs a guest in anonymously for the support chat (requires the Anonymous provider). */
export async function createGuestChatIdentity(): Promise<ChatIdentity> {
  const guest = getGuestChat();
  const credential = guest.auth.currentUser ? null : await signInAnonymously(guest.auth);
  const user = guest.auth.currentUser || credential!.user;
  markGuestSession(true);
  return { uid: user.uid, db: guest.db, isGuest: true };
}
/** The guest's anonymous session ends (its orders and chat went to the account): a later guest gets a new one */
export async function forgetGuestChatIdentity(): Promise<void> {
  if (!guestChat?.auth.currentUser) return;
  await signOut(guestChat.auth);
  markGuestSession(false);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * A failed write of firebaseSync.ts: thrown again as one error that keeps the database's code and the original
 * (audit 07.10, finding 21). Not logged here: the caller logs it once (`persist`, the chat, the admin's screens) —
 * before, every failure was logged twice and took two of the five reports a visit sends to «Ошибки на сайте».
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  throw firestoreOperationError(error, operationType, path);
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
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return result.user;
  } catch (error) {
    console.warn('Google Sign-In did not finish:', error);
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
