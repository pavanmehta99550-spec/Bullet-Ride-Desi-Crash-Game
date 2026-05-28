import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';

// Check if the current environment is your Vercel production domain
const isCustomDomain = typeof window !== 'undefined' && 
  (window.location.hostname.includes('bullet-ride-desi-crash-game') || window.location.hostname.includes('vercel.app'));

const metaEnv = (import.meta as any).env || {};

// Direct local storage loader for manual overrides
const getCustomLocalConfig = () => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('custom_firebase_config_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Clean up empty fields so they don't override default values with empty strings
      const cleaned: any = {};
      Object.keys(parsed).forEach(key => {
        if (parsed[key] && typeof parsed[key] === 'string' && parsed[key].trim() !== '') {
          cleaned[key] = parsed[key].trim();
        } else if (parsed[key]) {
          cleaned[key] = parsed[key];
        }
      });
      return Object.keys(cleaned).length > 0 ? cleaned : null;
    }
  } catch (_) {}
  return null;
};

const localConfig = getCustomLocalConfig();

// Define fallback defaults for the primary project so the app NEVER crashes
const DEFAULT_API_KEY = "AIzaSyAAylk4kI5has8jdwX0ef29vcRkLPoSoNw";
const DEFAULT_AUTH_DOMAIN = "clipnova-f259d.firebaseapp.com";
const DEFAULT_PROJECT_ID = "clipnova-f259d";
const DEFAULT_STORAGE_BUCKET = "clipnova-f259d.firebasestorage.app";
const DEFAULT_MESSAGING_SENDER_ID = "1021594403404";
const DEFAULT_APP_ID = "1:1021594403404:web:0d5d5f342378855947aae9";
const DEFAULT_FIRESTORE_DATABASE_ID = "(default)";
const DEFAULT_MEASUREMENT_ID = "G-5EFZFGXW7K";

export const firebaseConfig = {
  // If the user supplied their custom config in env vars or local storage, use it.
  // Otherwise, default safely to the working config.
  
  apiKey: localConfig?.apiKey || metaEnv.VITE_FIREBASE_API_KEY || DEFAULT_API_KEY,
  
  authDomain: localConfig?.authDomain || metaEnv.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_AUTH_DOMAIN,
    
  projectId: localConfig?.projectId || metaEnv.VITE_FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    
  storageBucket: localConfig?.storageBucket || metaEnv.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET,
    
  messagingSenderId: localConfig?.messagingSenderId || metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_MESSAGING_SENDER_ID,
    
  appId: localConfig?.appId || metaEnv.VITE_FIREBASE_APP_ID || DEFAULT_APP_ID,
    
  firestoreDatabaseId: localConfig?.firestoreDatabaseId || metaEnv.VITE_FIREBASE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE_ID,
  
  measurementId: DEFAULT_MEASUREMENT_ID
};

// If isCustomDomain fallback values ended up with missing keys, patch using Defaults to absolutely prevent crashes
if (!firebaseConfig.apiKey) {
  firebaseConfig.apiKey = DEFAULT_API_KEY;
}
if (!firebaseConfig.appId) {
  firebaseConfig.appId = DEFAULT_APP_ID;
}

// Standard clean Firestore initialization. Re-use dbId correctly.
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

export const db = getFirestore(app, dbId);

// Ensure local persistence for sign-ins
setPersistence(auth, browserLocalPersistence);

export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[FIREBASE GRACEFUL] ${operationType} failed on ${path || 'unknown'}:`, errMessage);
  // We NEVER throw errors here so that offline gameplay or network ripples never crash bet placements or cashouts.
}

// Local cache keys
const profileCacheKey = (uid: string) => `cached_profile_v1_${uid}`;

export async function syncUserProfile(user: any) {
  const userRef = doc(db, 'users', user.uid);
  const localKey = profileCacheKey(user.uid);
  
  try {
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      // New user registration
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Player',
        walletBalance: 0, 
        coinBalances: { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 },
        activeCoin: 'INR',
        createdAt: Date.now(),
      };
      
      try {
        await setDoc(userRef, userData, { merge: true });
      } catch (writeErr) {
        handleFirestoreError(writeErr, OperationType.CREATE, `users/${user.uid}`);
      }
      
      localStorage.setItem(localKey, JSON.stringify(userData));
      return userData;
    } else {
      const data = userDoc.data();
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    
    // Offline / Failed to load profile fallback from local cache
    const cached = localStorage.getItem(localKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
    
    // Clean safe default initial schema for sandboxed environments
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Player',
      walletBalance: 50000,
      coinBalances: { INR: 50000, BTC: 0.1, ETH: 1.5, USDT: 250, SOL: 12, DOGE: 500 },
      activeCoin: 'INR',
      createdAt: Date.now(),
    };
  }
}

export async function updateUserBalance(userId: string, newBalance: number, activeCoin: string = 'INR') {
  const userRef = doc(db, 'users', userId);
  const localKey = profileCacheKey(userId);
  
  // 1. Instant full sync to LocalStorage
  let coinBalances: Record<string, number> = { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 };
  let cachedData: any = { uid: userId };
  
  const cached = localStorage.getItem(localKey);
  if (cached) {
    try {
      cachedData = JSON.parse(cached);
      if (cachedData.coinBalances) {
        coinBalances = { ...coinBalances, ...cachedData.coinBalances };
      } else if (cachedData.walletBalance !== undefined) {
        coinBalances.INR = cachedData.walletBalance || 0;
      }
    } catch (_) {}
  }
  
  coinBalances[activeCoin] = parseFloat(newBalance.toFixed(8));
  cachedData.coinBalances = coinBalances;
  cachedData.activeCoin = activeCoin;
  if (activeCoin === 'INR') {
    cachedData.walletBalance = newBalance;
  }
  
  localStorage.setItem(localKey, JSON.stringify(cachedData));

  // 2. Perform safe incremental online update to Firestore using Dot Notation
  // This updates ONLY the active transaction coin balance without risking wiping other fields!
  try {
    const updateData: any = {
      activeCoin,
      updatedAt: serverTimestamp()
    };
    
    updateData[`coinBalances.${activeCoin}`] = parseFloat(newBalance.toFixed(8));
    
    if (activeCoin === 'INR') {
      updateData.walletBalance = newBalance;
    }

    await updateDoc(userRef, updateData);
  } catch (error) {
    // If updateDoc fails (e.g. document does not exist yet), do a robust setDoc merger
    try {
      const setData: any = {
        activeCoin,
        updatedAt: serverTimestamp()
      };
      setData.coinBalances = {
        [activeCoin]: parseFloat(newBalance.toFixed(8))
      };
      if (activeCoin === 'INR') {
        setData.walletBalance = newBalance;
      }
      await setDoc(userRef, setData, { merge: true });
    } catch (setErr) {
      handleFirestoreError(setErr, OperationType.UPDATE, `users/${userId}`);
    }
  }
}

export async function saveGlobalHistory(roundId: string, multiplier: number) {
  const historyRef = doc(db, 'globalHistory', roundId);
  try {
    await setDoc(historyRef, {
      id: roundId,
      multiplier,
      createdAt: Date.now(),
      timestamp: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `globalHistory/${roundId}`);
  }
}

export async function saveGameHistory(userId: string, result: {
  betAmount: number;
  multiplier: number;
  winAmount: number;
  status: 'win' | 'loss';
}) {
  const gameId = Date.now().toString();
  const historyRef = doc(db, 'users', userId, 'history', gameId);
  
  // Save locally first for high reactivity
  const historyKey = `game_history_list_${userId}`;
  try {
    const existing = localStorage.getItem(historyKey);
    const list = existing ? JSON.parse(existing) : [];
    list.unshift({ id: gameId, createdAt: Date.now(), ...result });
    localStorage.setItem(historyKey, JSON.stringify(list.slice(0, 50)));
  } catch (_) {}

  try {
    const gameData = {
      id: gameId,
      timestamp: serverTimestamp(),
      createdAt: Date.now(),
      ...result
    };
    await setDoc(historyRef, gameData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/history/${gameId}`);
  }
}
