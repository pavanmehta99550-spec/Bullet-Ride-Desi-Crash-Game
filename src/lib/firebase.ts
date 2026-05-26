import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: "AIzaSyAHocKjNGOjhUPJai7ROdQ8bzquO537tQA",
  authDomain: "eng-scholar-j07pf.firebaseapp.com",
  projectId: "eng-scholar-j07pf",
  storageBucket: "eng-scholar-j07pf.firebasestorage.app",
  messagingSenderId: "233719692690",
  appId: "1:233719692690:web:004c072eda8132178fd54b",
  firestoreDatabaseId: "ai-studio-d9c66130-58ba-4b73-97e5-8abb490c2227"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
export const db = getFirestore(app, dbId === '(default)' ? undefined : dbId);

// Ensure persistence is set to LOCAL (default, but explicit for clarity)
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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function syncUserProfile(user: any) {
  const userRef = doc(db, 'users', user.uid);
  try {
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      // New user
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Player',
        walletBalance: 0, // Default starting balance is zero as requested
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, userData);
      return userData;
    } else {
      return userDoc.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updateUserBalance(userId: string, newBalance: number, activeCoin: string = 'INR') {
  const userRef = doc(db, 'users', userId);
  try {
    const userDoc = await getDoc(userRef);
    let coinBalances: Record<string, number> = { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 };
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data?.coinBalances) {
        coinBalances = { ...coinBalances, ...data.coinBalances };
      } else if (data?.walletBalance !== undefined) {
        coinBalances.INR = data.walletBalance || 0;
      }
    }
    
    coinBalances[activeCoin] = parseFloat(newBalance.toFixed(8));

    const updateData: any = {
      coinBalances,
      activeCoin,
      updatedAt: serverTimestamp()
    };
    
    if (activeCoin === 'INR') {
      updateData.walletBalance = newBalance;
    }

    await setDoc(userRef, updateData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
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
    // Silently fail or log for debugging - multiple clients might try to save the same round
    console.warn("Global history save skipped or failed:", error);
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
  try {
    const gameData = {
      id: gameId,
      timestamp: serverTimestamp(),
      createdAt: Date.now(), // Fallback for easier sorting
      ...result
    };
    await setDoc(historyRef, gameData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/history/${gameId}`);
  }
}
