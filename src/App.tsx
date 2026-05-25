import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, RefreshCw, Bike, Gauge, User, History, 
  ChevronRight, LogIn, LogOut, Mail, Lock, Chrome, Loader2, X 
} from 'lucide-react';
import { 
  auth, googleProvider, syncUserProfile, 
  updateUserBalance, saveGameHistory 
} from './lib/firebase';
import { 
  onAuthStateChanged, signInWithPopup, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import AuthModal from './components/AuthModal';

interface GameHistory {
  id: number;
  multiplier: number;
  time: string;
}

async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Non-JSON response received`);
  }
  return await res.json();
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const [multiplier, setMultiplier] = useState(1.00);
  const [coins, setCoins] = useState<{name: string, symbol: string, color: string, address: string}[]>([
    { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A', address: 'bc1qxy2kgdy6jr...789' },
    { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', address: '0x71C765...d897' },
    { name: 'Tether', symbol: 'USDT', color: '#26A17B', address: '0x26A17B...e456' },
    { name: 'Solana', symbol: 'SOL', color: '#14F195', address: '6x5d...f678' },
    { name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633', address: 'D8vB...m90l' }
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCrashed, setIsCrashed] = useState(false);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [cashedOutMultiplier, setCashedOutMultiplier] = useState<number | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [crashReason, setCrashReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<GameHistory[]>([]);
  const [betAmount, setBetAmount] = useState(500);
  const [balance, setBalance] = useState(0);
  const [activeCoin, setActiveCoin] = useState<string>('INR');
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({ INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 });
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [autoPlayTimer, setAutoPlayTimer] = useState<number | null>(null);
  const [isBetQueued, setIsBetQueued] = useState(false);
  const [hasActiveBet, setHasActiveBet] = useState(false);

  const [multiplierPoints, setMultiplierPoints] = useState<{ x: number, y: number }[]>([]);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const nextRoundData = useRef<{ crashPoint: number; crashReason: string } | null>(null);

  // Sync refs to avoid stale closures in core intervals
  const isAutoPlayRef = useRef(isAutoPlay);
  const isBetQueuedRef = useRef(isBetQueued);
  const userRef = useRef(user);
  const balanceRef = useRef(balance);
  const betAmountRef = useRef(betAmount);
  const isPlayingRef = useRef(isPlaying);
  const isCrashedRef = useRef(isCrashed);
  const crashPointRef = useRef(crashPoint);
  const multiplierRef = useRef(multiplier);
  const hasActiveBetRef = useRef(hasActiveBet);
  const hasCashedOutRef = useRef(hasCashedOut);

  useEffect(() => { isAutoPlayRef.current = isAutoPlay; }, [isAutoPlay]);
  useEffect(() => { isBetQueuedRef.current = isBetQueued; }, [isBetQueued]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { betAmountRef.current = betAmount; }, [betAmount]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isCrashedRef.current = isCrashed; }, [isCrashed]);
  useEffect(() => { crashPointRef.current = crashPoint; }, [crashPoint]);
  useEffect(() => { multiplierRef.current = multiplier; }, [multiplier]);
  useEffect(() => { hasActiveBetRef.current = hasActiveBet; }, [hasActiveBet]);
  useEffect(() => { hasCashedOutRef.current = hasCashedOut; }, [hasCashedOut]);

  // Pre-fetch next round data
  const prefetchNextRound = async () => {
    try {
      const data = await safeFetchJson('/api/round/get-data', { method: 'POST' });
      nextRoundData.current = data;
      setError(null); // Clear any previous network errors
    } catch (err: any) {
      // Gracefully capture log without crashing or spamming console with HTML error traces
      console.warn("Prefetch next round failed:", err.message || err);
    }
  };

  const fetchCoins = async () => {
    try {
      const data = await safeFetchJson('/api/config/crypto');
      if (Array.isArray(data) && data.length > 0) {
        setCoins(data);
      }
    } catch (err: any) {
      console.warn("Load coins failed:", err.message || err);
    }
  };

  const startCountdown = () => {
    setAutoPlayTimer(5);
  };

  useEffect(() => {
    if (autoPlayTimer !== null && autoPlayTimer > 0) {
      const timer = setTimeout(() => {
        setAutoPlayTimer(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (autoPlayTimer === 0) {
      setAutoPlayTimer(null);
      startRound(true);
    }
  }, [autoPlayTimer]);

  useEffect(() => {
    prefetchNextRound(); // Initial prefetch
    fetchCoins();
    startCountdown(); // Infinite loop starts right here

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await syncUserProfile(firebaseUser);
        setUser({ ...firebaseUser, ...profile });
        if (profile) {
          const profileData = profile as any;
          const curActiveCoin = profileData.activeCoin || 'INR';
          const dBalances = profileData.coinBalances || {};
          const mergedBalances = {
            INR: dBalances.INR !== undefined ? dBalances.INR : (profileData.walletBalance || 0),
            BTC: dBalances.BTC || 0,
            ETH: dBalances.ETH || 0,
            USDT: dBalances.USDT || 0,
            SOL: dBalances.SOL || 0,
            DOGE: dBalances.DOGE || 0
          };
          setActiveCoin(curActiveCoin);
          setCoinBalances(mergedBalances);
          setBalance(mergedBalances[curActiveCoin] || 0);
          setWithdrawableBalance(mergedBalances[curActiveCoin] || 0);
          setIsBlocked(!!profileData.isBlocked);
        }
      } else {
        setUser(null);
        setBalance(0);
        setActiveCoin('INR');
        setCoinBalances({ INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 });
        setWithdrawableBalance(0);
        setIsBlocked(false);
      }
      setAuthLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Real-time Balance and Block Status Sync from Firestore
  useEffect(() => {
    if (!user) {
      setIsBlocked(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const curActiveCoin = data.activeCoin || 'INR';
        const dBalances = data.coinBalances || {};
        const mergedBalances = {
          INR: dBalances.INR !== undefined ? dBalances.INR : (data.walletBalance || 0),
          BTC: dBalances.BTC || 0,
          ETH: dBalances.ETH || 0,
          USDT: dBalances.USDT || 0,
          SOL: dBalances.SOL || 0,
          DOGE: dBalances.DOGE || 0
        };
        setActiveCoin(curActiveCoin);
        setCoinBalances(mergedBalances);
        setBalance(mergedBalances[curActiveCoin] || 0);
        setIsBlocked(!!data.isBlocked);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // Real-time History Sync from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      console.log("History snapshot received:", snapshot.size, "docs");
      const historyData = snapshot.docs.map(doc => ({
        id: parseInt(doc.id),
        multiplier: doc.data().multiplier,
        time: new Date(doc.data().timestamp?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      console.log("New history data:", historyData);
      setHistory(historyData);
    });
    return () => unsub();
  }, [user?.uid]);

  const startRound = async (isAutoStart = false) => {
    // If running manually and user is not logged in, show Auth modal
    const currentUser = userRef.current;
    if (!currentUser && !isAutoStart) {
      setShowAuthModal(true);
      return;
    }

    if (isPlaying) {
      if (hasActiveBet && !hasCashedOut && !isCrashed) {
        cashOut();
      }
      return;
    }

    setAutoPlayTimer(null);

    setIsCrashed(false);
    setHasCashedOut(false);
    setCashedOutMultiplier(null);
    setMultiplier(1.00);
    setMultiplierPoints([{ x: 0, y: 1 }]);
    setError(null);
    setAutoPlayTimer(null);

    // Lock in the bet for this round using the latest ref values
    const currentBetAmount = betAmountRef.current;
    const currentBalance = balanceRef.current;
    const queued = isBetQueuedRef.current;
    const autoPlayActive = isAutoPlayRef.current;

    if (currentUser && (queued || (autoPlayActive && currentBalance >= currentBetAmount))) {
      setHasActiveBet(true);
      const newBalance = currentBalance - currentBetAmount;
      updateUserBalance(currentUser.uid, newBalance, activeCoin);
      setWithdrawableBalance(prev => Math.max(0, prev - currentBetAmount));
      setIsBetQueued(false); // Reset queue
    } else {
      setHasActiveBet(false);
    }

    // Use pre-fetched data or fetch fresh
    if (nextRoundData.current) {
      const { crashPoint, crashReason, isOverride } = nextRoundData.current;
      
      // Update refs directly to avoid state race condition
      crashPointRef.current = crashPoint;
      setCrashPoint(crashPoint);
      setCrashReason(crashReason);
      
      nextRoundData.current = null;
      setIsPlaying(true);
      prefetchNextRound(); // Fetch the one after this
    } else {
      setLoading(true);
      try {
        const data = await safeFetchJson('/api/round/start', { method: 'POST' });
        
        // Update refs directly
        crashPointRef.current = data.crashPoint;
        setCrashPoint(data.crashPoint);
        setCrashReason(data.crashReason);
        
        setIsPlaying(true);
        prefetchNextRound();
      } catch (err: any) {
        console.warn("Express server unavailable, proceeding with local ride simulation.");
        const rand = Math.random();
        let localCrashPoint;
        if (rand < 0.5) {
          localCrashPoint = 1.00 + (Math.random() * 1.00);
        } else if (rand < 0.8) {
          localCrashPoint = 2.00 + (Math.random() * 3.00);
        } else {
          localCrashPoint = 5.00 + (Math.random() * 5.00);
        }
        const finalCrashPoint = parseFloat(localCrashPoint.toFixed(2));
        const finalCrashReasons = [
          "Challan kat gaya 👮‍♂️",
          "Saand samne aa gaya 🐂",
          "Pothole me gir gaye 🕳️",
          "Mama ne pakad liya 🚓",
          "Petrol khatam ho gaya ⛽",
          "Tyre puncture ho gaya 📌",
          "Aage traffic jam hai 🚥",
          "Raste me JCB ki khudai chal rahi hai 🚜",
          "Papa ki pari ne takkar maar di 🛴"
        ];
        const finalCrashReason = finalCrashReasons[Math.floor(Math.random() * finalCrashReasons.length)];
        
        setCrashPoint(finalCrashPoint);
        setCrashReason(finalCrashReason);
        setIsPlaying(true);
        setError(null);
      } finally {
        setLoading(false);
      }
    }
  };

  const cashOut = () => {
    if (hasCashedOut || isCrashed || !isPlaying || !hasActiveBet) return;
    
    // Calculate final win
    const currentMult = multiplier;
    const currentBet = betAmountRef.current;
    const currentBal = balanceRef.current;
    const winAmount = Math.floor(currentBet * currentMult);
    
    setHasCashedOut(true);
    setCashedOutMultiplier(currentMult);
    
    // Update balances
    const currentUser = userRef.current;
    if (currentUser) {
      const newBalance = currentBal + winAmount;
      updateUserBalance(currentUser.uid, newBalance, activeCoin);
      // Add only current profit
      setWithdrawableBalance(prev => prev + winAmount);
      
      // Save to Firestore History
      saveGameHistory(currentUser.uid, {
          betAmount: currentBet,
          multiplier: currentMult,
          winAmount,
          status: 'win'
      });
    }
    
    console.log(`Cashed out at ${currentMult}x for ₹${winAmount}`);
  };

  const updateMultiplier = (timestamp: number) => {
    // If we are no longer playing or already crashed, or if crashPoint is missing, abort frame loop!
    if (!isPlayingRef.current || isCrashedRef.current || !crashPointRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    // Faster growth curve: reaches ~10x in about 4 seconds
    const currentMultiplier = Math.exp(elapsed * 0.0006);
    const targetCrash = crashPointRef.current;

    if (currentMultiplier >= targetCrash) {
      const finalMultiplier = targetCrash;
      
      // Stop recursion instantly
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }

      setMultiplier(finalMultiplier);
      setIsCrashed(true);
      setIsPlaying(false);
      
      // Save Loss to History using fresh ref values
      const currentUser = userRef.current;
      if (currentUser && hasActiveBetRef.current && !hasCashedOutRef.current) {
        saveGameHistory(currentUser.uid, {
            betAmount: betAmountRef.current,
            multiplier: finalMultiplier,
            winAmount: 0,
            status: 'loss'
        });
      }

      setHasActiveBet(false);
      setIsBetQueued(false); // Reset queue

      // Brief hold (3 seconds) on crash details, then proceed automatically to countdown
      setTimeout(() => {
        setIsCrashed(false);
        startCountdown();
      }, 3000);
    } else {
      setMultiplier(currentMultiplier);
      // Update points for the chart - update every frame for max smoothness
      setMultiplierPoints(prev => [...prev, { x: elapsed / 1000, y: currentMultiplier }]);
      animationRef.current = requestAnimationFrame(updateMultiplier);
    }
  };

  useEffect(() => {
    if (isPlaying && !isCrashed) {
      startTimeRef.current = 0; // Reset startTime so that the loop recalculates a fresh startTimeRef on the first frame
      animationRef.current = requestAnimationFrame(updateMultiplier);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    };
  }, [isPlaying, isCrashed]);

  const handleAdjustBet = (type: 'half' | 'double') => {
    if (isPlaying && hasActiveBet && !isCrashed) return;
    setBetAmount(prev => {
      const newVal = type === 'half' ? Math.floor(prev / 2) : prev * 2;
      return Math.max(10, newVal); // Min bet 10
    });
  };

  const removeNotification = (id: number) => {
    setUserNotifications(prev => prev.filter(n => n.id !== id));
  };

  const [adminPasscode, setAdminPasscode] = useState(() => localStorage.getItem('rider_admin_pin') || '350');
  const [newPasscodeInput, setNewPasscodeInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const handleAdminAuth = () => {
    if (passcodeInput === adminPasscode) {
      setIsAdminAuthenticated(true);
      setPasscodeError(false);
    } else {
      setPasscodeError(true);
      setTimeout(() => setPasscodeError(false), 2000);
    }
  };

  const updatePasscode = () => {
    if (newPasscodeInput.length >= 3) {
      setAdminPasscode(newPasscodeInput);
      localStorage.setItem('rider_admin_pin', newPasscodeInput);
      setAdminStatus("Passcode Updated Successfully! ✅");
      setNewPasscodeInput('');
      setTimeout(() => setAdminStatus(null), 3000);
    } else {
      setAdminStatus("PIN must be at least 3 digits! ❌");
      setTimeout(() => setAdminStatus(null), 3000);
    }
  };

  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<any | null>(null);
  const [withdrawInput, setWithdrawInput] = useState('500');
  const [depositAmountInput, setDepositAmountInput] = useState('500');
  const [depositTxId, setDepositTxId] = useState('');
  const [userWithdrawAddress, setUserWithdrawAddress] = useState('');
  const [withdrawStep, setWithdrawStep] = useState<'coin' | 'amount'>('coin');

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawInput);
    if (!selectedCoin) {
      setError("Pehle coin select karo!");
      return;
    }
    if (userWithdrawAddress.length < 10) {
      setError("Valid wallet address dalo!");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setError("Valid amount dalo bhai!");
      return;
    }
    const coinBalance = coinBalances[selectedCoin.symbol] || 0;
    if (amount > coinBalance) {
      setError(`Aapke paas is coin (${selectedCoin.symbol}) me sirf ${coinBalance} balance ya fuel nahi hai!`);
      setTimeout(() => setError(null), 4000);
      return;
    }
    if (amount > withdrawableBalance) {
      setError("Sirf 'Winnings' balance hi withdraw hota hai!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      const res = await fetch('/api/withdraw/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, coin: selectedCoin, userAddress: userWithdrawAddress, userId: user.uid })
      });
      if (res.ok) {
        updateUserBalance(user.uid, coinBalance - amount, selectedCoin.symbol);
        setWithdrawableBalance(prev => Math.max(0, prev - amount));
        setIsWithdrawModalOpen(false);
        setSelectedCoin(null);
        setWithdrawStep('coin');
        setUserWithdrawAddress('');
        setAdminStatus("Withdrawal Request Sent! 💸");
        setTimeout(() => setAdminStatus(null), 3000);
      }
    } catch (err) {
      setError("Withdrawal request failed!");
    }
  };

  const requestDeposit = async () => {
    if (!selectedCoin) {
      setError("Coin select karo!");
      return;
    }
    if (!depositTxId || depositTxId.length < 5) {
      setError("Transaction ID ya Ref ID dalo!");
      return;
    }
    const amount = parseFloat(depositAmountInput);
    if (isNaN(amount) || amount <= 0) {
      setError("Amount sahi dalo!");
      return;
    }

    try {
      const res = await fetch('/api/deposit/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, coin: selectedCoin, transactionId: depositTxId, userId: user.uid })
      });
      if (res.ok) {
        setIsDepositModalOpen(false);
        setSelectedCoin(null);
        setDepositTxId('');
        setAdminStatus("Deposit Request Sent! Admin verify karega. ⏳");
        setTimeout(() => setAdminStatus(null), 5000);
      }
    } catch (err) {
      setError("Request fail ho gayi!");
    }
  };

  const [showAdmin, setShowAdmin] = useState(false);
  const [adminCrashPoint, setAdminCrashPoint] = useState('2.00');
  const [adminCrashReason, setAdminCrashReason] = useState('Admin forced crash!');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [adminWithdrawals, setAdminWithdrawals] = useState<any[]>([]);
  const [adminDeposits, setAdminDeposits] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [userBalanceInputs, setUserBalanceInputs] = useState<Record<string, string>>({});
  const [userCoinSelections, setUserCoinSelections] = useState<Record<string, string>>({});

  const fetchAdminUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: any[] = [];
      snap.forEach(doc => {
        list.push({ ...doc.data(), uid: doc.id });
      });
      setAdminUsers(list);
    } catch (err: any) {
      console.warn("Direct client-side load users failed, trying api fallback:", err.message || err);
      try {
        const data = await safeFetchJson('/api/admin/users');
        setAdminUsers(Array.isArray(data) ? data : []);
      } catch (fallbackErr: any) {
        console.warn("All attempts to load admin users failed:", fallbackErr.message || fallbackErr);
      }
    }
  };

  const handleAddUserBalance = async (userId: string) => {
    const amountVal = userBalanceInputs[userId];
    if (!amountVal) {
      setAdminStatus("Bhai, balance amount dalo! 💸");
      setTimeout(() => setAdminStatus(null), 3000);
      return;
    }
    const val = parseFloat(amountVal);
    if (isNaN(val) || val < 0) {
      setAdminStatus("Incorrect Amount! Positive number (or 0) dalo. ❌");
      setTimeout(() => setAdminStatus(null), 3000);
      return;
    }

    const selectedSymbol = userCoinSelections[userId] || 'INR';
    const selectedCoinObj = selectedSymbol === 'INR'
      ? { name: 'Direct Fuel Balance', symbol: 'INR', color: '#FFD700' }
      : (coins.find(c => c.symbol === selectedSymbol) || { name: 'Direct Fuel Balance', symbol: 'INR', color: '#FFD700' });

    try {
      const userRef = doc(db, 'users', userId);
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

      const currentCoinBalance = coinBalances[selectedSymbol] || 0;
      const targetBalance = parseFloat((currentCoinBalance + val).toFixed(8));
      
      await updateUserBalance(userId, targetBalance, selectedSymbol);

      // Add a customized notification
      const notificationId = Date.now().toString();
      const notificationRef = doc(db, 'notifications', notificationId);
      await setDoc(notificationRef, {
        id: Date.now(),
        type: 'deposit_approved',
        amount: val,
        coin: { name: selectedCoinObj.name, symbol: selectedCoinObj.symbol, color: selectedCoinObj.color },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: `Admin has added ${val} balance directly to your account in ${selectedCoinObj.symbol}! ✅`
      });

      // Invoke server-side API to sync local lists/variables if applicable
      fetch('/api/admin/user/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amountToAdd: val, coinSymbol: selectedSymbol })
      }).catch(err => {
        console.warn("Non-blocking server webhook balance-update notify:", err);
      });

      setAdminStatus(`User Fuel Balance Direct Added! ✅ (${selectedCoinObj.symbol})`);
      setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
      fetchAdminUsers();
      setTimeout(() => setAdminStatus(null), 5000);
    } catch (err: any) {
      console.error("Direct client update failed, trying backend fallback:", err);
      try {
        const res = await fetch('/api/admin/user/update-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amountToAdd: val, coinSymbol: selectedSymbol })
        });
        if (res.ok) {
          setAdminStatus(`User Balance Updated Successfully (via API)! ✅ (${selectedCoinObj.symbol})`);
          setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
          fetchAdminUsers();
          setTimeout(() => setAdminStatus(null), 5000);
        } else {
          const errData = await res.json();
          setAdminStatus(errData.error || "Update fail ho gaya! ❌");
          setTimeout(() => setAdminStatus(null), 5000);
        }
      } catch (fallbackErr: any) {
        console.error("Direct balance fallback failed:", fallbackErr);
        setAdminStatus("Failed to update: " + (err.message || String(err)));
        setTimeout(() => setAdminStatus(null), 5000);
      }
    }
  };

  const handleSetUserBalance = async (userId: string) => {
    const amountVal = userBalanceInputs[userId];
    if (amountVal === undefined || amountVal === '') {
      setAdminStatus("Bhai, balance amount dalo! 💸");
      setTimeout(() => setAdminStatus(null), 3000);
      return;
    }
    const val = parseFloat(amountVal);
    if (isNaN(val) || val < 0) {
      setAdminStatus("Incorrect Amount! Positive number (or 0) dalo. ❌");
      setTimeout(() => setAdminStatus(null), 3000);
      return;
    }

    const selectedSymbol = userCoinSelections[userId] || 'INR';

    try {
      // SET balance directly
      const targetBalance = parseFloat(val.toFixed(8));
      await updateUserBalance(userId, targetBalance, selectedSymbol);

      // Add a customized notification
      const notificationId = Date.now().toString();
      const notificationRef = doc(db, 'notifications', notificationId);
      await setDoc(notificationRef, {
        id: Date.now(),
        type: 'deposit_approved',
        amount: targetBalance,
        coin: { name: 'Direct Fuel Balance', symbol: selectedSymbol, color: '#FFD700' },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: `Admin has set your balance directly to ${targetBalance} in ${selectedSymbol}! ✅`
      });

      // Update balances directly via Firestore client (rules permit this for admins)
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        walletBalance: selectedSymbol === 'INR' ? targetBalance : undefined,
        coinBalances: { [selectedSymbol]: targetBalance },
        updatedAt: serverTimestamp()
      }, { merge: true });

      setAdminStatus(`User Fuel Balance SET! ✅ (${selectedSymbol})`);
      setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
      
      // Optimistically update the local state
      setAdminUsers(prevUsers => prevUsers.map(u => {
        if (u.uid === userId) {
          const updatedUser = { ...u };
          if (!updatedUser.coinBalances) updatedUser.coinBalances = {};
          updatedUser.coinBalances[selectedSymbol] = targetBalance;
          if (selectedSymbol === 'INR') {
            updatedUser.walletBalance = targetBalance;
          }
          return updatedUser;
        }
        return u;
      }));

      fetchAdminUsers();
      setTimeout(() => setAdminStatus(null), 5000);
    } catch (err: any) {
      console.error("Direct client SET failed, trying backend fallback:", err);
      try {
        const res = await fetch('/api/admin/user/update-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amountToAdd: val, coinSymbol: selectedSymbol })
        });
        if (res.ok) {
          setAdminStatus(`User Balance Set Successfully (via API)! ✅`);
          setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
          fetchAdminUsers();
          setTimeout(() => setAdminStatus(null), 5000);
        } else {
          const errData = await res.json();
          setAdminStatus(errData.error || "Set fail ho gaya! ❌");
          setTimeout(() => setAdminStatus(null), 5000);
        }
      } catch (fallbackErr: any) {
        console.error("Direct balance fallback failed:", fallbackErr);
        setAdminStatus("Failed to set: " + (err.message || String(err)));
        setTimeout(() => setAdminStatus(null), 5000);
      }
    }
  };

  const handleResetUserBalance = async (userId: string) => {
    if (!window.confirm("Aap is user ka balance ₹0 (zero) karna chahte hain?")) {
      return;
    }
    try {
      const userRef = doc(db, 'users', userId);
      console.log("Attempting Firestore reset for", userId);
      await setDoc(userRef, { 
        walletBalance: 0,
        coinBalances: { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 },
        activeCoin: 'INR',
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log("Firestore reset successful");

      const notificationId = Date.now().toString();
      const notificationRef = doc(db, 'notifications', notificationId);
      await setDoc(notificationRef, {
        id: Date.now(),
        type: 'balance_reset',
        amount: 0,
        coin: { name: 'Direct Fuel Balance', symbol: 'INR', color: '#FFD700' },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: `Admin has reset your fuel balance to ₹0 due to correction. 🛠️`
      });

      fetch('/api/admin/user/reset-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(err => {
        console.warn("Non-blocking server reset webhook notify:", err);
      });

      setAdminStatus("User Fuel Balance Reset to ₹0! 🛠️✅");
      fetchAdminUsers();
      setTimeout(() => setAdminStatus(null), 5000);
    } catch (err: any) {
      console.error("Reset balance failed, using backend fallback:", err);
      try {
        const res = await fetch('/api/admin/user/reset-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          setAdminStatus("User Balance Reset to ₹0 Successfully (via API)! ✅");
          fetchAdminUsers();
          setTimeout(() => setAdminStatus(null), 5000);
        } else {
          setAdminStatus("Reset balance via API failed! ❌");
          setTimeout(() => setAdminStatus(null), 5000);
        }
      } catch (fallbackErr) {
        setAdminStatus("Failed to reset balance: " + (err.message || String(err)));
        setTimeout(() => setAdminStatus(null), 5000);
      }
    }
  };

  const handleToggleBlockUser = async (userId: string, currentBlocked: boolean) => {
    const actionLabel = currentBlocked ? "Unblock" : "Block";
    if (!window.confirm(`Kya aap is rider ko ${actionLabel} karna chahte hain?`)) {
      return;
    }
    const targetBlocked = !currentBlocked;
    console.log(`Action: ${actionLabel}ing user ${userId}. Target blocked status: ${targetBlocked}`);
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, { 
        isBlocked: targetBlocked,
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log(`Client-side Firestore setDoc successful for user ${userId}`);

      const notificationId = Date.now().toString();
      const notificationRef = doc(db, 'notifications', notificationId);
      await setDoc(notificationRef, {
        id: Date.now(),
        type: 'account_status',
        amount: 0,
        coin: { name: 'System Security', symbol: 'SEC', color: '#ef4444' },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: targetBlocked 
          ? `Your account has been blocked by the administrator. 🚫 Please contact support.` 
          : `Your account has been successfully unblocked by the administrator. ✅`
      });

      console.log(`Sending toggle-block API request for user ${userId}`);
      fetch('/api/admin/user/toggle-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isBlocked: targetBlocked })
      }).then(res => res.json()).then(data => console.log("Toggle block API response:", data)).catch(err => {
        console.warn("Non-blocking server status toggle webhook notify:", err);
      });

      setAdminStatus(`Rider ${actionLabel}ed Successfully! ✅`);
      fetchAdminUsers();
      setTimeout(() => setAdminStatus(null), 5000);
    } catch (err: any) {
      console.error("Toggle block status failed, trying backend fallback:", err);
      // ... (rest of fallback)
      try {
        const res = await fetch('/api/admin/user/toggle-block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, isBlocked: targetBlocked })
        });
        if (res.ok) {
          setAdminStatus(`Rider ${actionLabel}ed Successfully (via API)! ✅`);
          fetchAdminUsers();
          setTimeout(() => setAdminStatus(null), 5000);
        } else {
          setAdminStatus(`Failed to ${actionLabel} rider via API! ❌`);
          setTimeout(() => setAdminStatus(null), 5000);
        }
      } catch (fallbackErr) {
        setAdminStatus("Failed to toggle block: " + (err.message || String(err)));
        setTimeout(() => setAdminStatus(null), 5000);
      }
    }
  };

  const fetchAdminWithdrawals = async () => {
    try {
      const data = await safeFetchJson('/api/admin/withdrawals');
      setAdminWithdrawals(data);
    } catch (err: any) {
      console.warn("Load withdrawals failed:", err.message || err);
    }
  };

  const fetchAdminDeposits = async () => {
    try {
      const data = await safeFetchJson('/api/admin/deposits');
      setAdminDeposits(data);
    } catch (err: any) {
      console.warn("Load deposits failed:", err.message || err);
    }
  };

  const [userNotifications, setUserNotifications] = useState<any[]>([]);

  const fetchUserNotifications = async () => {
    try {
      const data = await safeFetchJson('/api/user/notifications');
      if (data && Array.isArray(data) && data.length > userNotifications.length) {
          // Check for deposit approvals to add balance
          const newNotifs = data.slice(userNotifications.length);
          newNotifs.forEach((notif: any) => {
            if (notif.type === 'deposit_approved') {
              setBalance(prev => prev + notif.amount);
            }
          });
          setUserNotifications(data);
      }
    } catch (err: any) {
      console.warn("Load notifications failed:", err.message || err);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated && showAdmin) {
      fetchAdminWithdrawals();
      fetchAdminDeposits();
      fetchAdminUsers();
      const interval = setInterval(() => {
        fetchAdminWithdrawals();
        fetchAdminDeposits();
        fetchAdminUsers();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isAdminAuthenticated, showAdmin]);

  useEffect(() => {
    const interval = setInterval(fetchUserNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  const approveWithdrawal = async (requestId: number) => {
    try {
      const res = await fetch('/api/admin/withdraw/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        setAdminStatus("Withdrawal Approved! ✅");
        fetchAdminWithdrawals();
        setTimeout(() => setAdminStatus(null), 3000);
      }
    } catch (err) {
      setAdminStatus("Approval failed ❌");
    }
  };

  const approveDeposit = async (requestId: number, userId: string, amount: number, coinSymbol: string) => {
    try {
      const res = await fetch('/api/admin/deposit/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        // Also update the user's balance in Firestore from the admin panel
        try {
          const userSnap = await getDoc(doc(db, 'users', userId));
          if (userSnap.exists()) {
            const data = userSnap.data();
            const coinBalances = data.coinBalances || {};
            const currentBalance = coinBalances[coinSymbol] !== undefined ? coinBalances[coinSymbol] : (data.walletBalance || 0);
            await updateUserBalance(userId, currentBalance + amount, coinSymbol);
          }
        } catch (fErr) {
          console.error("Firestore balance update failed for user", userId);
        }

        setAdminStatus("Deposit Approved & Balance Added! ✅");
        fetchAdminDeposits();
        setTimeout(() => setAdminStatus(null), 3000);
      }
    } catch (err) {
      setAdminStatus("Approval failed ❌");
    }
  };

  const saveCryptoAddresses = async () => {
    try {
      const data = await safeFetchJson('/api/admin/set-crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins })
      });
      setAdminStatus(data.message);
      fetchCoins(); // Refresh to sync
      setTimeout(() => setAdminStatus(null), 3000);
    } catch (err: any) {
      setAdminStatus("Error updating addresses");
      console.warn("Error updating addresses:", err.message || err);
    }
  };

  const setAdminOverride = async () => {
    try {
      const data = await safeFetchJson('/api/admin/set-crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crashPoint: adminCrashPoint, crashReason: adminCrashReason })
      });
      setAdminStatus(data.message);
      setTimeout(() => setAdminStatus(null), 3000);
      prefetchNextRound(); // Force pre-fetch the next round with the new override
    } catch (err: any) {
      setAdminStatus("Error setting override");
      console.warn("Error setting override:", err.message || err);
    }
  };

  const clearAdminOverride = async () => {
    try {
      await fetch('/api/admin/consume-override', { method: 'POST' });
      setAdminStatus("Physics Override cleared! ✅");
      setTimeout(() => setAdminStatus(null), 3000);
      prefetchNextRound();
    } catch (err: any) {
      setAdminStatus("Error clearing override");
      console.warn("Error clearing override:", err.message || err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-[#0F0F0F] items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-[#FFD700] animate-spin" />
        <p className="text-zinc-500 font-black uppercase italic tracking-[0.3em] animate-pulse">Warming up the engine...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#0F0F0F] text-[#F5F5F5] font-sans border-zinc-800 relative">
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      {/* Admin Toggle */}
      <button 
        onClick={() => setShowAdmin(!showAdmin)}
        className="fixed bottom-20 right-4 z-50 bg-[#FFD700] p-3 rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(255,215,0,0.3)] flex items-center gap-2 group border-2 border-white/20"
        title="Open Admin Panel"
      >
        <User className="w-5 h-5 text-black" />
        <span className="text-black font-black text-xs uppercase italic tracking-tighter">Admin</span>
      </button>

      <AnimatePresence>
        {showAdmin && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-[#1A1A1A] border-t-4 border-[#FFD700] p-6 shadow-[0_-10px_50px_rgba(0,0,0,0.8)] max-h-[500px] overflow-y-auto"
          >
            <div className="max-w-4xl mx-auto">
              {!isAdminAuthenticated ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <h3 className="text-[#FFD700] font-black uppercase italic text-xl">Admin Verification Required</h3>
                  <p className="text-zinc-500 text-sm italic">"Oye! Passcode bata pehle..."</p>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      placeholder="Enter PIN"
                      value={passcodeInput}
                      onChange={(e) => setPasscodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminAuth()}
                      className={`bg-black border-2 ${passcodeError ? 'border-red-600' : 'border-zinc-800'} p-3 text-white font-mono rounded text-center text-2xl w-40 outline-none`}
                    />
                    <button 
                      onClick={handleAdminAuth}
                      className="bg-[#FFD700] text-black font-black px-6 uppercase text-sm hover:bg-white"
                    >
                      Enter
                    </button>
                  </div>
                  {passcodeError && <p className="text-red-500 font-bold uppercase text-[10px]">Ghalat PIN! Re-try kar...</p>}
                  <button 
                    onClick={() => setShowAdmin(false)} 
                    className="mt-6 bg-zinc-900 text-zinc-500 px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:text-white transition-all border border-zinc-800"
                  >
                    Close & Go Back to Game
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black italic uppercase text-[#FFD700]">Rider Admin Controls</h2>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => {
                          setIsAdminAuthenticated(false);
                          setShowAdmin(false);
                          setPasscodeInput('');
                        }} 
                        className="bg-red-600 text-white px-6 py-2 text-xs font-black uppercase italic shadow-[0_0_15px_rgba(220,38,38,0.4)] hover:bg-red-700 transition-all rounded-lg border-2 border-white/20"
                      >
                        LOGOUT & EXIT
                      </button>
                      <button 
                        onClick={() => setShowAdmin(false)} 
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 text-xs font-black uppercase italic rounded-lg border-2 border-zinc-700 transition-all"
                      >
                        CLOSE
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-zinc-800">
                    <div className="space-y-2">
                      <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Physics Override</h4>
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Target Crash Point (x)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={adminCrashPoint}
                        onChange={(e) => setAdminCrashPoint(e.target.value)}
                        className="w-full bg-black border border-zinc-800 p-3 text-white font-mono rounded"
                      />
                    </div>
                    <div className="space-y-2 mt-auto">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Custom Crash Reason</label>
                      <input 
                        type="text" 
                        value={adminCrashReason}
                        onChange={(e) => setAdminCrashReason(e.target.value)}
                        className="w-full bg-black border border-zinc-800 p-3 text-white rounded"
                      />
                    </div>
                  </div>

                  {/* Password Settings Section */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-zinc-800">
                    <div className="space-y-2">
                       <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Security Settings</h4>
                       <label className="text-[10px] font-bold uppercase text-zinc-500">New Admin PIN</label>
                       <div className="flex gap-2">
                          <input 
                            type="password" 
                            placeholder="Set New PIN"
                            value={newPasscodeInput}
                            onChange={(e) => setNewPasscodeInput(e.target.value)}
                            className="bg-black border border-zinc-800 p-3 text-white font-mono rounded flex-1 outline-none focus:border-[#FFD700]"
                          />
                          <button 
                            onClick={updatePasscode}
                            className="bg-zinc-800 text-white px-4 py-2 uppercase text-[10px] font-black hover:bg-zinc-700"
                          >
                            Update PIN
                          </button>
                       </div>
                    </div>
                  </div>

                  {/* Crypto Address Management */}
                  <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                        <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Crypto Wallet Management</h4>
                        <button 
                            onClick={saveCryptoAddresses}
                            className="bg-[#FFD700] text-black px-4 py-1 text-[10px] font-black uppercase italic hover:bg-white"
                        >
                            Save Addresses
                        </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {coins.map((coin, index) => (
                            <div key={coin.symbol} className="bg-black/40 p-3 border border-zinc-800 rounded space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-[10px]" style={{ color: coin.color }}>{coin.name}</span>
                                <span className="text-[9px] text-zinc-500 font-mono">{coin.symbol}</span>
                            </div>
                            <input 
                                type="text" 
                                value={coin.address}
                                onChange={(e) => {
                                const newCoins = [...coins];
                                newCoins[index] = { ...coin, address: e.target.value };
                                setCoins(newCoins);
                                }}
                                className="w-full bg-black border border-zinc-900 p-2 text-[10px] font-mono text-zinc-300 rounded focus:border-[#FFD700] outline-none"
                                placeholder="Wallet Address"
                            />
                            </div>
                        ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Withdrawal Approvals</h4>
                        <div className="bg-black/40 border border-zinc-800 rounded overflow-hidden">
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-left text-[10px]">
                                    <thead className="bg-zinc-900 text-zinc-500 uppercase">
                                        <tr>
                                            <th className="p-2">Details</th>
                                            <th className="p-2">User Wallet</th>
                                            <th className="p-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900">
                                        {adminWithdrawals.slice().reverse().map((req) => (
                                            <tr key={req.id} className="hover:bg-white/5 transition-colors">
                                                <td className="p-2">
                                                    <p className="text-white font-bold">₹{req.amount.toLocaleString()}</p>
                                                    <p className="text-zinc-500 uppercase">{req.coin.symbol}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                        req.status === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="p-2 font-mono text-zinc-400 break-all max-w-[100px]">
                                                    {req.userAddress}
                                                </td>
                                                <td className="p-2">
                                                    {req.status === 'pending' && (
                                                        <button 
                                                            onClick={() => approveWithdrawal(req.id)}
                                                            className="bg-green-600 text-white px-3 py-1 rounded font-black hover:bg-green-500 transition-all"
                                                        >
                                                            APPROVE
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {adminWithdrawals.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-zinc-600 italic">No withdrawal requests</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Deposit Approvals</h4>
                        <div className="bg-black/40 border border-zinc-800 rounded overflow-hidden">
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-left text-[10px]">
                                    <thead className="bg-zinc-900 text-zinc-500 uppercase">
                                        <tr>
                                            <th className="p-2">Details</th>
                                            <th className="p-2">TXID / ID</th>
                                            <th className="p-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900">
                                        {adminDeposits.slice().reverse().map((req) => (
                                            <tr key={req.id} className="hover:bg-white/5 transition-colors">
                                                <td className="p-2">
                                                    <p className="text-white font-bold">₹{req.amount.toLocaleString()}</p>
                                                    <p className="text-zinc-500 uppercase">{req.coin.symbol}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                        req.status === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="p-2 font-mono text-zinc-400 break-all max-w-[100px]">
                                                    {req.transactionId}
                                                </td>
                                                <td className="p-2">
                                                    {req.status === 'pending' && (
                                                        <button 
                                                            onClick={() => approveDeposit(req.id, req.userId, req.amount, req.coin?.symbol || 'INR')}
                                                            className="bg-[#FFD700] text-black px-3 py-1 rounded font-black hover:bg-white transition-all"
                                                        >
                                                            CONFIRM
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {adminDeposits.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-zinc-600 italic">No deposit requests</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                  </div>

                  {/* Registered Users & Manually Add Fuel Balance Management */}
                  <div className="mt-8 pt-6 border-t border-zinc-800 space-y-4">
                    <h4 className="text-[#FFD700] font-bold text-xs uppercase tracking-widest">Registered User Fuel Balance Management</h4>
                    <div className="bg-black/40 border border-zinc-800 rounded overflow-hidden">
                      <div className="max-h-80 overflow-y-auto w-full">
                        <table className="w-full text-left text-xs min-w-[700px]">
                          <thead className="bg-[#111] text-zinc-400 uppercase text-[9px] font-bold border-b border-zinc-800">
                            <tr>
                              <th className="p-3">User Details</th>
                              <th className="p-3">User UID</th>
                              <th className="p-3">Current Fuel Balance</th>
                              <th className="p-3">Access Status</th>
                              <th className="p-3 text-right">Add Balance Features</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {adminUsers.map((u) => (
                              <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                                <td className="p-3">
                                  <p className="text-white font-bold">{u.displayName || 'Anonymous Rider'}</p>
                                  <p className="text-zinc-500 font-mono text-[10px]">{u.email || 'No email linked'}</p>
                                </td>
                                <td className="p-3 font-mono text-zinc-500 text-[10px] select-all">
                                  {u.uid}
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="text-[#FFD700] font-mono font-bold text-sm">
                                      {u.activeCoin || 'INR'}: {(!u.activeCoin || u.activeCoin === 'INR') ? '₹' : ''}
                                      {(u.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: (!u.activeCoin || u.activeCoin === 'INR') ? 2 : 4 })}
                                    </span>
                                    {u.coinBalances && (
                                      <div className="flex flex-col gap-0.5 mt-1">
                                        {Object.entries(u.coinBalances)
                                          .filter(([cSym, cVal]) => cSym !== (u.activeCoin || 'INR') && (cVal as number) > 0)
                                          .map(([cSym, cVal]) => (
                                            <span key={cSym} className="text-[9px] text-zinc-400 font-mono">
                                              • {cSym}: {cVal as number}
                                            </span>
                                          ))
                                        }
                                      </div>
                                    )}
                                    <button
                                      onClick={() => handleResetUserBalance(u.uid)}
                                      className="text-red-500 hover:text-red-400 font-bold hover:underline text-[9px] uppercase italic cursor-pointer bg-red-500/10 hover:bg-red-500/20 px-1.5 py-0.5 rounded border border-red-900/30 transition-all active:scale-95 mt-1"
                                    >
                                      Reset ALL to 0 🛠️
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-col items-start gap-2">
                                    {u.isBlocked ? (
                                      <span className="px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-500 text-[8px] font-black uppercase tracking-wider">
                                        Blocked 🚫
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-green-950 border border-green-900 text-green-400 text-[8px] font-black uppercase tracking-wider">
                                        Active ✅
                                      </span>
                                    )}
                                    <button 
                                      onClick={() => handleToggleBlockUser(u.uid, !!u.isBlocked)}
                                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all active:scale-95 ${
                                        u.isBlocked 
                                          ? "bg-green-700 hover:bg-green-600 text-white" 
                                          : "bg-red-950/40 border border-red-800 hover:bg-red-900/60 text-red-400"
                                      }`}
                                    >
                                      {u.isBlocked ? "Unblock Rider" : "Block Rider"}
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="inline-flex gap-2 items-center">
                                    <select
                                      value={userCoinSelections[u.uid] || 'INR'}
                                      onChange={(e) => setUserCoinSelections(prev => ({
                                        ...prev,
                                        [u.uid]: e.target.value
                                      }))}
                                      className="bg-zinc-950 border border-zinc-800 text-zinc-300 px-2 py-1.5 text-xs rounded outline-none focus:border-[#FFD700] hover:border-zinc-700 cursor-pointer font-bold font-mono"
                                    >
                                      <option value="INR" style={{ color: '#FFD700' }}>INR (Direct)</option>
                                      {coins.map((coin) => (
                                        <option key={coin.symbol} value={coin.symbol} style={{ color: coin.color }}>
                                          {coin.symbol}
                                        </option>
                                      ))}
                                    </select>
                                    <input 
                                      type="number"
                                      placeholder="Amount"
                                      value={userBalanceInputs[u.uid] || ''}
                                      onChange={(e) => setUserBalanceInputs(prev => ({
                                        ...prev,
                                        [u.uid]: e.target.value
                                      }))}
                                      className="w-16 bg-zinc-950 border border-zinc-850 px-2 py-1.5 text-xs text-white rounded outline-none focus:border-[#FFD700] font-mono text-center"
                                    />
                                    <div className="flex flex-col gap-2">
                                      <button
                                        onClick={() => handleAddUserBalance(u.uid)}
                                        className="bg-[#FFD700] text-black px-3 py-1.5 rounded font-black text-[10px] uppercase hover:bg-white transition-all whitespace-nowrap active:scale-95"
                                      >
                                        ADD FUEL
                                      </button>
                                      <button
                                        onClick={() => handleSetUserBalance(u.uid)}
                                        className="bg-red-950 text-red-200 border border-red-800 px-3 py-1.5 rounded font-black text-[10px] uppercase hover:bg-red-900 transition-all whitespace-nowrap active:scale-95"
                                      >
                                        SET FUEL
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {adminUsers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-zinc-600 italic text-xs">
                                  No registered riders found in the database.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center gap-4">
                    <button 
                      onClick={setAdminOverride}
                      className="bg-[#FFD700] text-black font-black py-4 px-10 uppercase italic hover:bg-white transition-colors"
                    >
                      Apply Physics Override
                    </button>
                    <button 
                      onClick={clearAdminOverride}
                      className="bg-zinc-700 text-white font-black py-4 px-10 uppercase italic hover:bg-zinc-600 transition-colors"
                    >
                      Clear Override
                    </button>
                    {adminStatus && (
                      <p className="text-green-500 font-bold animate-pulse text-sm">{(adminStatus as string)}</p>
                    )}
                  </div>
                  <p className="mt-4 text-[10px] text-zinc-600 uppercase tracking-widest italic">
                    * Physics override only applies to the next ride. Passcode is saved in your local browser storage.
                  </p>
                  
                  <div className="mt-8 pt-6 border-t border-zinc-800">
                    <button 
                      onClick={() => setShowAdmin(false)}
                      className="w-full py-4 bg-zinc-800 text-white font-black uppercase tracking-[0.2em] italic hover:bg-zinc-700 transition-all rounded-xl border border-zinc-700"
                    >
                      Close Admin Panel
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Header Section */}
      <header className="flex items-center justify-between p-4 md:p-6 bg-gradient-to-r from-[#1A1A1A] to-[#0F0F0F] border-b border-[#333] sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-[#FFD700] rounded-full flex items-center justify-center text-black font-black text-xl md:text-2xl border-2 border-white shadow-[0_0_15px_rgba(255,215,0,0.4)]">B</div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2">
            Bullet Ride <span className="text-[#FFD700]">350</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 border-r border-zinc-800 pr-6">
                <div className="text-right leading-tight">
                  <p className="text-[10px] uppercase tracking-widest text-[#888]">Fuel Balance</p>
                  {coinBalances[activeCoin] > 0 ? (
                    <p className="text-xl md:text-2xl font-mono text-[#FFD700]">
                      {activeCoin === 'INR' ? '₹' : ''}
                      {coinBalances[activeCoin].toLocaleString(undefined, { 
                        minimumFractionDigits: activeCoin === 'INR' ? 2 : 4,
                        maximumFractionDigits: activeCoin === 'INR' ? 2 : 6
                      })}
                      {activeCoin !== 'INR' ? ` ${activeCoin}` : ''}
                    </p>
                  ) : (
                    <p className="text-xs font-black text-red-500 uppercase italic animate-pulse">Low Fuel! Please Deposit</p>
                  )}
                </div>
                <select
                  value={activeCoin}
                  onChange={async (e) => {
                    const selectedSym = e.target.value;
                    setActiveCoin(selectedSym);
                    const bal = coinBalances[selectedSym] || 0;
                    setBalance(bal);
                    try {
                      const userRef = doc(db, 'users', user.uid);
                      await setDoc(userRef, { activeCoin: selectedSym, walletBalance: bal }, { merge: true });
                    } catch (err) {
                      console.warn("Failed saving activeCoin preference:", err);
                    }
                  }}
                  className="bg-black/60 border border-zinc-800 text-zinc-300 font-bold font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded cursor-pointer hover:border-zinc-700 outline-none"
                >
                  <option value="INR" style={{ color: '#FFD700' }}>₹ INR</option>
                  {coins.map(c => (
                    <option key={c.symbol} value={c.symbol} style={{ color: c.color }}>{c.symbol}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <p className="text-xs md:text-sm font-black text-white italic uppercase tracking-tighter cursor-pointer hover:text-[#FFD700] transition-colors" onClick={() => setIsProfileModalOpen(true)}>{user.displayName}</p>
                  <button 
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-1 text-[9px] font-black text-red-500/70 hover:text-red-500 uppercase transition-colors group"
                  >
                    <LogOut className="w-2.5 h-2.5 group-hover:-translate-x-0.5 transition-transform" />
                    <span>Logout</span>
                  </button>
                </div>
                <div 
                  onClick={() => setIsProfileModalOpen(true)}
                  className="w-10 h-10 rounded-full border-2 border-[#FFD700]/30 overflow-hidden bg-zinc-800 flex items-center justify-center cursor-pointer hover:border-[#FFD700] transition-all hover:scale-105 active:scale-95"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-zinc-500" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 px-6 py-2 bg-white/5 border border-zinc-800 text-white font-black uppercase text-[10px] md:text-xs skew-x-[-12deg] hover:bg-white/10 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Login to Ride</span>
            </button>
          )}

          {user && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsDepositModalOpen(true)}
                className="px-4 py-2 bg-[#FFD700] text-black font-black uppercase text-[10px] md:text-xs skew-x-[-12deg] cursor-pointer hover:bg-white transition-all shadow-[0_0_10px_rgba(255,215,0,0.2)]"
              >
                Deposit
              </button>
              <button 
                onClick={() => setIsWithdrawModalOpen(true)}
                className="px-4 py-2 bg-zinc-800 text-white font-black uppercase text-[10px] md:text-xs skew-x-[-12deg] cursor-pointer hover:bg-zinc-700 transition-all border border-zinc-700"
              >
                Withdraw
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#1A1A1A] border-2 border-[#FFD700] rounded-3xl w-full max-w-lg relative z-10 shadow-[0_0_100px_rgba(255,215,0,0.1)] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl border-2 border-[#FFD700] overflow-hidden bg-zinc-800">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-full h-full p-4 text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">{user.displayName}</h3>
                      <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">{user.email}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsProfileModalOpen(false)} className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-black/40 border border-zinc-800 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Fuel Balance</p>
                    {coinBalances[activeCoin] > 0 ? (
                      <p className="text-2xl font-mono text-[#FFD700]">
                        {activeCoin === 'INR' ? '₹' : ''}
                        {coinBalances[activeCoin].toLocaleString(undefined, { 
                          minimumFractionDigits: activeCoin === 'INR' ? 2 : 4,
                          maximumFractionDigits: activeCoin === 'INR' ? 2 : 6
                        })}
                        {activeCoin !== 'INR' ? ` ${activeCoin}` : ''}
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-red-500 uppercase italic">Empty Fuel</p>
                    )}
                  </div>
                  <div className="bg-black/40 border border-zinc-800 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Total Rides</p>
                    <p className="text-2xl font-mono text-white">{history.length}</p>
                  </div>
                </div>

                <div className="bg-black/40 border border-zinc-800 p-3 rounded-2xl mb-8 flex justify-between items-center px-4">
                   <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Admin Access Key (UID)</p>
                   <p className="text-[9px] font-mono text-zinc-500 select-all">{user?.uid}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Recent Ride History
                  </h4>
                  <div className="bg-black/40 border border-zinc-800 rounded-2xl overflow-hidden">
                    {history.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-900 text-zinc-500 uppercase">
                            <tr>
                              <th className="p-3">Time</th>
                              <th className="p-3 text-right">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {history.map((ride, idx) => (
                              <tr key={idx} className="hover:bg-white/5 transition-colors">
                                <td className="p-3 font-mono text-zinc-400">{ride.time}</td>
                                <td className="p-3 font-black text-right italic" style={{ color: ride.multiplier >= 1 ? '#FFD700' : '#ef4444' }}>
                                  {ride.multiplier.toFixed(2)}x
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-zinc-600 text-xs italic">No rides yet. Start your engine!</p>
                      </div>
                    )}
                  </div>
                </div>

                  {user?.uid === "TUMHARI_ADMIN_UID" && (
                    <button 
                      onClick={() => { setIsProfileModalOpen(false); setShowAdmin(true); }}
                      className="flex-1 py-4 bg-zinc-800 text-[#FFD700] font-black uppercase italic rounded-2xl hover:bg-zinc-700 transition-all border border-[#FFD700]/30 flex items-center justify-center gap-2"
                    >
                      <User className="w-5 h-5" />
                      Admin Panel
                    </button>
                  )}
                  <button 
                    onClick={() => { setIsProfileModalOpen(false); signOut(auth); }}
                    className="flex-1 py-4 bg-red-600/10 border border-red-600/20 text-red-500 font-black uppercase italic rounded-2xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deposit Modal */}
      <AnimatePresence>
        {isDepositModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsDepositModalOpen(false); setSelectedCoin(null); }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#1A1A1A] border-2 border-[#FFD700] p-6 md:p-8 rounded-3xl w-full max-w-2xl relative z-10 shadow-[0_0_100px_rgba(255,215,0,0.1)] overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-3xl font-black italic uppercase text-[#FFD700]">Crypto Deposit 🪙</h3>
                  <p className="text-zinc-500 text-xs mt-1 uppercase tracking-widest font-bold">Instantly fuel your Bullet Ride</p>
                </div>
                <button onClick={() => { setIsDepositModalOpen(false); setSelectedCoin(null); }} className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full">✕</button>
              </div>

              {!selectedCoin ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {coins.map((coin) => (
                    <button 
                      key={coin.symbol}
                      onClick={() => setSelectedCoin(coin)}
                      className="flex items-center gap-4 bg-black/40 border border-zinc-800 p-4 rounded-xl hover:border-[#FFD700] hover:bg-zinc-900 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl bg-zinc-800 group-hover:scale-110 transition-transform" style={{ color: coin.color }}>
                        {coin.symbol[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-white font-bold">{coin.name}</p>
                        <p className="text-zinc-500 text-xs font-mono uppercase italic">{coin.symbol}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-700 ml-auto group-hover:text-[#FFD700]" />
                    </button>
                  ))}
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="flex items-center gap-4 bg-black/60 p-4 rounded-2xl border border-zinc-800">
                    <button onClick={() => setSelectedCoin(null)} className="text-[#FFD700] hover:underline text-xs font-bold uppercase italic">← Back</button>
                    <div className="w-1 h-8 bg-zinc-800" />
                    <div className="flex items-center gap-3">
                      <span className="font-black" style={{ color: selectedCoin.color }}>{selectedCoin.symbol}</span>
                      <span className="text-white font-bold">{selectedCoin.name} Network</span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-40 h-40 bg-white p-2 rounded-lg shrink-0 flex items-center justify-center">
                      {selectedCoin.address && selectedCoin.address.length > 5 ? (
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(selectedCoin.address)}`} 
                          alt="QR Code" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full border-4 border-black flex items-center justify-center text-black font-black text-[10px] text-center uppercase p-4 italic">
                          SET ADDRESS IN ADMIN
                        </div>
                      )}
                    </div>
                    <div className="w-full space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Deposit Amount (₹)</label>
                          <input 
                            type="number"
                            value={depositAmountInput}
                            onChange={(e) => setDepositAmountInput(e.target.value)}
                            className="w-full bg-black border border-zinc-800 p-3 text-white rounded outline-none focus:border-[#FFD700]"
                            placeholder="Amount"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Transaction ID / TXID</label>
                          <input 
                            type="text"
                            value={depositTxId}
                            onChange={(e) => setDepositTxId(e.target.value)}
                            className="w-full bg-black border border-zinc-800 p-3 text-white rounded outline-none focus:border-[#FFD700]"
                            placeholder="TXID or Ref ID"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Deposit Address</label>
                        <div className="bg-black p-4 rounded-xl font-mono text-xs text-zinc-300 break-all border border-zinc-800 relative group">
                          {selectedCoin.address}
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(selectedCoin.address);
                                setAdminStatus("Address Copied! ✅");
                                setTimeout(() => setAdminStatus(null), 2000);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-zinc-800 text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            COPY
                          </button>
                        </div>
                      </div>
                      
                      <button 
                        onClick={requestDeposit}
                        className="w-full py-4 bg-[#FFD700] text-black font-black uppercase italic hover:bg-white transition-all shadow-[0_10px_30px_rgba(255,215,0,0.2)]"
                      >
                        SUBMIT DEPOSIT PROOF
                      </button>
                    </div>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
                    <p className="text-[10px] text-yellow-500 uppercase font-black italic text-center">
                      ⚠ Important: Send exactly ₹{depositAmountInput} to the address above, then paste the Transaction ID and click submit. 
                      Balance will be added after manual verification by admin.
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsWithdrawModalOpen(false); setSelectedCoin(null); setWithdrawStep('coin'); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1A1A1A] border-2 border-[#FFD700] p-6 md:p-8 rounded-2xl w-full max-w-md relative z-10 shadow-[0_0_50px_rgba(255,215,0,0.2)] overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black italic uppercase text-[#FFD700]">Withdraw Profit 💸</h3>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Fast crypto payouts</p>
                </div>
                <button onClick={() => { setIsWithdrawModalOpen(false); setSelectedCoin(null); setWithdrawStep('coin'); }} className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full">✕</button>
              </div>

              {withdrawStep === 'coin' ? (
                <div className="space-y-4">
                   <p className="text-[10px] uppercase font-bold text-zinc-500">Select Withdrawal Coin</p>
                   <div className="grid grid-cols-1 gap-2">
                     {coins.filter(c => c.symbol !== 'BTC').map((coin) => (
                       <button 
                         key={coin.symbol}
                         onClick={() => { setSelectedCoin(coin); setWithdrawStep('amount'); }}
                         className="flex items-center gap-4 bg-black/40 border border-zinc-800 p-4 rounded-xl hover:border-[#FFD700] hover:bg-zinc-900 transition-all group"
                       >
                         <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm bg-zinc-800 group-hover:scale-110 transition-transform" style={{ color: coin.color }}>
                           {coin.symbol}
                         </div>
                         <div className="text-left">
                           <p className="text-white font-bold">{coin.name}</p>
                           <p className="text-zinc-500 text-[10px] font-mono uppercase italic">Select {coin.symbol}</p>
                         </div>
                         <ChevronRight className="w-4 h-4 text-zinc-700 ml-auto group-hover:text-[#FFD700]" />
                       </button>
                     ))}
                   </div>
                   <p className="text-[9px] text-zinc-700 uppercase italic text-center mt-4">Note: Bitcoin (BTC) withdrawals are temporarily disabled.</p>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="flex items-center gap-4 bg-black/60 p-4 rounded-xl border border-zinc-800">
                    <button onClick={() => { setWithdrawStep('coin'); setSelectedCoin(null); }} className="text-[#FFD700] hover:underline text-[10px] font-bold uppercase italic">← Back</button>
                    <div className="w-1 h-8 bg-zinc-800" />
                    <div className="flex items-center gap-3">
                      <span className="font-black text-sm" style={{ color: selectedCoin.color }}>{selectedCoin.symbol}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Fuel Balance</label>
                        <div className="text-lg font-mono text-zinc-500">
                          {activeCoin === 'INR' ? '₹' : ''}
                          {coinBalances[activeCoin].toLocaleString()}
                          {activeCoin !== 'INR' ? ` ${activeCoin}` : ''}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2 border-l border-zinc-800 pl-4">
                        <label className="text-[10px] font-bold uppercase text-[#FFD700]">Profit Balance</label>
                        <div className="text-lg font-mono text-white">₹{withdrawableBalance.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Withdrawal Amount (₹)</label>
                      <input 
                        type="number"
                        value={withdrawInput}
                        onChange={(e) => setWithdrawInput(e.target.value)}
                        className="w-full bg-black border-2 border-zinc-800 p-4 text-2xl font-mono text-white focus:border-[#FFD700] outline-none"
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Your {selectedCoin.symbol} Wallet Address</label>
                      <input 
                        type="text"
                        value={userWithdrawAddress}
                        onChange={(e) => setUserWithdrawAddress(e.target.value)}
                        className="w-full bg-black border border-zinc-800 p-3 text-sm font-mono text-zinc-300 rounded focus:border-[#FFD700] outline-none"
                        placeholder={`Past your ${selectedCoin.name} address...`}
                      />
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button 
                        onClick={() => { setIsWithdrawModalOpen(false); setSelectedCoin(null); setWithdrawStep('coin'); }}
                        className="flex-1 py-4 bg-zinc-800 text-white font-black uppercase text-xs hover:bg-zinc-700 transition-all rounded"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleWithdraw}
                        className="flex-1 py-4 bg-[#FFD700] text-black font-black uppercase text-xs hover:bg-white transition-all shadow-[0_10px_20px_rgba(255,215,0,0.2)] rounded"
                      >
                        Request Payout
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Notifications */}
      <div className="fixed top-24 right-4 z-[100] flex flex-col gap-2 w-72 pointer-events-none">
        <AnimatePresence>
            {userNotifications.slice().reverse().map((notif) => {
              const isSuccess = notif.type === 'deposit_approved' || (notif.type === 'account_status' && !notif.message.includes('blocked'));
              const isDanger = notif.type === 'balance_reset' || (notif.type === 'account_status' && notif.message.includes('blocked'));
              const borderColor = isSuccess ? 'border-green-500' : isDanger ? 'border-red-500' : 'border-blue-500';
              const titleColor = isSuccess ? 'text-green-500' : isDanger ? 'text-red-500' : 'text-blue-400';
              const titleText = notif.type === 'deposit_approved' 
                ? 'Deposit Success' 
                : notif.type === 'balance_reset' 
                  ? 'Fuel Correction' 
                  : notif.type === 'account_status' 
                    ? 'Security Alert' 
                    : 'Withdrawal Success';
              const footerMsg = notif.type === 'deposit_approved'
                ? 'Your fuel has been filled! ⛽'
                : notif.type === 'balance_reset'
                  ? 'Wallet correction applied by admin. 🛠_'
                  : notif.type === 'account_status'
                    ? 'Account status configuration changed. 🔒'
                    : 'Funds have been sent to your wallet. Happy riding! 🏍_';

              return (
                <motion.div
                    key={notif.id}
                    initial={{ x: 300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 300, opacity: 0 }}
                    className={`bg-[#1A1A1A] border-l-4 ${borderColor} p-4 shadow-2xl pointer-events-auto relative`}
                >
                    <button 
                        onClick={() => removeNotification(notif.id)}
                        className="absolute top-2 right-2 text-zinc-500 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex justify-between items-start mb-1">
                        <span className={`font-black text-[10px] uppercase italic tracking-widest ${titleColor}`}>
                          {titleText}
                        </span>
                        <span className="text-zinc-600 font-mono text-[8px]">{new Date(notif.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-white text-xs font-bold leading-tight">{notif.message}</p>
                    <p className="text-zinc-500 text-[9px] mt-2 italic">
                      {footerMsg}
                    </p>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>

      {isBlocked ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-950 min-h-[400px]">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-md w-full bg-[#111111] border-2 border-red-500/30 p-8 rounded-2xl shadow-[0_20px_50px_rgba(239,68,68,0.15)] space-y-6"
          >
            <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500/30 rounded-full flex items-center justify-center mx-auto text-red-500 text-3xl animate-bounce">
              🚫
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Rider Account Blocked!</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Aapka account administrator dwaara block kar diya gaya hai. Kripya naye transactions, bets, ya rules ke liye support team se contact karein.
              </p>
              <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg text-[10px] text-red-400 font-bold uppercase italic font-mono">
                Reason: Security Review / Violation of Terms
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider transition-all rounded-lg active:scale-95"
            >
              Sign Out from Account
            </button>
          </motion.div>
        </div>
      ) : (
        /* Main Gameplay Area */
        <main className="flex-1 flex flex-col md:flex-row h-full">
        
        {/* Left Side Panel: History */}
        <aside className="w-full md:w-64 border-r border-[#333] flex flex-col p-4 bg-[#141414]">
          <h2 className="text-[10px] uppercase tracking-[0.2em] mb-4 text-[#666] font-bold flex items-center gap-2">
            <History className="w-3 h-3" /> Recent Pit Stops
          </h2>
          <div 
            className="space-y-2 max-h-52 md:max-h-[360px] overflow-y-auto overscroll-contain touch-pan-y pr-2 scrollbar-thin scrollbar-thumb-zinc-800"
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <AnimatePresence initial={false}>
              {history.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className={`flex justify-between items-center p-3 bg-[#1A1A1A] border-l-4 ${
                    item.multiplier > 2 ? 'border-green-500' : 'border-red-500'
                  }`}
                >
                  <span className="text-xs text-gray-500 font-mono">{item.time}</span>
                  <span className={`text-lg font-black ${item.multiplier > 2 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.multiplier.toFixed(2)}x
                  </span>
                </motion.div>
              ))}
              {history.length === 0 && (
                <div className="text-center py-8 text-zinc-600 italic text-sm">No rides yet...</div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="mt-auto hidden md:block p-4 bg-[#FFD700]/5 border border-[#FFD700]/20 rounded transition-all hover:bg-[#FFD700]/10">
            <p className="text-[11px] italic text-[#FFD700] leading-snug">"Don't ride faster than your guardian angel can fly."</p>
          </div>
        </aside>

        {/* Central Visualization Area */}
        <section className="flex-1 relative flex flex-col items-center justify-center bg-[#070707] p-8 min-h-[400px] overflow-hidden">
          {/* Moving Grid Background */}
          <motion.div 
            className="absolute inset-0 opacity-10 pointer-events-none" 
            style={{ 
              backgroundImage: 'linear-gradient(to right, #444 1px, transparent 1px), linear-gradient(to bottom, #444 1px, transparent 1px)', 
              backgroundSize: '60px 60px' 
            }}
            animate={isPlaying && !isCrashed ? {
                backgroundPosition: ['0px 0px', '0px 60px'],
            } : {}}
            transition={isPlaying && !isCrashed ? {
                duration: 0.5,
                repeat: Infinity,
                ease: "linear"
            } : {}}
          />

          {/* Speed Streaks */}
          {isPlaying && !isCrashed && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(10)].map((_, i) => (
                      <motion.div
                          key={i}
                          initial={{ x: '120%', y: `${Math.random() * 100}%` }}
                          animate={{ x: '-20%' }}
                          transition={{
                              duration: 0.5 + Math.random() * 0.5,
                              repeat: Infinity,
                              delay: Math.random() * 2,
                              ease: "linear"
                          }}
                          className="absolute w-24 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      />
                  ))}
              </div>
          )}
          
          {/* Real-time Growth Chart (Aviator Style) */}
          <div className="absolute inset-0 z-0 p-12 pointer-events-none">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#FFD700" stopOpacity="0" />
                  <stop offset="100%" stopColor="#FFD700" stopOpacity="0.4" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              
              {multiplierPoints.length > 1 && (
                <>
                  {/* The filled area below the curve */}
                  <motion.path
                    d={`M 0 100 L ${multiplierPoints.map((p) => {
                      const xBase = (p.x / Math.max(6, multiplierPoints[multiplierPoints.length-1].x)) * 100;
                      const yBase = 100 - ((p.y - 1) / Math.max(3, multiplierPoints[multiplierPoints.length-1].y - 1)) * 100;
                      return `${xBase} ${yBase}`;
                    }).join(' L ')} L ${ (multiplierPoints[multiplierPoints.length-1].x / Math.max(6, multiplierPoints[multiplierPoints.length-1].x)) * 100 } 100 Z`}
                    fill="url(#chartGradient)"
                    stroke="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isCrashed ? 0.1 : 1 }}
                  />
                  
                  {/* The main golden line */}
                  <motion.path
                    d={`M 0 100 L ${multiplierPoints.map((p) => {
                      const xBase = (p.x / Math.max(6, multiplierPoints[multiplierPoints.length-1].x)) * 100;
                      const yBase = 100 - ((p.y - 1) / Math.max(3, multiplierPoints[multiplierPoints.length-1].y - 1)) * 100;
                      return `${xBase} ${yBase}`;
                    }).join(' L ')}`}
                    fill="none"
                    stroke={isCrashed ? "#444" : "#FFD700"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    filter="url(#glow)"
                  />
                </>
              )}
            </svg>
            
            {/* The Bike Icon following the path */}
            {multiplierPoints.length > 0 && isPlaying && !isCrashed && (
              <motion.div 
                style={{
                  position: 'absolute',
                  left: `${(multiplierPoints[multiplierPoints.length-1].x / Math.max(6, multiplierPoints[multiplierPoints.length-1].x)) * 100}%`,
                  top: `${100 - ((multiplierPoints[multiplierPoints.length-1].y - 1) / Math.max(3, multiplierPoints[multiplierPoints.length-1].y - 1)) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20
                }}
                className="transition-all duration-75 ease-linear"
              >
                <div className="relative">
                   {/* Bike Tilt Effect based on growth speed */}
                   <motion.div
                    animate={{ 
                        rotate: [-5, -15, -5],
                        y: [0, -4, 0]
                    }}
                    transition={{ 
                        duration: 0.2, 
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                   >
                    <Bike className="w-12 h-12 text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.8)]" />
                   </motion.div>

                   {/* Exhaust Flames/Smoke */}
                   <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex gap-1">
                      {[...Array(3)].map((_, i) => (
                          <motion.div 
                            key={i}
                            animate={{ 
                                x: [-10, -40], 
                                opacity: [1, 0],
                                scale: [0.5, 1.5]
                            }}
                            transition={{ 
                                duration: 0.3, 
                                repeat: Infinity, 
                                delay: i * 0.1 
                            }}
                            className="w-2 h-2 bg-orange-500 rounded-full blur-[2px]"
                          />
                      ))}
                   </div>
                </div>
              </motion.div>
            )}
          </div>

          <motion.div 
            className="text-center z-10 select-none bg-black/40 p-12 rounded-full backdrop-blur-md border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)]"
            animate={multiplier > 5 && isPlaying ? {
                scale: [1, 1.02, 1],
                rotate: [0, 0.5, -0.5, 0]
            } : {}}
            transition={{ repeat: Infinity, duration: 0.1 }}
          >
            <p className="text-xs uppercase tracking-[0.6em] text-[#FFD700]/60 mb-2 font-black flex items-center justify-center gap-2">
              <Gauge className="w-4 h-4 animate-pulse" /> CURRENT THUMP
            </p>
            <div className={`text-9xl md:text-[14rem] font-black leading-none italic tracking-tighter transition-colors duration-300 tabular-nums ${isCrashed ? 'text-red-600' : (isPlaying && hasCashedOut) ? 'text-green-500' : isPlaying ? 'text-white' : 'text-zinc-800'}`}>
              {multiplier.toFixed(2)}<span className="text-5xl align-top ml-1 text-[#FFD700]">x</span>
            </div>
            <div className={`mt-6 inline-block px-10 py-3 border-2 transition-all duration-300 ${
              isCrashed ? 'border-red-600 text-red-600 bg-red-600/10' : hasCashedOut ? 'border-green-500 text-green-500 bg-green-500/10' : isPlaying ? 'border-[#FFD700] text-[#FFD700] bg-[#FFD700]/10' : 'border-zinc-800 text-zinc-800'
            } text-2xl font-black uppercase tracking-widest skew-x-[-10deg]`}>
              {isCrashed ? 'CRASHED!' : hasCashedOut ? 'SUCCESSFUL EXIT' : isPlaying ? 'RIDING HARD' : 'READY TO ROLL'}
            </div>
            
            {autoPlayTimer !== null && (
              <div className="mt-8 relative h-2 w-64 bg-zinc-800 rounded-full overflow-hidden mx-auto">
                <motion.div 
                  initial={{ width: '100%' }}
                  animate={{ width: `${(autoPlayTimer / 5) * 100}%` }}
                  transition={{ duration: 1, ease: 'linear' }}
                  className="h-full bg-[#FFD700]"
                />
                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black uppercase text-white mix-blend-difference">
                  Next Ride in {autoPlayTimer}s
                </div>
              </div>
            )}
            
            {error && (
              <p className="text-red-500 font-bold mt-4 uppercase tracking-wider">{error}</p>
            )}
          </motion.div>

          {/* Crash Reason Toast */}
          <AnimatePresence>
            {isCrashed && (
              <motion.div
                initial={{ opacity: 0, scale: 1.5, y: -50 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute top-1/2 -translate-y-1/2 z-20 bg-[#B91C1C] px-10 py-6 text-white border-4 border-black shadow-[10px_10px_0_rgba(0,0,0,1)] flex items-center gap-6 max-w-[90vw]"
              >
                <div className="text-6xl hidden sm:block">💥</div>
                <div className="text-center sm:text-left">
                  <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center justify-center sm:justify-start gap-2">
                    <ShieldAlert className="w-6 h-6" /> CRASHED!
                  </h3>
                  <p className="text-lg italic font-serif leading-tight">"{crashReason}"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Path Visualizer (Abstract Road) */}
          <div className="absolute bottom-0 w-full h-32 overflow-hidden pointer-events-none opacity-50">
            <div className={`w-full h-1 bg-gradient-to-r from-transparent via-[#FFD700] to-transparent absolute bottom-12 transition-all duration-1000 ${isPlaying ? 'opacity-100 scale-x-110' : 'opacity-20 scale-x-100'}`}></div>
            <div className={`flex justify-center gap-24 mt-20 opacity-20 transition-transform duration-500 ${isPlaying ? 'translate-y-1' : ''}`}>
              <div className="w-1 h-12 bg-white rotate-[45deg]"></div>
              <div className="w-1 h-12 bg-white rotate-[45deg]"></div>
              <div className="w-1 h-12 bg-white rotate-[45deg]"></div>
              <div className="w-1 h-12 bg-white rotate-[45deg]"></div>
            </div>
          </div>
        </section>

        {/* Right Side Panel: Controls */}
        <aside className="w-full md:w-80 bg-[#1A1A1A] p-6 flex flex-col gap-6 border-l border-[#333]">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-[10px] uppercase font-bold text-[#888]">Riding Stake</label>
              <span className="text-xs text-[#FFD700]">Min: ₹10</span>
            </div>
            <div className="relative">
              <input 
                type="number" 
                value={betAmount} 
                onChange={(e) => {
                  if (isPlaying && hasActiveBet && !isCrashed) return;
                  setBetAmount(parseInt(e.target.value) || 10);
                }}
                className="w-full bg-black border-2 border-[#333] p-4 text-2xl font-mono text-white focus:border-[#FFD700] outline-none" 
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                <button 
                  onClick={() => handleAdjustBet('half')}
                  className="px-2 py-1 bg-[#333] text-[10px] font-bold hover:bg-[#444] transition-colors border border-zinc-700"
                >
                  1/2
                </button>
                <button 
                  onClick={() => handleAdjustBet('double')}
                  className="px-2 py-1 bg-[#333] text-[10px] font-bold hover:bg-[#444] transition-colors border border-zinc-700"
                >
                  2X
                </button>
              </div>
            </div>
            
            <div className="flex justify-between items-end mt-4">
              <label className="text-[10px] uppercase font-bold text-[#888]">Target Multiplier</label>
              <span className="text-xs text-[#FFD700]">Auto-Exit</span>
            </div>
            <input type="text" readOnly value="2.00x" className="w-full bg-black border-2 border-[#333] p-4 text-2xl font-mono text-white opacity-50 cursor-not-allowed" />
            <div className="flex justify-between items-center bg-black border-2 border-[#333] p-3 rounded">
              <span className="text-[10px] uppercase font-bold text-[#888]">Auto Ride Mode</span>
              <button 
                onClick={() => setIsAutoPlay(!isAutoPlay)}
                className={`w-12 h-6 flex items-center rounded-full px-1 transition-colors ${isAutoPlay ? 'bg-green-600' : 'bg-zinc-800'}`}
              >
                <motion.div 
                  layout
                  className="w-4 h-4 bg-white rounded-full shadow"
                  animate={{ x: isAutoPlay ? 24 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>

          <button 
            onClick={() => {
              if (!user) {
                setShowAuthModal(true);
                return;
              }
              if (isPlaying) {
                if (hasActiveBet) {
                  if (!hasCashedOut) {
                    cashOut();
                  }
                } else {
                  // Spectating, toggle next-round queue
                  if (isBetQueued) {
                    setIsBetQueued(false);
                  } else {
                    if (coinBalances[activeCoin] < betAmount) {
                      setError("Bas kar bhai! Balance low hai.");
                      setTimeout(() => setError(null), 3000);
                      return;
                    }
                    setIsBetQueued(true);
                  }
                }
              } else {
                // Countdown / Crashed state, toggle queue
                if (isBetQueued) {
                  setIsBetQueued(false);
                } else {
                  if (coinBalances[activeCoin] < betAmount) {
                    setError("Bas kar bhai! Balance low hai.");
                    setTimeout(() => setError(null), 3000);
                    return;
                  }
                  setIsBetQueued(true);
                }
              }
            }}
            disabled={(isPlaying && hasActiveBet && hasCashedOut) || loading}
            className={`mt-auto w-full py-8 transition-all shadow-xl active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden relative ${
              isPlaying && hasActiveBet && !hasCashedOut 
                ? 'bg-red-600 hover:bg-red-500' 
                : isBetQueued 
                  ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse' 
                  : 'bg-[#FFD700] hover:bg-white text-black'
            }`}
          >
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out" />
            <span className={`relative text-3xl font-black uppercase tracking-tighter ${
              isPlaying && hasActiveBet && !hasCashedOut ? 'text-white' : (isBetQueued ? 'text-white' : 'text-black')
            }`}>
              {isPlaying && hasActiveBet && !hasCashedOut 
                ? `CASH OUT` 
                : (isPlaying && hasActiveBet && hasCashedOut) 
                  ? 'CASHED OUT' 
                  : isBetQueued 
                    ? `CANCEL BET` 
                    : isPlaying 
                      ? `BET FOR NEXT RIDE` 
                      : `BET ${betAmount} ${activeCoin}`}
            </span>
          </button>
          
          <p className="text-center text-[9px] text-zinc-600 uppercase tracking-widest font-medium">
            18+ | Ride Responsibly | No Helmet No Entry
          </p>
        </aside>
      </main>
      )}

      {/* Footer Ticker */}
      <footer className="bg-black h-12 flex items-center border-t border-[#222]">
        <div className="flex-shrink-0 bg-[#FFD700] px-4 h-full flex items-center text-black font-bold italic text-sm border-r border-[#FFD700]">
          LIVE REWIND
        </div>
        <div className="flex flex-1 items-center gap-12 px-6 overflow-hidden whitespace-nowrap">
          <span className="text-sm font-medium flex items-center gap-2"><span className="text-green-500 animate-pulse text-[10px]">●</span> Player_Desi: <span className="text-[#FFD700]">3.4x</span></span>
          <span className="text-sm font-medium flex items-center gap-2"><span className="text-green-500 animate-pulse text-[10px]">●</span> BulletRider: <span className="text-[#FFD700]">1.2x</span></span>
          <span className="text-sm font-medium flex items-center gap-2"><span className="text-green-500 animate-pulse text-[10px]">●</span> KingThreeway: <span className="text-[#FFD700]">8.9x</span></span>
          <span className="text-sm font-medium flex items-center gap-2"><span className="text-green-500 animate-pulse text-[10px]">●</span> SpeedMaster: <span className="text-[#FFD700]">2.1x</span></span>
          <span className="text-sm font-medium flex items-center gap-2"><span className="text-green-500 animate-pulse text-[10px]">●</span> PunjabRider: <span className="text-[#FFD700]">5.0x</span></span>
        </div>
      </footer>
    </div>
  );
}

