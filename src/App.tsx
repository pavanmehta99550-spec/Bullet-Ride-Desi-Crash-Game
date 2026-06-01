import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, RefreshCw, Bike, Gauge, User, History, 
  ChevronRight, LogIn, LogOut, Mail, Lock, Chrome, Loader2, X,
  Volume2, VolumeX, Gift, Trophy, Edit3, Check, MessageSquare, Send, Languages, Globe
} from 'lucide-react';
import { 
  auth, googleProvider, syncUserProfile, 
  updateUserBalance, saveGameHistory, saveGlobalHistory,
  firebaseConfig
} from './lib/firebase';
import { 
  onAuthStateChanged, signInWithPopup, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import AuthModal from './components/AuthModal';
import { SearchableCoinDropdown } from './components/SearchableCoinDropdown';
import { cryptoConfig } from './lib/cryptoConfig';
import { formatBetAmount, calculateFiatValue } from './lib/conversion';
import { audioManager } from './lib/audio';
import { translations, getTranslatedCrashReason } from './lib/translations';
import { initial100Riders, allCountriesWithFlags, allFirstNames, allLastNameSuffixes, CountryRider } from './countries';

interface GameHistory {
  id: string | number;
  multiplier: number;
  time: string;
}

import { customFetch as fetch, safeFetchJson, getBackendUrl, getActiveBackendUrl } from './lib/api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const [multiplier, setMultiplier] = useState(1.00);
  const [coins, setCoins] = useState<{name: string, symbol: string, color: string, address: string, isVisible: boolean}[]>([
    { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A', address: 'bc1qxy2kgdy6jr1789btc', isVisible: true },
    { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', address: '0x71C765d897eth', isVisible: true },
    { name: 'Tether', symbol: 'USDT', color: '#26A17B', address: '0x26A17Be456usdt', isVisible: true },
    { name: 'Solana', symbol: 'SOL', color: '#14F195', address: '6x5df678sol', isVisible: true },
    { name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633', address: 'D8vBm90ldoge', isVisible: true },
    { name: 'Litecoin', symbol: 'LTC', color: '#345D9D', address: 'M8vAx87ultc', isVisible: true },
    { name: 'Tron', symbol: 'TRX', color: '#FF0013', address: 'TYf82atrx', isVisible: true },
    { name: 'Binance Coin', symbol: 'BNB', color: '#F3BA2F', address: '0xBNBf3babnb', isVisible: true },
    { name: 'Ripple', symbol: 'XRP', color: '#23292F', address: 'rXRP2329xrp', isVisible: true },
    { name: 'Polygon', symbol: 'MATIC', color: '#8247E5', address: '0xMATIC8247matic', isVisible: true },
    { name: 'Toncoin', symbol: 'TON', color: '#0098EA', address: 'UQTON0098ton', isVisible: true },
    { name: 'Cardano', symbol: 'ADA', color: '#0033AD', address: 'addr1ADA0033ada', isVisible: true },
    { name: 'Bitcoin Cash', symbol: 'BCH', color: '#8DC351', address: 'bch1qBCH8dc3bch', isVisible: true },
    { name: 'Dash', symbol: 'DASH', color: '#008DE4', address: 'X_DASH008ddash', isVisible: true },
    { name: 'DigiByte', symbol: 'DGB', color: '#0066CC', address: 'dgb1qDGB0066dgb', isVisible: true },
    { name: 'Feyorra', symbol: 'FEY', color: '#A020F0', address: '0xFEYa020fey', isVisible: true },
    { name: 'Chainlink', symbol: 'LINK', color: '#2A5ADA', address: '0xLINK2a5alink', isVisible: true },
    { name: 'Polkadot', symbol: 'DOT', color: '#E6007A', address: '1DOTe600dot', isVisible: true },
    { name: 'Monero', symbol: 'XMR', color: '#FF6600', address: 'xmraddr1', isVisible: true },
    { name: 'Taraxa', symbol: 'TARA', color: '#444444', address: 'taraaddr1', isVisible: true },
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCrashed, setIsCrashed] = useState(false);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [cashedOutMultiplier, setCashedOutMultiplier] = useState<number | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [crashReason, setCrashReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<GameHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [myGameHistory, setMyGameHistory] = useState<any[]>([]);
  const [isMyHistoryLoading, setIsMyHistoryLoading] = useState(true);
  const [historyTab, setHistoryTab] = useState<'global' | 'personal'>('global');
  const [betAmount, setBetAmount] = useState(500);
  
  // Referral, Promo Codes and Deposit Unlock states
  const [bonusBalance, setBonusBalance] = useState(0);
  const [hasDeposited, setHasDeposited] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Promo input
  const [promoInput, setPromoInput] = useState('');
  const [isRedeemingPromo, setIsRedeemingPromo] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [cryptoLimits, setCryptoLimits] = useState<Record<string, { min: number, max: number }>>({});

  // Admin promocodes management state
  const [adminPromocodes, setAdminPromocodes] = useState<any[]>([]);
  const [adminPromocodesHistory, setAdminPromocodesHistory] = useState<any[]>([]);
  const [adminPromoRedemptions, setAdminPromoRedemptions] = useState<any[]>([]);
  const [isPromocodesLoading, setIsPromocodesLoading] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoReward, setNewPromoReward] = useState('500');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('1000');

  const [balance, setBalance] = useState(0);
  const [activeCoin, setActiveCoin] = useState<string>('USDT');
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({ INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0, LTC: 0, TRX: 0, BNB: 0, XRP: 0, MATIC: 0, TON: 0, ADA: 0, BCH: 0, DASH: 0, DGB: 0, FEY: 0, LINK: 0, DOT: 0 });
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlay, setIsAutoPlay] = useState(() => {
    try {
      return localStorage.getItem('aviator_is_auto_play') === 'true';
    } catch (_) { return false; }
  });
  const [isAutoExit, setIsAutoExit] = useState(() => {
    try {
      return localStorage.getItem('aviator_is_auto_exit') === 'true';
    } catch (_) { return false; }
  });
  const [autoExitValue, setAutoExitValue] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aviator_auto_exit_value');
      return saved ? parseFloat(saved) : 2.00;
    } catch (_) { return 2.00; }
  });

  const [globalStatus, setGlobalStatus] = useState<'WAITING' | 'IN_PROGRESS' | 'CRASHED'>('WAITING');
  const [globalCountdown, setGlobalCountdown] = useState<number>(0);
  const [isBetQueued, setIsBetQueued] = useState(false);
  const [hasActiveBet, setHasActiveBet] = useState(false);
  const [winPopup, setWinPopup] = useState<{ amount: number; multiplier: number; coin: string } | null>(null);
  const [isMuted, setIsMuted] = useState(audioManager.getMutedState());
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any[]>([]);
  const [loadingReferralHistory, setLoadingReferralHistory] = useState(false);
  const [topRiders, setTopRiders] = useState<any[]>([]);
  const [loadingTopRiders, setLoadingTopRiders] = useState(false);
  const [marqueeRiders, setMarqueeRiders] = useState<CountryRider[]>(initial100Riders);
  const [language, setLanguage] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('aviator_language');
      return (saved && translations[saved]) ? saved : 'en';
    } catch (_) { return 'en'; }
  });

  const t = useMemo(() => {
    return translations[language] || translations.en;
  }, [language]);

  const toggleSound = () => {
    const nextState = audioManager.toggleMute();
    setIsMuted(nextState);
  };

  const [multiplierPoints, setMultiplierPoints] = useState<{ x: number, y: number }[]>([]);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const globalRoundIdRef = useRef<string | null>(null);
  const activeCoinRef = useRef<string>('USDT');

  // Sync refs to avoid stale closures in core intervals
  const isAutoPlayRef = useRef(isAutoPlay);
  const isAutoExitRef = useRef(isAutoExit);
  const autoExitValueRef = useRef(autoExitValue);
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

  useEffect(() => {
    try {
      localStorage.setItem('aviator_is_auto_play', isAutoPlay ? 'true' : 'false');
    } catch (_) {}
    isAutoPlayRef.current = isAutoPlay;
  }, [isAutoPlay]);

  useEffect(() => {
    try {
      localStorage.setItem('aviator_is_auto_exit', isAutoExit ? 'true' : 'false');
    } catch (_) {}
    isAutoExitRef.current = isAutoExit;
  }, [isAutoExit]);

  useEffect(() => {
    try {
      localStorage.setItem('aviator_auto_exit_value', autoExitValue.toString());
    } catch (_) {}
    autoExitValueRef.current = autoExitValue;
  }, [autoExitValue]);

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
  useEffect(() => { activeCoinRef.current = activeCoin; }, [activeCoin]);

  useEffect(() => {
    if (winPopup) {
      const timer = setTimeout(() => {
        setWinPopup(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [winPopup]);

  useEffect(() => {
    const config = cryptoConfig[activeCoin];
    if (config) {
      setBetAmount(config.min * 10);
    }
  }, [activeCoin]);

  useEffect(() => {
    if (isProfileModalOpen && user?.uid) {
      const fetchReferralHistory = async () => {
        setLoadingReferralHistory(true);
        try {
          const q = query(
            collection(db, "referral_logs"),
            where("referrerUid", "==", user.uid)
          );
          const querySnapshot = await getDocs(q);
          const logs: any[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            logs.push({
              id: doc.id,
              ...data,
              dateStr: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toLocaleString() : new Date(data.timestamp).toLocaleString()) : 'Just now'
            });
          });
          // Sort by timestamp desc (newest first)
          logs.sort((a, b) => {
            const timeA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0);
            const timeB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0);
            return timeB - timeA;
          });
          setReferralHistory(logs);
        } catch (err) {
          console.error("Error fetching referral logs:", err);
          setReferralHistory([]);
        } finally {
          setLoadingReferralHistory(false);
        }
      };

      fetchReferralHistory();
    }
  }, [isProfileModalOpen, user?.uid]);
  // Listen to Top Riders in Real-Time (Highest Multipliers in last 24h)
  useEffect(() => {
    let isCurrent = true;
    setLoadingTopRiders(true);
    
    const q = query(
      collection(db, 'topRiders'),
      orderBy('multiplier', 'desc'),
      limit(50)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      if (!isCurrent) return;
      
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        let timeStr = 'Just now';
        let dateObj: Date;
        
        if (data.createdAt) {
          dateObj = new Date(data.createdAt);
        } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          dateObj = data.timestamp.toDate();
        } else {
          dateObj = new Date();
        }
        
        try {
          timeStr = dateObj.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
        } catch (_) {}

        return {
          id: doc.id,
          ...data,
          time: timeStr
        };
      });

      // Filter in-memory for the last 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const last24h = list.filter((item: any) => {
        const itemTime = item.createdAt || (item.timestamp?.seconds ? item.timestamp.seconds * 1000 : Date.now());
        return itemTime >= oneDayAgo;
      });

      // If we have records in the last 24 hours, use them, otherwise fall back to top 50 overall
      const finalRiders = last24h.length > 0 ? last24h : list;

      setTopRiders(finalRiders);
      setLoadingTopRiders(false);
    }, (err) => {
      console.warn("[FIREBASE] topRiders sync error:", err.message);
      setLoadingTopRiders(false);
    });

    return () => {
      isCurrent = false;
      unsub();
    };
  }, []);

  const handleCoinChange = async (symbol: string) => {
    setActiveCoin(symbol);
    const bal = coinBalances[symbol] || 0;
    setBalance(bal);
    try {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { activeCoin: symbol, walletBalance: bal }, { merge: true });
      }
    } catch (err) {
      console.warn("Failed saving activeCoin preference:", err);
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

  const fetchCryptoLimits = async () => {
    try {
      const data = await safeFetchJson('/api/config/crypto-limits');
      if (data) {
        setCryptoLimits(data);
      }
    } catch (err) {
      console.warn("Fetch crypto limits failed:", err);
    }
  };

  const fetchRates = async () => {
    try {
      const data = await safeFetchJson('/api/config/rates');
      if (data) {
        setRates(data);
      }
    } catch (err) {
      console.warn("Fetch rates failed:", err);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    let intervalId: any = null;

    // Detect and capture referral code from URL query parameter
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref');
      if (refCode && refCode.trim() !== '') {
        localStorage.setItem('referral_referrer_uid', refCode.trim());
        console.log(`[REFERRAL CAPTURED] Referrer UID captured: ${refCode}`);
      }
    } catch (e) {
      console.warn("Could not capture referral parameter:", e);
    }

    const syncFirebaseConfig = async () => {
      try {
        const backendConfig = await safeFetchJson('/api/config/firebase');
        if (backendConfig && backendConfig.apiKey) {
          const keysToCompare = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'firestoreDatabaseId'];
          let isDifferent = false;
          
          let savedConfig: any = {};
          try {
            const savedStr = localStorage.getItem('custom_firebase_config_v2');
            if (savedStr) savedConfig = JSON.parse(savedStr);
          } catch (_) {}
          
          for (const k of keysToCompare) {
            const currentVal = savedConfig[k] || (firebaseConfig as any)[k];
            const newVal = backendConfig[k];
            if (newVal && currentVal !== newVal) {
              isDifferent = true;
              break;
            }
          }
          
          if (isDifferent) {
            console.log("[FIREBASE AUTO-SYNC] Discrepancy found! Updating localStorage configuration and reloading...");
            localStorage.setItem('custom_firebase_config_v2', JSON.stringify(backendConfig));
            setTimeout(() => {
              window.location.reload();
            }, 150);
          }
        }
      } catch (err) {
        console.warn("[FIREBASE AUTO-SYNC] Could not fetch backend Firebase configuration:", err);
      }
    };

    syncFirebaseConfig();
    fetchCoins();
    fetchCryptoLimits();
    fetchRates();

    // Subscribe to Firestore settings for real-time crypto config/addresses & admin passcode sync
    const unsubCoins = onSnapshot(doc(db, 'admin', 'settings'), (snapshot) => {
      if (isCurrent && snapshot.exists()) {
        const snapData = snapshot.data();
        if (snapData) {
          if (Array.isArray(snapData.cryptoCoins)) {
            setCoins(snapData.cryptoCoins);
          }
          if (snapData.adminPasscode) {
            setAdminPasscode(snapData.adminPasscode);
            localStorage.setItem('rider_admin_pin', snapData.adminPasscode);
          }
        }
      }
    }, (err) => {
      console.warn("Firestore settings coin sync failed, falling back to REST API:", err.message);
    });

    const handleGameUpdate = (data: any) => {
      if (!isCurrent || !data) return;

      // On Round Change
      if (data.roundId !== globalRoundIdRef.current) {
        globalRoundIdRef.current = data.roundId;
        setHasCashedOut(false);
        setCashedOutMultiplier(null);
        setWinPopup(null);
        setMultiplierPoints([{ x: 0, y: 1.00 }]);
        
        // Place Queued Bet (only if not already placed manually during countdown)
        if (!hasActiveBetRef.current) {
          if (isBetQueuedRef.current && userRef.current) {
             const b = betAmountRef.current;
             if (balanceRef.current >= b) {
                setHasActiveBet(true);
                updateUserBalance(userRef.current.uid, balanceRef.current - b, activeCoinRef.current);
                setWithdrawableBalance(prev => Math.max(0, prev - b));
                setIsBetQueued(false);
                registerActiveBetValue(userRef.current.uid, data.roundId, b, activeCoinRef.current);
             }
          } else if (isAutoPlayRef.current && userRef.current) {
             const b = betAmountRef.current;
             if (balanceRef.current >= b) {
                setHasActiveBet(true);
                updateUserBalance(userRef.current.uid, balanceRef.current - b, activeCoinRef.current);
                setWithdrawableBalance(prev => Math.max(0, prev - b));
                registerActiveBetValue(userRef.current.uid, data.roundId, b, activeCoinRef.current);
             }
          }
        }
      }

      // Pre-crash Auto Cash Out Safety Check (latency-proof)
      if (data.status === 'CRASHED' && hasActiveBetRef.current && !hasCashedOutRef.current && userRef.current) {
         if (isAutoExitRef.current) {
            const targetVal = parseFloat(String(autoExitValueRef.current)) || 2.00;
            if (targetVal > 1.00 && targetVal <= data.crashPoint) {
               console.log(`[LATENCY PROOF AUTO-EXIT] Auto caching out player at ${targetVal}x, since crash was at ${data.crashPoint}x`);
               cashOut(targetVal);
            }
         }
      }

      setGlobalStatus(data.status);
      setCrashPoint(data.crashPoint);
      setCrashReason(data.crashReason || "");
      crashPointRef.current = data.crashPoint;

      if (data.status === 'IN_PROGRESS') {
         setIsPlaying(true);
         setIsCrashed(false);
         // Canonical sync: use the server's intentional start time
         startTimeRef.current = data.startTime;

         // Dynamic Engine Sound Start
         audioManager.playRide(1.00);
      } else if (data.status === 'CRASHED') {
         setIsCrashed(true);
         setIsPlaying(false);
         setMultiplier(data.crashPoint);
         
         // Play procedural crash audio
         audioManager.playCrash();
         
         const crashX = data.startTime ? Math.max(0, (Date.now() - data.startTime) / 1000) : 0;
         setMultiplierPoints(prev => {
           const lastPoint = prev[prev.length - 1];
           if (!lastPoint || data.crashPoint > lastPoint.y) {
             return [...prev, { x: crashX, y: data.crashPoint }].slice(-100);
           }
           return prev;
         });

         // Prepend to live history local state for immediate reactive update
         if (data.roundId) {
           const formattedTime = new Date().toLocaleTimeString([], {
             hour: '2-digit', 
             minute: '2-digit', 
             second: '2-digit',
             hour12: true
           });
           const newHistoryItem = {
             id: data.roundId,
             multiplier: data.crashPoint,
             time: formattedTime
           };
           setHistory(prev => {
             if (prev.some(item => item.id === data.roundId)) return prev;
             return [newHistoryItem, ...prev].slice(0, 20);
           });
         }

         // Settle Loss
         if (hasActiveBetRef.current && !hasCashedOutRef.current && userRef.current) {
            saveGameHistory(userRef.current.uid, {
               betAmount: betAmountRef.current,
               multiplier: data.crashPoint,
               winAmount: 0,
               status: 'loss'
            });
            setHasActiveBet(false);
         }
         setHasActiveBet(false); // Reset for next round regardless
      } else {
         setIsPlaying(false);
         setIsCrashed(false);
         setMultiplier(1.00);
         setMultiplierPoints([{ x: 0, y: 1.00 }]);
         
         // Idle the sound engine
         audioManager.stopRide();

         // Local countdown estimation
         const sTime = data.startTime;
         const cd = Math.max(0, Math.ceil((sTime - Date.now()) / 1000));
         setGlobalCountdown(cd);
      }
    };

    // --- GLOBAL GAME SYNC ---
    const unsubGame = onSnapshot(doc(db, 'game', 'current'), (snapshot) => {
      if (isCurrent && snapshot.exists()) {
        handleGameUpdate(snapshot.data());
      }
    }, (err) => {
      console.error("Firestore onSnapshot error:", err);
      if (!isCurrent) return;
      // Fallback: Start SMARTER local game loop if Firestore sync is blocked, offline, or errored
      {
        console.warn("Starting SMOOTH local game loop fallback due to sync issues:", err);
        
        let currentStatus: 'WAITING' | 'IN_PROGRESS' | 'CRASHED' = 'WAITING';
        let roundId = "fallback_" + Math.random().toString(36).substring(2, 9);
        let startTime = Date.now() + 5000;
        let crashPoint = 1.5;
        let crashTime = 0;
        let crashedUntil = 0;

        intervalId = setInterval(() => {
          if (!isCurrent) {
            clearInterval(intervalId);
            return;
          }
          const now = Date.now();
          if (currentStatus === 'WAITING') {
            if (now < startTime) {
              handleGameUpdate({
                status: 'WAITING',
                startTime: startTime,
                roundId: roundId,
                crashPoint: 1.00
              });
            } else {
              // Transition to IN_PROGRESS
              currentStatus = 'IN_PROGRESS';
              roundId = "fallback_" + Math.random().toString(36).substring(2, 9);
              startTime = Date.now();
              const rand = Math.random();
              crashPoint = rand < 0.1 ? 1.00 : parseFloat((1.01 + Math.exp(Math.random() * 2.2)).toFixed(2));
              const durationMs = (Math.log(crashPoint) / 0.06) * 1000;
              crashTime = startTime + durationMs;
              
              handleGameUpdate({
                status: 'IN_PROGRESS',
                startTime: startTime,
                crashPoint: crashPoint,
                roundId: roundId
              });
            }
          } else if (currentStatus === 'IN_PROGRESS') {
            if (now >= crashTime) {
              // Transition to CRASHED
              currentStatus = 'CRASHED';
              crashedUntil = now + 4000;
              handleGameUpdate({
                status: 'CRASHED',
                crashPoint: crashPoint,
                roundId: roundId
              });
            }
          } else if (currentStatus === 'CRASHED') {
            if (now >= crashedUntil) {
              // Transition to WAITING
              currentStatus = 'WAITING';
              roundId = "fallback_" + Math.random().toString(36).substring(2, 9);
              startTime = Date.now() + 5000;
              handleGameUpdate({
                status: 'WAITING',
                startTime: startTime,
                roundId: roundId,
                crashPoint: 1.00
              });
            }
          }
        }, 100);
      }
      setError("Sync failed: Check permissions or configuration. ❌");
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isCurrent) return;
      if (firebaseUser) {
        const profile = await syncUserProfile(firebaseUser);
        if (!isCurrent) return;
        setUser({ ...firebaseUser, ...profile });
        if (profile) {
          const profileData = profile as any;
          const rawActiveCoin = profileData.activeCoin || 'USDT';
          const curActiveCoin = rawActiveCoin === 'INR' ? 'USDT' : rawActiveCoin;
          const dBalances = profileData.coinBalances || {};
          const mergedBalances = {
            INR: dBalances.INR !== undefined ? dBalances.INR : (profileData.walletBalance || 0),
            BTC: dBalances.BTC || 0,
            ETH: dBalances.ETH || 0,
            USDT: dBalances.USDT || 0,
            SOL: dBalances.SOL || 0,
            DOGE: dBalances.DOGE || 0,
            LTC: dBalances.LTC || 0,
            TRX: dBalances.TRX || 0,
            BNB: dBalances.BNB || 0,
            XRP: dBalances.XRP || 0,
            MATIC: dBalances.MATIC || 0,
            TON: dBalances.TON || 0,
            ADA: dBalances.ADA || 0,
            BCH: dBalances.BCH || 0,
            DASH: dBalances.DASH || 0,
            DGB: dBalances.DGB || 0,
            FEY: dBalances.FEY || 0,
            LINK: dBalances.LINK || 0,
            DOT: dBalances.DOT || 0
          };
          setActiveCoin(curActiveCoin);
          setCoinBalances(mergedBalances);
          setBalance(mergedBalances[curActiveCoin] || 0);
          setWithdrawableBalance(mergedBalances[curActiveCoin] || 0);
          setIsBlocked(!!profileData.isBlocked);
          
          setBonusBalance(profileData.bonus_balance || 0);
          setHasDeposited(!!profileData.has_deposited);
          setReferralCode(profileData.referralCode || firebaseUser.uid);
          setReferredBy(profileData.referredBy || '');
        }
      } else {
        setUser(null);
        setBalance(0);
        setHistory([]); // Clear history on signout
        setMyGameHistory([]); // Clear personal history on signout
        setActiveCoin('USDT');
        setCoinBalances({ INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0, LTC: 0, TRX: 0, BNB: 0, XRP: 0, MATIC: 0, TON: 0, ADA: 0, BCH: 0, DASH: 0, DGB: 0, FEY: 0, LINK: 0, DOT: 0 });
        setWithdrawableBalance(0);
        setIsBlocked(false);

        setBonusBalance(0);
        setHasDeposited(false);
        setReferralCode('');
        setReferredBy('');
      }
      setAuthLoading(false);
    });

    return () => {
      isCurrent = false;
      unsubscribeAuth();
      unsubGame();
      unsubCoins();
      if (intervalId) {
        clearInterval(intervalId);
      }
      audioManager.stopRide();
    };
  }, []);

  // Real-time Balance and Block Status Sync from Firestore
  useEffect(() => {
    let isCurrent = true;
    if (!user) {
      setIsBlocked(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (!isCurrent) return;
      if (doc.exists()) {
        const data = doc.data();
        const rawActiveCoin = data.activeCoin || 'USDT';
        const curActiveCoin = rawActiveCoin === 'INR' ? 'USDT' : rawActiveCoin;
        const dBalances = data.coinBalances || {};
        const mergedBalances = {
          INR: dBalances.INR !== undefined ? dBalances.INR : (data.walletBalance || 0),
          BTC: dBalances.BTC || 0,
          ETH: dBalances.ETH || 0,
          USDT: dBalances.USDT || 0,
          SOL: dBalances.SOL || 0,
          DOGE: dBalances.DOGE || 0,
          LTC: dBalances.LTC || 0,
          TRX: dBalances.TRX || 0,
          BNB: dBalances.BNB || 0,
          XRP: dBalances.XRP || 0,
          MATIC: dBalances.MATIC || 0,
          TON: dBalances.TON || 0,
          ADA: dBalances.ADA || 0,
          BCH: dBalances.BCH || 0,
          DASH: dBalances.DASH || 0,
          DGB: dBalances.DGB || 0,
          FEY: dBalances.FEY || 0,
          LINK: dBalances.LINK || 0,
          DOT: dBalances.DOT || 0
        };
        setActiveCoin(curActiveCoin);
        setCoinBalances(mergedBalances);
        setBalance(mergedBalances[curActiveCoin] || 0);
        setIsBlocked(!!data.isBlocked);

        setBonusBalance(data.bonus_balance || 0);
        setHasDeposited(!!data.has_deposited);
        setReferralCode(data.referralCode || user.uid);
        setReferredBy(data.referredBy || '');
      }
    });
    return () => {
      isCurrent = false;
      unsub();
    };
  }, [user?.uid]);

  // Real-time USER Game History Sync (Kitna bet lagaya, kitna hara, kitna jita)
  useEffect(() => {
    let isCurrent = true;
    if (!user) {
      setMyGameHistory([]);
      setIsMyHistoryLoading(false);
      return;
    }

    // Attempt to load from local storage cache first for instant load
    const historyKey = `game_history_list_${user.uid}`;
    try {
      const cached = localStorage.getItem(historyKey);
      if (cached) {
        setMyGameHistory(JSON.parse(cached));
      }
    } catch (_) {}

    setIsMyHistoryLoading(true);

    const q = query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!isCurrent) return;
      
      const dataList = snapshot.docs.map(doc => {
        const data = doc.data();
        let timeStr = 'Just now';
        
        let dateObj: Date;
        if (data.createdAt) {
          dateObj = new Date(data.createdAt);
        } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          dateObj = data.timestamp.toDate();
        } else {
          dateObj = new Date();
        }

        try {
          timeStr = dateObj.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
          });
        } catch (e) {
          timeStr = new Date().toLocaleTimeString();
        }

        return {
          id: doc.id,
          ...data,
          time: timeStr
        };
      });

      setMyGameHistory(dataList);
      setIsMyHistoryLoading(false);

      // Keep local storage warm
      try {
        localStorage.setItem(historyKey, JSON.stringify(dataList));
      } catch (_) {}

    }, (err) => {
      console.warn("[FIREBASE] myGameHistory sync error, using cache:", err.message);
      setIsMyHistoryLoading(false);
    });

    return () => {
      isCurrent = false;
      unsub();
    };
  }, [user?.uid]);

  // Real-time GLOBAL History Sync
  useEffect(() => {
    let isCurrent = true;
    const q = query(
      collection(db, 'globalHistory'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    setIsHistoryLoading(true);
    const unsub = onSnapshot(q, (snapshot) => {
      if (!isCurrent) return;
      const historyData = snapshot.docs.map(doc => {
        const data = doc.data();
        let timeStr = 'Just now';
        
        let dateObj: Date;
        if (data.createdAt) {
          dateObj = new Date(data.createdAt);
        } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          dateObj = data.timestamp.toDate();
        } else {
          dateObj = new Date();
        }

        try {
          timeStr = dateObj.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
          });
        } catch (e) {
          timeStr = new Date().toLocaleTimeString();
        }

        return {
          id: doc.id,
          multiplier: data.multiplier || 0,
          time: timeStr
        };
      });
      setHistory(historyData as any);
      setIsHistoryLoading(false);
    }, (err) => {
      console.warn("Firestore globalHistory onSnapshot error, using safe local cache:", err.message);
      setIsHistoryLoading(false);
    });
    return () => {
      isCurrent = false;
      unsub();
    };
  }, []);

  const handleGuestLogin = async (guestUser: any) => {
    setAuthLoading(true);
    try {
      const profile = await syncUserProfile(guestUser);
      setUser({ ...guestUser, ...profile });
      if (profile) {
        const profileData = profile as any;
        const rawActiveCoin = profileData.activeCoin || 'USDT';
        const curActiveCoin = rawActiveCoin === 'INR' ? 'USDT' : rawActiveCoin;
        const dBalances = profileData.coinBalances || {};
        const mergedBalances = {
          INR: dBalances.INR !== undefined ? dBalances.INR : (profileData.walletBalance || 0),
          BTC: dBalances.BTC || 0,
          ETH: dBalances.ETH || 0,
          USDT: dBalances.USDT || 0,
          SOL: dBalances.SOL || 0,
          DOGE: dBalances.DOGE || 0,
          LTC: dBalances.LTC || 0,
          TRX: dBalances.TRX || 0,
          BNB: dBalances.BNB || 0,
          XRP: dBalances.XRP || 0,
          MATIC: dBalances.MATIC || 0,
          TON: dBalances.TON || 0,
          ADA: dBalances.ADA || 0,
          BCH: dBalances.BCH || 0,
          DASH: dBalances.DASH || 0,
          DGB: dBalances.DGB || 0,
          FEY: dBalances.FEY || 0,
          LINK: dBalances.LINK || 0,
          DOT: dBalances.DOT || 0
        };
        setActiveCoin(curActiveCoin);
        setCoinBalances(mergedBalances);
        setBalance(mergedBalances[curActiveCoin] || 0);
        setWithdrawableBalance(mergedBalances[curActiveCoin] || 0);
        setIsBlocked(!!profileData.isBlocked);

        setBonusBalance(profileData.bonus_balance || 0);
        setHasDeposited(!!profileData.has_deposited);
        setReferralCode(profileData.referralCode || guestUser.uid);
        setReferredBy(profileData.referredBy || '');
      }
    } catch (e) {
      console.warn("Guest profile sync failed, falling back to clean local representation", e);
      // Clean default starting balances for developers/testers to have fun instantly!
      const dBalances = { INR: 50000, BTC: 0.1, ETH: 1.5, USDT: 250, SOL: 12, DOGE: 500, LTC: 5, TRX: 100, BNB: 0.5, XRP: 500, MATIC: 300, TON: 50, ADA: 400, BCH: 1, DASH: 2, DGB: 1000, FEY: 200, LINK: 20, DOT: 30 };
      setUser(guestUser);
      setActiveCoin('USDT');
      setCoinBalances(dBalances);
      setBalance(250);
      setWithdrawableBalance(250);
      setIsBlocked(false);
      setBonusBalance(0);
      setHasDeposited(false);
      setReferralCode(guestUser.uid);
      setReferredBy('');
    } finally {
      setAuthLoading(false);
    }
  };

  const registerActiveBetValue = async (uid: string, roundId: string, amount: number, coin: string) => {
    if (!db || !roundId) return;
    try {
      let usdValue = amount;
      let inrValue = amount;
      if (coin === 'INR') {
        usdValue = amount * 0.012;
        inrValue = amount;
      } else {
        const rate = rates[coin] || 1;
        usdValue = amount * rate;
        inrValue = usdValue / 0.012;
      }
      await setDoc(doc(db, 'gameBets', roundId, 'bets', uid), {
        userId: uid,
        amount,
        coin,
        usdValue: parseFloat(usdValue.toFixed(4)),
        inrValue: parseFloat(inrValue.toFixed(2)),
        timestamp: Date.now()
      });
      console.log(`[BET REGISTERED] Round ${roundId}: Placed ${amount} ${coin} (≈ $${usdValue.toFixed(4)} USD / ₹${inrValue.toFixed(2)} INR)`);
    } catch (err) {
      console.warn("[BET REGISTERED] Failed to save active bet:", err);
    }
  };

  const cancelActiveBetValue = async (uid: string, roundId: string) => {
    if (!db || !roundId) return;
    try {
      await deleteDoc(doc(db, 'gameBets', roundId, 'bets', uid));
      console.log(`[BET CANCELED] Round ${roundId} canceled for user ${uid}`);
    } catch (err) {
      console.warn("[BET CANCELED] Failed to cancel active bet:", err);
    }
  };

  const startRound = () => {
    // If running manually and user is not logged in, show Auth modal
    const currentUser = userRef.current;
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    if (isPlaying) {
      if (hasActiveBet && !hasCashedOut && !isCrashed) {
        cashOut();
      }
      return;
    }

    // Validate bet limits
    const currentCoin = activeCoinRef.current;
    const coinConfig = cryptoConfig[currentCoin];
    const userBet = betAmountRef.current;
    if (coinConfig) {
      if (userBet < coinConfig.min) {
        setError(language === 'hi' ? `न्यूनतम दांव ${coinConfig.min} ${currentCoin} है।` : language === 'hinglish' ? `Minimum bet limit ${coinConfig.min} ${currentCoin} hai bhae.` : `Minimum bet is ${coinConfig.min} ${currentCoin}.`);
        setTimeout(() => setError(null), 3500);
        return;
      }
      if (userBet > coinConfig.maxBet) {
        setError(language === 'hi' ? `अधिकतम दांव ${coinConfig.maxBet} ${currentCoin} है।` : language === 'hinglish' ? `Maximum bet limit ${coinConfig.maxBet} ${currentCoin} hai bhae.` : `Maximum bet is ${coinConfig.maxBet} ${currentCoin}.`);
        setTimeout(() => setError(null), 3500);
        return;
      }
    }

    // Queue Bet for next round
    if (globalStatus === 'WAITING') {
       if (balanceRef.current >= betAmountRef.current) {
          setHasActiveBet(true);
          updateUserBalance(currentUser.uid, balanceRef.current - betAmountRef.current, activeCoinRef.current);
          setWithdrawableBalance(prev => Math.max(0, prev - betAmountRef.current));
          registerActiveBetValue(currentUser.uid, globalRoundIdRef.current, betAmountRef.current, activeCoinRef.current);
       } else {
          setError("Balance kam hai bhai!");
          setTimeout(() => setError(null), 3000);
       }
    } else {
       // Queue for the one after this
       setIsBetQueued(true);
       showAdminStatus("Ride is in progress. Bet Queued for next round! 🏁", 'success', 3000);
    }
  };

  const cashOut = (forcedMultiplier?: number) => {
    // If it's an auto-exit (forcedMultiplier is set), we bypass standard in-flight guards since it might be a retroactive latency-proof settle.
    if (forcedMultiplier !== undefined) {
      if (hasCashedOutRef.current || !hasActiveBetRef.current) return;
      // Extra security check: do not allow cashout above actual crash point
      if (crashPointRef.current && forcedMultiplier > crashPointRef.current) return;
    } else {
      if (hasCashedOutRef.current || isCrashedRef.current || !isPlayingRef.current || !hasActiveBetRef.current || globalStatus !== 'IN_PROGRESS') return;
    }
    
    // Calculate final win using current live multiplier or forced auto exit multiplier
    const currentMult = forcedMultiplier !== undefined ? forcedMultiplier : multiplierRef.current;
    
    // Safety check - make sure that currentMult is not negative or zero
    if (currentMult <= 1.00) return;

    const currentBet = betAmountRef.current;
    const currentBal = balanceRef.current;
    
    // Properly format and round win amounts for cryptocurrencies based on decimals
    const coinConfig = cryptoConfig[activeCoinRef.current] || { decimals: 2, maxBet: 50000 };
    const decimals = coinConfig.decimals;
    const rawWinAmount = currentBet * currentMult;
    let winAmount = parseFloat(rawWinAmount.toFixed(decimals));

    // Cap maximum single win to prevent massive exploits on high value crypto coins
    const ultimateMaxWin = coinConfig.maxBet * 50;
    if (winAmount > ultimateMaxWin) {
      winAmount = ultimateMaxWin;
      console.log(`[SAFEGUARD] Win amount clamped at limit of ${ultimateMaxWin} ${activeCoinRef.current}`);
    }
    
    setHasCashedOut(true);
    setCashedOutMultiplier(currentMult);
    
    // Update balances
    const currentUser = userRef.current;
    if (currentUser) {
      const newBalance = currentBal + winAmount;
      updateUserBalance(currentUser.uid, newBalance, activeCoinRef.current);
      // Add only current profit to withdrawable tracking
      setWithdrawableBalance(prev => prev + winAmount);
      
      // Trigger the premium green success popup
      setWinPopup({
        amount: winAmount,
        multiplier: currentMult,
        coin: activeCoinRef.current
      });
      
      // Save to Firestore History
      saveGameHistory(currentUser.uid, {
          betAmount: currentBet,
          multiplier: currentMult,
          winAmount,
          status: 'win'
      }, currentUser.displayName || 'Rider', activeCoinRef.current);

      // Prepend user win to Marquee Riders list
      try {
        const coinConfig = allCountriesWithFlags.find(c => c.coin === activeCoinRef.current) || { flag: "🪙", country: "Global", displayPrefix: "" };
        const userWinner: CountryRider = {
          id: `user-win-${Date.now()}`,
          flag: coinConfig.flag,
          country: coinConfig.country,
          displayName: currentUser.displayName || 'You',
          multiplier: Number(currentMult.toFixed(2)),
          winAmount: winAmount,
          coin: activeCoinRef.current,
          isLive: true,
          timestamp: Date.now()
        };
        setMarqueeRiders(prev => {
          const updated = [userWinner, ...prev];
          if (updated.length > 100) return updated.slice(0, 100);
          return updated;
        });
      } catch (err) {
        console.warn("Failed to add user's win to marquee ribbon:", err);
      }
    }
    
    console.log(`[GAME] Cashed out at ${currentMult}x for ₹${winAmount}`);
    audioManager.playCashout();
  };

  const updateMultiplier = (timestamp: number) => {
    // If we are no longer playing or already crashed, or if global status changed, abort frame loop
    if (globalStatus !== 'IN_PROGRESS' || isCrashedRef.current || !startTimeRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      return;
    }

    const now = Date.now();
    const elapsed = now - startTimeRef.current;
    
    if (elapsed < 0) {
      setMultiplier(1.00);
      animationRef.current = requestAnimationFrame(updateMultiplier);
      return;
    }

    // Standard multiplier growth: 1.00 * e^(0.06 * t)
    const currentMultiplier = Math.pow(Math.E, 0.06 * (elapsed / 1000));
    const targetCrash = crashPointRef.current || 2;

    const timeElapsed = elapsed / 1000;

    // Check Auto-Exit (multiplier matches or exceeds target autoExit threshold) before crash is triggered
    if (isAutoExitRef.current && hasActiveBetRef.current && !hasCashedOutRef.current) {
      const targetVal = parseFloat(String(autoExitValueRef.current)) || 2.00;
      if (currentMultiplier >= targetVal && targetVal <= targetCrash) {
        cashOut(targetVal);
      }
    }

    if (currentMultiplier >= targetCrash) {
      setMultiplier(targetCrash);
      setIsCrashed(true);
      setIsPlaying(false);
      
      // Stop engine & trigger crash explosion sound
      audioManager.playCrash();
      
      setMultiplierPoints(prev => {
        const lastPoint = prev[prev.length - 1];
        if (!lastPoint || targetCrash > lastPoint.y) {
          return [...prev, { x: timeElapsed, y: targetCrash }].slice(-100);
        }
        return prev;
      });

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    } else {
      setMultiplier(currentMultiplier);
      
      // Update engine rev pitch
      audioManager.updateMultiplier(currentMultiplier);
      
      setMultiplierPoints(prev => {
        const lastPoint = prev[prev.length - 1];
        if (!lastPoint || (currentMultiplier > lastPoint.y && timeElapsed - lastPoint.x > 0.03)) {
          return [...prev, { x: timeElapsed, y: currentMultiplier }].slice(-100);
        }
        return prev;
      });

      animationRef.current = requestAnimationFrame(updateMultiplier);
    }
  };

  useEffect(() => {
    if (isPlaying && !isCrashed) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      animationRef.current = requestAnimationFrame(updateMultiplier);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    };
  }, [isPlaying, isCrashed]);

  // Real-Time Ticker & Simulated Multi-Country Winners Loop
  useEffect(() => {
    if (globalStatus !== 'IN_PROGRESS' || !isPlaying || isCrashed) return;

    // Every 1 to 3.5 seconds, model other players from around the world cashing out
    const interval = setInterval(() => {
      try {
        // Pick a random country from the pool of 100
        const randomCountry = allCountriesWithFlags[Math.floor(Math.random() * allCountriesWithFlags.length)];
        
        // Let's form a random username for them
        const fName = allFirstNames[Math.floor(Math.random() * allFirstNames.length)];
        const lSuffix = allLastNameSuffixes[Math.floor(Math.random() * allLastNameSuffixes.length)];
        const username = `${fName}${lSuffix}`;
        
        // Give them a realistic bet amount and calculate their payout with the current multiplier
        const rBet = Math.floor(Math.random() * 4500) + 500; // between 500 and 5000
        const currentMult = multiplierRef.current;
        const payout = rBet * currentMult;

        const newWinner: CountryRider = {
          id: `sim-${Date.now()}-${Math.random()}`,
          flag: randomCountry.flag,
          country: randomCountry.country,
          displayName: username,
          multiplier: Number(currentMult.toFixed(2)),
          winAmount: Math.floor(payout),
          coin: randomCountry.coin,
          isLive: true,
          timestamp: Date.now()
        };

        // Prepend this live winner to our top ribbon so they scroll past live!
        setMarqueeRiders(prev => {
          const updated = [newWinner, ...prev];
          if (updated.length > 100) {
            return updated.slice(0, 100);
          }
          return updated;
        });
      } catch (err) {
        console.warn("Simulator error:", err);
      }
    }, Math.floor(Math.random() * 2500) + 1200);

    return () => clearInterval(interval);
  }, [globalStatus, isPlaying, isCrashed]);

  const toggleAutoPlay = () => {
    const nextVal = !isAutoPlay;
    setIsAutoPlay(nextVal);
    
    // If turning on Auto Ride, and we are in WAITING status, and there's no active bet yet, let's place it!
    if (nextVal && user) {
      if (globalStatus === 'WAITING' && !hasActiveBet) {
        if (balance >= betAmount) {
          setHasActiveBet(true);
          updateUserBalance(user.uid, balance - betAmount, activeCoin);
          setWithdrawableBalance(prev => Math.max(0, prev - betAmount));
          registerActiveBetValue(user.uid, globalRoundIdRef.current, betAmount, activeCoin);
        } else {
          setError("Balance kam hai bhai!");
          setTimeout(() => setError(null), 3000);
        }
      } else if (globalStatus === 'IN_PROGRESS' || globalStatus === 'CRASHED') {
        // If in progress, queue it
        setIsBetQueued(true);
      }
    } else if (!nextVal) {
      // If turning off Auto Ride, let's cancel queued bets
      setIsBetQueued(false);
    }
  };

  const handleAdjustBet = (type: 'half' | 'double') => {
    if (isPlaying && hasActiveBet && !isCrashed) return;
    setBetAmount(prev => {
      const newVal = type === 'half' ? Math.floor(prev / 2) : prev * 2;
      return Math.max(10, newVal); // Min bet 10
    });
  };

  const removeNotification = async (id: string) => {
    setUserNotifications(prev => prev.filter(n => n.id.toString() !== id.toString()));
    try {
      await fetch('/api/user/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error("Failed to dismiss notification:", err);
    }
  };

  const [adminPasscode, setAdminPasscode] = useState(() => localStorage.getItem('rider_admin_pin') || '350');
  const [newPasscodeInput, setNewPasscodeInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem('rider_admin_authenticated') === 'true';
    }
    return false;
  });
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const [customBackendInput, setCustomBackendInput] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("CUSTOM_BACKEND_URL") || "";
    }
    return "";
  });

  const handleSaveCustomBackend = () => {
    if (customBackendInput.trim()) {
      localStorage.setItem("CUSTOM_BACKEND_URL", customBackendInput.trim());
      showAdminStatus("Custom Backend Registered! ⚡ Reloading to apply...", 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const handlePresetBackend = (url: string) => {
    setCustomBackendInput(url);
    localStorage.setItem("CUSTOM_BACKEND_URL", url);
    showAdminStatus(`Switched Backend to ${url}! ⚡ Reloading to apply...`, 'success');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleClearCustomBackend = () => {
    setCustomBackendInput("");
    localStorage.removeItem("CUSTOM_BACKEND_URL");
    localStorage.removeItem("CACHED_WORKING_BACKEND_URL");
    showAdminStatus("Reset Backend to automatic selection! 🔄 Reloading...", 'success');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleAdminAuth = () => {
    if (passcodeInput === adminPasscode) {
      setIsAdminAuthenticated(true);
      if (typeof window !== "undefined") {
        localStorage.setItem('rider_admin_authenticated', 'true');
      }
      setPasscodeError(false);
    } else {
      setPasscodeError(true);
      setTimeout(() => setPasscodeError(false), 2000);
    }
  };

  const updatePasscode = async () => {
    if (newPasscodeInput.length >= 3) {
      setAdminPasscode(newPasscodeInput);
      localStorage.setItem('rider_admin_pin', newPasscodeInput);
      
      if (db) {
        try {
          await setDoc(doc(db, 'admin', 'settings'), { adminPasscode: newPasscodeInput }, { merge: true });
        } catch (dbErr: any) {
          console.warn("Failed to sync passcode to Firestore settings:", dbErr);
        }
      }

      showAdminStatus("Passcode Updated Successfully! ✅");
      setNewPasscodeInput('');
    } else {
      showAdminStatus("PIN must be at least 3 digits! ❌", 'error');
    }
  };

  const [selectedCoin, setSelectedCoinState] = useState<any | null>(() => {
    try {
      const savedSymbol = localStorage.getItem('selected_crypto_coin_symbol');
      if (savedSymbol) {
        return { name: savedSymbol, symbol: savedSymbol, color: '#FFD700', address: '', isVisible: true };
      }
    } catch (_) {}
    return null;
  });

  const setSelectedCoin = (coin: any | null) => {
    setSelectedCoinState(coin);
    try {
      if (coin) {
        localStorage.setItem('selected_crypto_coin_symbol', coin.symbol);
      } else {
        localStorage.removeItem('selected_crypto_coin_symbol');
      }
    } catch (_) {}
  };

  useEffect(() => {
    try {
      const savedSymbol = localStorage.getItem('selected_crypto_coin_symbol');
      if (savedSymbol && coins && coins.length > 0) {
        const found = coins.find(c => c.symbol === savedSymbol);
        if (found) {
          setSelectedCoinState(found);
        }
      }
    } catch (_) {}
  }, [coins]);
  const [withdrawInput, setWithdrawInput] = useState('500');
  const [depositAmountInput, setDepositAmountInput] = useState('500');
  const [depositTxId, setDepositTxId] = useState('');
  const [userWithdrawAddress, setUserWithdrawAddress] = useState('');

  // Support / Complaint states
  const [complaintText, setComplaintText] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('Deposit');
  const [myComplaints, setMyComplaints] = useState<any[]>([]);
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [complaintMsg, setComplaintMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [allComplaints, setAllComplaints] = useState<any[]>([]);
  const [adminReplyText, setAdminReplyText] = useState<Record<string, string>>({});
  const [expandedUserComplaintsUid, setExpandedUserComplaintsUid] = useState<string | null>(null);

  // Live Support Direct Chat States
  const [supportTab, setSupportTab] = useState<'tickets' | 'chat'>('tickets');
  const [myChatMessages, setMyChatMessages] = useState<any[]>([]);
  const [myChatText, setMyChatText] = useState('');
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [allChatMessagesInAdmin, setAllChatMessagesInAdmin] = useState<any[]>([]);
  const [selectedAdminChatUserId, setSelectedAdminChatUserId] = useState<string | null>(null);
  const [adminResponseText, setAdminResponseText] = useState('');
  const [translatingMessageId, setTranslatingMessageId] = useState<string | null>(null);
  const [translatedCache, setTranslatedCache] = useState<Record<string, string>>({});

  // Profile display name edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [profileNameError, setProfileNameError] = useState('');

  useEffect(() => {
    if (user && user.displayName) {
      setEditedName(user.displayName);
    }
  }, [user]);
  const [withdrawStep, setWithdrawStep] = useState<'coin' | 'amount'>(() => {
    try {
      const savedSymbol = localStorage.getItem('selected_crypto_coin_symbol');
      if (savedSymbol) return 'amount';
    } catch (_) {}
    return 'coin';
  });

  useEffect(() => {
    if (isWithdrawModalOpen) {
      if (selectedCoin) {
        setWithdrawStep('amount');
      } else {
        setWithdrawStep('coin');
      }
    }
  }, [isWithdrawModalOpen, selectedCoin]);

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
    
    // Client-side guard for successful deposit
    if (!hasDeposited) {
      setError("Withdrawal locked hai bhai! Pehle kam se kam ek successful deposit approved hona chahiye. 🔒 (Complete 1 deposit to unlock!)");
      setTimeout(() => setError(null), 5000);
      return;
    }

    // Convert INR withdrawal amount to selected crypto coin amount based on rates
    const rate = rates[selectedCoin.symbol] || 1; 
    const coinAmount = amount / rate; // Example: ₹500 amount / ₹100 rate = 5 coins

    const coinBalance = coinBalances[selectedCoin.symbol] || 0;
    
    // Check main balance for crypto amount
    if (coinAmount > coinBalance) {
      setError(`Aapke paas ${selectedCoin.symbol} bal insufficient hai! Req: ${coinAmount.toFixed(4)}, Bal: ${coinBalance.toFixed(4)}.`);
      setTimeout(() => setError(null), 4000);
      return;
    }
    
    // Check against withdrawable (winnings) INR balance
    if (amount > withdrawableBalance) {
      setError("Sirf 'Winnings' balance hi withdraw hota hai!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      const res = await fetch('/api/withdraw/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: coinAmount, coin: selectedCoin, userAddress: userWithdrawAddress, userId: user.uid, originalAmountINR: amount })
      });
      const data = await res.json();
      if (res.ok) {
        updateUserBalance(user.uid, coinBalance - coinAmount, selectedCoin.symbol);
        setWithdrawableBalance(prev => Math.max(0, prev - amount));
        setIsWithdrawModalOpen(false);
        setWithdrawStep('amount');
        setUserWithdrawAddress('');
        showAdminStatus("Withdrawal Request Sent! 💸");
      } else {
        setError(data.error || "Withdrawal request failed!");
        setTimeout(() => setError(null), 5000);
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
        setDepositTxId('');
        showAdminStatus("Deposit Request Sent! Admin verify karega. ⏳", 'success', 5000);
      }
    } catch (err) {
      setError("Request fail ho gayi!");
    }
  };

  const [showAdmin, setShowAdmin] = useState(false);
  const [adminCrashPoint, setAdminCrashPoint] = useState('2.00');
  const [adminCrashReason, setAdminCrashReason] = useState('Admin forced crash!');
  const [adminStatus, setAdminStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showAdminStatus = (message: string, type: 'success' | 'error' = 'success', duration = 3000) => {
    setAdminStatus({ message, type });
    if (duration > 0) {
      setTimeout(() => setAdminStatus(null), duration);
    }
  };
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
      showAdminStatus("Bhai, balance amount dalo! 💸", 'error');
      return;
    }
    const val = parseFloat(amountVal);
    if (isNaN(val) || val < 0) {
      showAdminStatus("Incorrect Amount! Positive number (or 0) dalo. ❌", 'error');
      return;
    }

    const selectedSymbol = userCoinSelections[userId] || 'INR';
    
    try {
      showAdminStatus("Updating Balance... ⏳", 'success', 0);
      const res = await fetch('/api/admin/user/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amountToAdd: val, coinSymbol: selectedSymbol })
      });
      
      if (res.ok) {
        showAdminStatus(`Fuel Balance Added Successfully! ✅ (${selectedSymbol})`, 'success', 5000);
        setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
        fetchAdminUsers();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "API rejection");
      }
    } catch (err: any) {
      console.error("Balance update failed:", err);
      showAdminStatus(`Failed to update: ${err.message || String(err)} ❌`, 'error');
    }
  };

  const handleSetUserBalance = async (userId: string) => {
    const amountVal = userBalanceInputs[userId];
    if (amountVal === undefined || amountVal === '') {
      showAdminStatus("Bhai, balance amount dalo! 💸", 'error');
      return;
    }
    const val = parseFloat(amountVal);
    if (isNaN(val) || val < 0) {
      showAdminStatus("Incorrect Amount! Positive number (or 0) dalo. ❌", 'error');
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
        id: notificationId,
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

      showAdminStatus(`User Fuel Balance SET! ✅ (${selectedSymbol})`);
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
          showAdminStatus(`User Balance Set Successfully (via API)! ✅`);
          setUserBalanceInputs(prev => ({ ...prev, [userId]: '' }));
          fetchAdminUsers();
        } else {
          const errData = await res.json();
          showAdminStatus(errData.error || "Set fail ho gaya! ❌", 'error');
        }
      } catch (fallbackErr: any) {
        console.error("Direct balance fallback failed:", fallbackErr);
        showAdminStatus("Failed to set: " + (err.message || String(err)), 'error');
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
        coinBalances: { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0, LTC: 0, TRX: 0, BNB: 0, XRP: 0, MATIC: 0, TON: 0, ADA: 0, BCH: 0, DASH: 0, DGB: 0, FEY: 0, LINK: 0, DOT: 0 },
        activeCoin: 'INR',
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log("Firestore reset successful");

      const notificationId = Date.now().toString();
      const notificationRef = doc(db, 'notifications', notificationId);
      await setDoc(notificationRef, {
        id: notificationId,
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

      showAdminStatus("User Fuel Balance Reset to ₹0! 🛠️✅");
      fetchAdminUsers();
    } catch (err: any) {
      console.error("Reset balance failed, using backend fallback:", err);
      try {
        const res = await fetch('/api/admin/user/reset-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          showAdminStatus("User Balance Reset to ₹0 Successfully (via API)! ✅");
          fetchAdminUsers();
        } else {
          showAdminStatus("Reset balance via API failed! ❌", 'error');
        }
      } catch (fallbackErr) {
        showAdminStatus("Failed to reset balance: " + (err.message || String(err)), 'error');
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
        id: notificationId,
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

      showAdminStatus(`Rider ${actionLabel}ed Successfully! ✅`);
      fetchAdminUsers();
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
          showAdminStatus(`Rider ${actionLabel}ed Successfully (via API)! ✅`);
          fetchAdminUsers();
        } else {
          showAdminStatus(`Failed to ${actionLabel} rider via API! ❌`, 'error');
        }
      } catch (fallbackErr) {
        showAdminStatus("Failed to toggle block: " + (err.message || String(err)), 'error');
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
    if (!user) return;
    try {
      const data = await safeFetchJson(`/api/user/notifications?userId=${user.uid}`);
      if (data && Array.isArray(data)) {
          console.log(`Fetched ${data.length} notifications for user`);
          setUserNotifications(data);
      }
    } catch (err: any) {
      console.warn("Load notifications failed:", err.message || err);
    }
  };

  const fetchAdminPromocodes = async () => {
    setIsPromocodesLoading(true);
    try {
      const data = await safeFetchJson('/api/admin/promocodes');
      if (Array.isArray(data)) {
        setAdminPromocodes(data);
      }
      try {
        const historyData = await safeFetchJson('/api/admin/promocodes-history');
        if (Array.isArray(historyData)) {
          setAdminPromocodesHistory(historyData);
        }
      } catch (hErr) {
        console.warn("History fetch failed:", hErr);
      }
      try {
        const redemptionsData = await safeFetchJson('/api/admin/promo-redemptions');
        if (Array.isArray(redemptionsData)) {
          setAdminPromoRedemptions(redemptionsData);
        }
      } catch (rErr) {
        console.warn("Redemptions log fetch failed:", rErr);
      }
    } catch (err: any) {
      console.warn("Load promocodes failed:", err.message || err);
    } finally {
      setIsPromocodesLoading(false);
    }
  };

  const saveAdminPromocodes = async (updatedCodes: any[]) => {
    try {
      const data = await safeFetchJson('/api/admin/set-promocodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: updatedCodes }),
      });
      showAdminStatus(data.message || "Promo codes saved! ✅");
      setAdminPromocodes(updatedCodes);
      try {
        const historyData = await safeFetchJson('/api/admin/promocodes-history');
        if (Array.isArray(historyData)) {
          setAdminPromocodesHistory(historyData);
        }
      } catch (_) {}
    } catch (err: any) {
      console.error("Save promocodes failed:", err);
      showAdminStatus("Failed to save promo codes: " + (err.message || String(err)), 'error');
    }
  };

  const redeemPromoCode = async () => {
    if (!user) {
      setPromoMsg({ text: "Pehle sign-in karein! 🔑", type: 'error' });
      return;
    }
    if (!promoInput.trim()) {
      setPromoMsg({ text: "Promo code enter karein! 📝", type: 'error' });
      return;
    }

    setIsRedeemingPromo(true);
    setPromoMsg(null);
    try {
      const data = await safeFetchJson('/api/user/redeem-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          code: promoInput.trim()
        })
      });

      if (data && data.status === 'ok') {
        setPromoMsg({ text: data.message || "Success! 🎉", type: 'success' });
        // Update local user bonus balance
        if (data.newBonusBalance !== undefined) {
          setBonusBalance(data.newBonusBalance);
        }
        setPromoInput('');
        fetchUserNotifications();
        if (db) {
          const uSnap = await getDoc(doc(db, "users", user.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            setBonusBalance(uData.bonus_balance || 0);
          }
        }
      } else {
        setPromoMsg({ text: data.error || "Ghalat coupon code! ❌", type: 'error' });
      }
    } catch (err: any) {
      console.error("Redeem code action failed:", err);
      setPromoMsg({ text: err.error || err.message || "Redemption and verification failed. ❌", type: 'error' });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated && showAdmin) {
      fetchAdminWithdrawals();
      fetchAdminDeposits();
      fetchAdminUsers();
      fetchAdminPromocodes();
      const interval = setInterval(() => {
        fetchAdminWithdrawals();
        fetchAdminDeposits();
        fetchAdminUsers();
        fetchAdminPromocodes();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isAdminAuthenticated, showAdmin]);

  useEffect(() => {
    const interval = setInterval(fetchUserNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Live Support & Complaint Listeners ---
  useEffect(() => {
    if (!user || !db) return;
    const q = query(
      collection(db, 'complaints'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMyComplaints(list);
    }, (err) => {
      console.warn("Error listening to user complaints:", err);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!isAdminAuthenticated || !showAdmin || !db) return;
    const q = collection(db, 'complaints');
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAllComplaints(list);
    }, (err) => {
      console.warn("Error listening to admin complaints:", err);
    });
    return () => unsub();
  }, [isAdminAuthenticated, showAdmin]);

  // Live direct chat listeners (Real-time Sync)
  useEffect(() => {
    if (!user || !db) return;
    const q = query(
      collection(db, 'direct_chats'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMyChatMessages(list);
    }, (err) => {
      console.warn("Error listening to user live chat:", err);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!isAdminAuthenticated || !showAdmin || !db) return;
    const q = collection(db, 'direct_chats');
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setAllChatMessagesInAdmin(list);
    }, (err) => {
      console.warn("Error listening to admin live chats:", err);
    });
    return () => unsub();
  }, [isAdminAuthenticated, showAdmin]);

  // Direct Live Chat send helpers
  const sendUserChatMessage = async () => {
    if (!user || !db || !myChatText.trim()) return;
    setIsSendingChatMessage(true);
    try {
      const curCoin = activeCoinRef.current || 'INR';
      const coinConfig = allCountriesWithFlags.find(c => c.coin === curCoin) || { flag: "🇮🇳", country: "India" };

      const messageId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      await setDoc(doc(db, 'direct_chats', messageId), {
        userId: user.uid,
        userDisplayName: user?.displayName || 'Anonymous Rider',
        userEmail: user?.email || 'guest@desi-rider.com',
        sender: 'user',
        message: myChatText.trim(),
        country: coinConfig.country,
        flag: coinConfig.flag,
        createdAt: Date.now()
      });
      setMyChatText('');
    } catch (err) {
      console.error("Failed to send chat message:", err);
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const sendAdminChatMessage = async () => {
    if (!db || !selectedAdminChatUserId || !adminResponseText.trim()) return;
    try {
      const userMsgs = allChatMessagesInAdmin.filter(m => m.userId === selectedAdminChatUserId);
      const sample = userMsgs[0] || {};

      const messageId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      await setDoc(doc(db, 'direct_chats', messageId), {
        userId: selectedAdminChatUserId,
        userDisplayName: sample.userDisplayName || 'Rider',
        userEmail: sample.userEmail || '',
        sender: 'admin',
        message: adminResponseText.trim(),
        country: sample.country || 'Global',
        flag: sample.flag || '🪙',
        createdAt: Date.now()
      });
      setAdminResponseText('');
    } catch (err) {
      console.error("Failed to send admin chat reply:", err);
    }
  };

  const translateChatMessage = async (messageId: string, text: string, targetLanguage: 'Hindi' | 'English') => {
    if (translatingMessageId) return;
    setTranslatingMessageId(messageId);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, targetLanguage })
      });
      
      if (!response.ok) {
        throw new Error('API request failed');
      }
      
      const data = await response.json();
      if (data.translatedText) {
        setTranslatedCache(prev => ({
          ...prev,
          [`${messageId}_${targetLanguage}`]: data.translatedText
        }));
      }
    } catch (err) {
      console.error("Translation processing failed:", err);
    } finally {
      setTranslatingMessageId(null);
    }
  };

  const submitComplaint = async () => {
    if (!user) return;
    if (!complaintText.trim()) {
      setComplaintMsg({ text: 'Please details enter karein.', type: 'error' });
      return;
    }
    setIsSubmittingComplaint(true);
    setComplaintMsg(null);
    try {
      const newDocId = `comp_${Date.now()}`;
      await setDoc(doc(db, 'complaints', newDocId), {
        userId: user.uid,
        userEmail: user.email || 'guest@desi-rider.com',
        userDisplayName: user.displayName || 'Anonymous Rider',
        category: complaintCategory,
        message: complaintText.trim(),
        status: 'pending',
        adminReply: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setComplaintText('');
      setComplaintMsg({ text: 'Shikayat successfully bej di gayi hai! 📩', type: 'success' });
      setTimeout(() => setComplaintMsg(null), 5000);
    } catch (err: any) {
      console.error("Failed to submit complaint:", err);
      setComplaintMsg({ text: 'Kuch error aya, re-try karein!', type: 'error' });
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  const submitAdminReply = async (complaintId: string, replyValue: string, resolveStatus: boolean = false) => {
    if (!db) return;
    try {
      showAdminStatus("Submitting reply... ⏳", 'success', 1500);
      const complaintRef = doc(db, 'complaints', complaintId);
      const updateData: any = {
        adminReply: replyValue.trim(),
        updatedAt: Date.now()
      };
      if (resolveStatus) {
        updateData.status = 'resolved';
      }
      await setDoc(complaintRef, updateData, { merge: true });
      showAdminStatus("Complaint reply saved successfully! ✅", 'success', 4000);
      setAdminReplyText(prev => ({ ...prev, [complaintId]: '' }));
    } catch (err: any) {
      console.error("Failed to update complaint:", err);
      showAdminStatus("Replied failed: " + err.message, 'error');
    }
  };

  const handleUpdateDisplayName = async () => {
    if (!user || !editedName.trim()) return;
    const newName = editedName.trim();
    if (newName === user.displayName) {
      setIsEditingName(false);
      return;
    }
    
    setIsSavingName(true);
    setProfileNameError('');
    try {
      // 1. Update Firebase Auth Profile
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updateProfile(currentUser, { displayName: newName });
      }
      
      // 2. Update Firestore user document
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { displayName: newName }, { merge: true });
      
      // 3. Update cached profile in LocalStorage
      const localKey = `cached_profile_v1_${user.uid}`;
      const cached = localStorage.getItem(localKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          parsed.displayName = newName;
          localStorage.setItem(localKey, JSON.stringify(parsed));
        } catch (_) {}
      }
      
      // 4. Update local state
      setUser((prev: any) => ({ ...prev, displayName: newName }));
      setIsEditingName(false);
    } catch (err: any) {
      console.error("Failed to update display name:", err);
      setProfileNameError(err.message || 'Apna naam update karne me dikkat hui.');
    } finally {
      setIsSavingName(false);
    }
  };

  const approveWithdrawal = async (requestId: number) => {
    try {
      const res = await fetch('/api/admin/withdraw/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        showAdminStatus("Withdrawal Approved! ✅");
        fetchAdminWithdrawals();
      }
    } catch (err) {
      showAdminStatus("Approval failed ❌", 'error');
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

        showAdminStatus("Deposit Approved & Balance Added! ✅");
        fetchAdminDeposits();
      }
    } catch (err) {
      showAdminStatus("Approval failed ❌", 'error');
    }
  };

  const saveCryptoAddresses = async () => {
    try {
      // Perform backend API sync to save addresses securely
      const data = await safeFetchJson('/api/admin/save-crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins })
      });
      showAdminStatus(data.message || "Crypto addresses saved! ✅");
    } catch (err: any) {
      console.warn("API set-crypto failed:", err.message || err);
      showAdminStatus("Failed to save crypto addresses: " + (err.message || String(err)), 'error');
    }
  };

  const setAdminOverride = async () => {
    const crashVal = parseFloat(adminCrashPoint);
    if (isNaN(crashVal) || crashVal < 1) {
      setAdminStatus({ message: "Bhai, 1.00 se kam nahi ho sakta! 📉", type: 'error' });
      setTimeout(() => setAdminStatus(null), 3000);
      return;
    }

    try {
      const data = await safeFetchJson('/api/admin/set-crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          crashPoint: crashVal.toString(), 
          crashReason: adminCrashReason.trim() 
        })
      });
      console.log("Admin override success:", data);
      showAdminStatus(data.message || "Physics Modified! ✅");
    } catch (err: any) {
      const errMsg = err.message || "Physics apply nahi hui!";
      showAdminStatus(`Error: ${errMsg}`, 'error');
      console.error("Error setting override:", err);
    }
  };

  const clearAdminOverride = async () => {
    try {
      const data = await safeFetchJson('/api/admin/consume-override', { method: 'POST' });
      showAdminStatus("Physics Restored to Normal! ✅");
    } catch (err: any) {
      showAdminStatus("Clear fail ho gaya!", 'error');
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
    <div className="fixed inset-0 flex flex-col w-full bg-[#0F0F0F] text-[#F5F5F5] font-sans border-zinc-800 overflow-hidden overscroll-none select-none">
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        onGuestLogin={handleGuestLogin}
      />

      {/* Admin Toggle */}
      <style>{`
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #0F0F0F; }
        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
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
              {/* Status Message */}
              <AnimatePresence>
                {adminStatus && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0, 
                      scale: [1, 1.02, 1],
                    }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ 
                      scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                    }}
                    className={`mt-6 p-4 rounded-xl border-2 flex items-center justify-center gap-3 ${
                      adminStatus.type === 'success' 
                        ? 'bg-yellow-500/10 border-[#FFD700] text-[#FFD700]' 
                        : 'bg-red-500/10 border-red-500 text-red-500'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full animate-ping ${adminStatus.type === 'success' ? 'bg-[#FFD700]' : 'bg-red-500'}`} />
                    <span className="font-black uppercase italic text-sm tracking-widest">{adminStatus.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

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
                          if (typeof window !== "undefined") {
                            localStorage.removeItem('rider_admin_authenticated');
                          }
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

                   {/* Live Direct Chat Section */}
                   <div className="mt-8 pt-6 border-t border-zinc-800 pb-6">
                     <h4 className="text-[#FFD700] font-bold text-sm uppercase tracking-widest flex items-center gap-2 mb-4">
                       <MessageSquare className="w-4 h-4" />
                       <span>Live Direct Chat (यूज़र के साथ सीधा चैट)</span>
                     </h4>
                     
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Users List */}
                       <div className="md:col-span-1 bg-black/40 border border-zinc-800 rounded-xl p-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Active Chats ({Array.from(new Set(allChatMessagesInAdmin.map(m => m.userId))).length})</p>
                         <div className="space-y-1">
                           {Array.from(new Set(allChatMessagesInAdmin.map(m => m.userId))).map((uid) => {
                             const userMsgs = allChatMessagesInAdmin.filter(m => m.userId === uid);
                             const lastMsg = userMsgs[userMsgs.length - 1];
                             return (
                               <button
                                 key={uid}
                                 onClick={() => setSelectedAdminChatUserId(uid)}
                                 className={`w-full text-left p-3 rounded-lg text-xs transition-all ${
                                   selectedAdminChatUserId === uid 
                                     ? 'bg-red-900/40 border border-red-600/50' 
                                     : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700'
                                 }`}
                               >
                                 <div className="font-bold text-zinc-200">{lastMsg.userDisplayName}</div>
                                 <div className="text-[9px] text-zinc-500 truncate">{lastMsg.message}</div>
                               </button>
                             );
                           })}
                         </div>
                       </div>

                       {/* Chat View */}
                       <div className="md:col-span-2 bg-black/40 border border-zinc-800 rounded-xl p-4 flex flex-col h-[400px]">
                         {selectedAdminChatUserId ? (
                           <>
                             <div className="text-[10px] text-zinc-400 uppercase font-bold border-b border-zinc-800 pb-2 mb-2">
                               Chat with {allChatMessagesInAdmin.find(m => m.userId === selectedAdminChatUserId)?.userDisplayName || 'User'}
                             </div>
                             
                             <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar mb-4">
                               {allChatMessagesInAdmin.filter(m => m.userId === selectedAdminChatUserId).map(msg => (
                                 <div key={msg.id} className={`flex flex-col ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                                   <div className={`p-3 rounded-lg text-xs max-w-[80%] ${msg.sender === 'admin' ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                     {msg.message}
                                     <div className="flex gap-2 mt-2">
                                       <button onClick={() => translateChatMessage(msg.id, msg.message, 'Hindi')} className="text-[8px] bg-black/20 px-1 rounded">Translate Hindi</button>
                                       <button onClick={() => translateChatMessage(msg.id, msg.message, 'English')} className="text-[8px] bg-black/20 px-1 rounded">Translate English</button>
                                     </div>
                                     {translatedCache[`${msg.id}_Hindi`] && <div className="text-[9px] mt-1 text-emerald-300">Hindi: {translatedCache[`${msg.id}_Hindi`]}</div>}
                                     {translatedCache[`${msg.id}_English`] && <div className="text-[9px] mt-1 text-sky-300">English: {translatedCache[`${msg.id}_English`]}</div>}
                                   </div>
                                 </div>
                               ))}
                             </div>
                             
                             <div className="flex gap-2">
                               <input
                                 type="text"
                                 value={adminResponseText}
                                 onChange={(e) => setAdminResponseText(e.target.value)}
                                 className="flex-1 bg-black text-white text-xs border border-zinc-800 rounded p-3 outline-none"
                                 placeholder="Type reply..."
                               />
                               <button 
                                 onClick={sendAdminChatMessage}
                                 className="bg-red-600 text-white px-4 rounded text-xs uppercase font-bold"
                               >
                                 Send
                               </button>
                             </div>
                           </>
                         ) : (
                           <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs italic">
                             Select a user to start chatting
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                   
                   {/* Promo Codes Management */}
                  <div className="mt-8 pt-6 border-t border-zinc-800 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[#FFD700] font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                          <span>🎁 Promo Codes Maker (प्रमो कोड बनाएं)</span>
                        </h4>
                        <span className="text-[9px] uppercase font-bold text-zinc-500">Live Management</span>
                      </div>
                      
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-sans bg-[#FFD700]/5 border border-[#FFD700]/25 p-3 rounded-lg">
                        ℹ️ <strong>यूं बनाएं कोड:</strong> आप खुद अपना मनपसंद कोड लिख सकते हैं (जैसे <code>MYRIDER77</code>)। यूज़र को कितना बोनस पॉइंट्स देना है वह खुद तय करें, तथा कितने यूज़र्स इस कोड को इस्तेमाल कर सकते हैं वह भी तय करें। जैसे ही लिमिट ख़त्म होगी, कोड अपने-आप अमान्य (Invalid) हो जाएगा।
                      </p>

                      <div className="bg-zinc-950 border border-zinc-800/80 p-5 rounded-xl space-y-4 shadow-xl">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                              Promo Code Name (कोडक का नाम - जो यूज़र डालेगा)
                            </label>
                            <input 
                              type="text" 
                              placeholder="जैसे: FREE500, SUPER777..."
                              value={newPromoCode}
                              onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                              className="w-full bg-black/80 border-2 border-zinc-800 p-3 text-sm rounded outline-none text-[#FFD700] uppercase font-mono font-bold focus:border-[#FFD700] transition-all"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                                Bonus Weight (कितना बोनस पॉइंट देना है)
                              </label>
                              <input 
                                type="number" 
                                placeholder="जैसे: 500"
                                value={newPromoReward}
                                onChange={(e) => setNewPromoReward(e.target.value)}
                                className="w-full bg-black/80 border-2 border-zinc-800 p-3 text-sm rounded outline-none text-white font-mono focus:border-emerald-500 transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                                Max Users Count (कितने यूज़र यूज़ कर पाएंगे)
                              </label>
                              <input 
                                type="number" 
                                placeholder="जैसे: 50, 100..."
                                value={newPromoMaxUses}
                                onChange={(e) => setNewPromoMaxUses(e.target.value)}
                                className="w-full bg-black/80 border-2 border-zinc-800 p-3 text-sm rounded outline-none text-white font-mono focus:border-blue-500 transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (!newPromoCode.trim()) {
                              showAdminStatus("Promo code name khali nahi ho sakta! ❌", 'error');
                              return;
                            }
                            const rewardNum = parseFloat(newPromoReward);
                            const maxUsesNum = parseInt(newPromoMaxUses);
                            if (isNaN(rewardNum) || rewardNum <= 0) {
                              showAdminStatus("Sahi reward points enter karein! ❌", 'error');
                              return;
                            }
                            const codeUpper = newPromoCode.trim().toUpperCase();
                            if (adminPromocodes.some(p => p.code.toUpperCase() === codeUpper)) {
                              showAdminStatus("Yeh promo code pehle se maujood hai! 😡", 'error');
                              return;
                            }
                            const updated = [
                              ...adminPromocodes,
                              { 
                                code: codeUpper, 
                                reward: rewardNum, 
                                uses: 0, 
                                maxUses: isNaN(maxUsesNum) ? 1000 : maxUsesNum, 
                                usedBy: [] 
                              }
                            ];
                            saveAdminPromocodes(updated);
                            setNewPromoCode('');
                            setNewPromoReward('');
                            setNewPromoMaxUses('');
                          }}
                          className="w-full py-3 bg-[#FFD700] text-black font-black uppercase text-[11px] skew-x-[-10deg] tracking-widest hover:bg-white duration-200 shadow-[0_4px_15px_rgba(255,215,0,0.2)]"
                        >
                          CREATE & SAVE PROMO CODE ➕
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-1">
                          <span>📋 Active Promo Codes (चल रहे प्रमो कोड्स)</span>
                        </h4>
                        <span className="text-[9px] text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest">
                          {adminPromocodes.length} Total Codes
                        </span>
                      </div>

                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                        <div className="max-h-72 overflow-y-auto custom-scrollbar">
                          {isPromocodesLoading ? (
                            <div className="p-8 text-center">
                              <RefreshCw className="w-6 h-6 text-[#FFD700] animate-spin mx-auto mb-2" />
                              <p className="text-[10px] text-zinc-400 uppercase font-mono">Loading dynamic codes...</p>
                            </div>
                          ) : (
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-black text-zinc-400 uppercase text-[9px] tracking-wider font-bold">
                                <tr>
                                  <th className="p-3 border-b border-zinc-800">Code</th>
                                  <th className="p-3 border-b border-zinc-800">Reward Bonus</th>
                                  <th className="p-3 border-b border-zinc-800">Uses / Max</th>
                                  <th className="p-3 border-b border-zinc-800">Status</th>
                                  <th className="p-3 text-right border-b border-zinc-800 font-black">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-900">
                                {adminPromocodes.map((promo, idx) => {
                                  const isExpired = promo.uses >= (promo.maxUses || 1000);
                                  return (
                                    <tr key={promo.code} className="hover:bg-white/5 transition-colors">
                                      <td className="p-3">
                                        <p className="text-[#FFD700] font-mono font-black uppercase text-xs">{promo.code}</p>
                                      </td>
                                      <td className="p-3 font-mono text-emerald-400 font-bold">
                                        ₹{promo.reward} Bonus
                                      </td>
                                      <td className="p-3 font-mono text-white font-semibold">
                                        <span className="text-blue-400">{promo.uses}</span>
                                        <span className="text-zinc-650"> / </span>
                                        <span className="text-zinc-400">{promo.maxUses || '∞'}</span>
                                      </td>
                                      <td className="p-3">
                                        {isExpired ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-900/30">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                            EXPIRED
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-900/30 animate-pulse">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                            ACTIVE
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-right whitespace-nowrap">
                                        <button 
                                          onClick={() => {
                                            const filtered = adminPromocodes.filter((_, i) => i !== idx);
                                            saveAdminPromocodes(filtered);
                                          }}
                                          className="bg-red-900/20 text-red-400 border border-red-900/30 hover:bg-red-600 hover:text-white hover:border-red-600 px-2.5 py-1 rounded text-[9px] font-black uppercase italic duration-150"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {adminPromocodes.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="p-10 text-center text-zinc-550 italic">No custom promo codes made yet. Create one on the left!</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Promo Codes History Log & Redemption History Panel */}
                  <div className="mt-8 pt-6 border-t border-zinc-800 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Left Side: Creation History of all codes ever made */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-blue-400 animate-spin-slow" />
                            <span>📜 Created Codes History (प्रमो कोड्स इतिहास - निर्माण)</span>
                          </h4>
                          <span className="text-[9px] text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest">
                            {adminPromocodesHistory.length} Total Made
                          </span>
                        </div>
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-black text-zinc-400 uppercase text-[9px] tracking-wider font-bold">
                                <tr>
                                  <th className="p-3 border-b border-zinc-800">Code Name</th>
                                  <th className="p-3 border-b border-zinc-800">Reward</th>
                                  <th className="p-3 border-b border-zinc-800">Max Limit</th>
                                  <th className="p-3 border-b border-zinc-800 text-right">Created At</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-900">
                                {adminPromocodesHistory.map((hCode) => (
                                  <tr key={hCode.code + hCode.createdAt} className="hover:bg-white/5 transition-colors">
                                    <td className="p-3 font-mono font-black text-white">{hCode.code}</td>
                                    <td className="p-3 text-emerald-400 font-bold">₹{hCode.reward}</td>
                                    <td className="p-3 text-zinc-400">{hCode.maxUses || '1000'}</td>
                                    <td className="p-3 text-zinc-500 font-mono text-right text-[10px]">
                                      {new Date(hCode.createdAt).toLocaleString('en-IN', { timeZone: 'IST' })}
                                    </td>
                                  </tr>
                                ))}
                                {adminPromocodesHistory.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="p-8 text-center text-zinc-550 italic">No static promocodes logged. Codes you make will appear here!</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Redemption Log */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-1.5">
                            <Gift className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            <span>📈 Claim / Redemption History (किस यूज़र ने दावा किया)</span>
                          </h4>
                          <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest">
                            {adminPromoRedemptions.length} Claimed
                          </span>
                        </div>
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-black text-zinc-400 uppercase text-[9px] tracking-wider font-bold">
                                <tr>
                                  <th className="p-3 border-b border-zinc-800">User Email</th>
                                  <th className="p-3 border-b border-zinc-800">Code Used</th>
                                  <th className="p-3 border-b border-zinc-800">Claimed Amount</th>
                                  <th className="p-3 border-b border-zinc-800 text-right">Redeemed On</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-900">
                                {adminPromoRedemptions.map((log) => (
                                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-3 text-white truncate max-w-[150px]" title={log.userEmail}>{log.userEmail}</td>
                                    <td className="p-3 font-mono font-black text-[#FFD700]">{log.code}</td>
                                    <td className="p-3 font-mono text-emerald-400 font-bold">₹{log.reward}</td>
                                    <td className="p-3 text-zinc-500 font-mono text-right text-[10px]">
                                      {new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'IST' })}
                                    </td>
                                  </tr>
                                ))}
                                {adminPromoRedemptions.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="p-8 text-center text-zinc-550 italic">No claims processed yet. Claims display here in real time!</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Global Support Tickets Feed */}
                  {allComplaints.length > 0 && (
                    <div className="bg-zinc-950/80 border-2 border-red-500/20 p-5 rounded-2xl space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                        <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                          <span>Rider Helpdesk & Complaint Box ({allComplaints.filter(c => c.status !== 'resolved').length} Pending ⏳)</span>
                        </h4>
                        <span className="text-[8px] bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-red-900/30">
                          Live Support Feed
                        </span>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                        {allComplaints.map((comp) => {
                          const isExpanded = expandedUserComplaintsUid === comp.userId;
                          return (
                            <div key={comp.id} className="bg-black/50 border border-zinc-850 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-zinc-850 transition-colors">
                              <div className="space-y-1.5 flex-1 select-all text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white font-bold">{comp.userDisplayName || 'Anonymous Rider'}</span>
                                  <span className="text-[8px] px-2 py-0.5 bg-red-950/40 text-red-450 border border-red-900/10 rounded font-mono uppercase">
                                    • {comp.category}
                                  </span>
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    comp.status === 'resolved' 
                                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' 
                                      : 'bg-yellow-950/30 text-yellow-500 border border-yellow-900/20'
                                  }`}>
                                    {comp.status === 'resolved' ? 'RESOLVED ✅' : 'PENDING ⏳'}
                                  </span>
                                </div>
                                <p className="text-zinc-300 font-sans leading-relaxed break-all">{comp.message}</p>
                                {comp.adminReply && (
                                  <p className="text-[10px] text-zinc-550 italic font-sans">
                                    Last Admin Response: <span className="text-zinc-400 font-normal">{comp.adminReply}</span>
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <button
                                  onClick={() => {
                                    setExpandedUserComplaintsUid(isExpanded ? null : comp.userId);
                                    if (!isExpanded) {
                                      // Optional: scroll automatically to the users section
                                      document.getElementById('registered-users-fuel-mgt')?.scrollIntoView({ behavior: 'smooth' });
                                    }
                                  }}
                                  className="bg-zinc-800 hover:bg-[#FFD700] hover:text-black hover:scale-[1.02] active:scale-[0.98] text-white font-bold text-[9px] uppercase tracking-wider px-3.5 py-2 rounded-lg border border-zinc-700 hover:border-transparent transition-all shrink-0"
                                >
                                  {isExpanded ? "Hide Rider Details 📂" : "Go to Rider & Reply 🎫"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                                <label className="flex items-center gap-1 text-[9px] text-zinc-500 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={coin.isVisible}
                                        onChange={(e) => {
                                            const newCoins = [...coins];
                                            newCoins[index] = { ...coin, isVisible: e.target.checked };
                                            setCoins(newCoins);
                                        }}
                                        className="accent-[#FFD700]"
                                    />
                                    Visible
                                </label>
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
                  <div id="registered-users-fuel-mgt" className="mt-8 pt-6 border-t border-zinc-800 space-y-4">
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
                            {adminUsers.map((u) => {
                              const userComplaints = allComplaints.filter(c => c.userId === u.uid);
                              const hasPending = userComplaints.some(c => c.status !== 'resolved');
                              const isExpanded = expandedUserComplaintsUid === u.uid;

                              return (
                                <Fragment key={u.uid}>
                                  <tr className={`hover:bg-white/5 transition-colors ${isExpanded ? 'bg-zinc-900/60' : ''}`}>
                                    <td className="p-3">
                                      <div className="flex flex-col gap-1">
                                        <p className="text-white font-bold flex items-center gap-1.5 flex-wrap">
                                          <span>{u.displayName || 'Anonymous Rider'}</span>
                                          {userComplaints.length > 0 && (
                                            <button 
                                              onClick={() => setExpandedUserComplaintsUid(isExpanded ? null : u.uid)}
                                              className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full cursor-pointer transition-all hover:scale-105 select-none shrink-0 flex items-center gap-1.5 border ${
                                                hasPending 
                                                  ? 'bg-red-950 text-red-400 border-red-800/80 animate-pulse' 
                                                  : 'bg-zinc-850 text-zinc-400 border-zinc-750'
                                              }`}
                                            >
                                              <span>🎫 {userComplaints.length} Ticket{userComplaints.length > 1 ? 's' : ''}</span>
                                              {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>}
                                            </button>
                                          )}
                                        </p>
                                        <p className="text-zinc-500 font-mono text-[10px]">{u.email || 'No email linked'}</p>
                                      </div>
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

                                  {isExpanded && (
                                    <tr className="bg-zinc-950 border-y border-zinc-850">
                                      <td colSpan={5} className="p-4 sm:p-5">
                                        <div className="bg-[#121212] border-2 border-red-500/20 rounded-2xl p-5 space-y-4 shadow-3xl">
                                          <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
                                            <div className="flex items-center gap-2">
                                              <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                                              <h5 className="text-[11px] font-black uppercase text-[#FFD700] tracking-widest font-sans">
                                                Active Support Tickets of {u.displayName || 'Rider'} ({userComplaints.length})
                                              </h5>
                                            </div>
                                            <button 
                                              onClick={() => setExpandedUserComplaintsUid(null)}
                                              className="text-zinc-550 hover:text-white uppercase font-black text-[9px] tracking-wider"
                                            >
                                              Close DETAILS [X]
                                            </button>
                                          </div>

                                          <div className="space-y-4">
                                            {userComplaints.map((comp) => {
                                              const replyValue = adminReplyText[comp.id] || '';
                                              return (
                                                <div key={comp.id} className="bg-black/60 border border-zinc-850 p-4 rounded-xl space-y-3">
                                                  <div className="flex justify-between items-center text-[10px]">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="text-zinc-400 font-mono font-bold text-[8px] px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
                                                        Category: {comp.category}
                                                      </span>
                                                      <span className="text-zinc-500 font-mono text-[8px]">ID: {comp.id}</span>
                                                    </div>
                                                    <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded border ${
                                                      comp.status === 'resolved' 
                                                        ? 'bg-emerald-950 text-emerald-400 border-emerald-900/40' 
                                                        : 'bg-red-950/40 text-red-400 border-red-900/30 font-bold'
                                                    }`}>
                                                      {comp.status === 'resolved' ? 'RESOLVED ✅' : 'PENDING ⏳'}
                                                    </span>
                                                  </div>

                                                  <div className="bg-black border border-zinc-900 p-3 rounded-lg">
                                                    <p className="text-[9px] text-[#FFD700]/70 font-bold uppercase tracking-wider mb-1">Complaint Description:</p>
                                                    <p className="text-white text-xs select-all whitespace-pre-wrap break-all leading-relaxed font-sans">{comp.message}</p>
                                                  </div>

                                                  {comp.adminReply && (
                                                    <div className="bg-emerald-950/5 border-l-2 border-emerald-500 p-3 rounded-r-xl space-y-0.5">
                                                      <p className="text-[9px] font-black uppercase italic text-emerald-400">Current Saved Reply:</p>
                                                      <p className="text-zinc-300 select-all leading-normal break-all font-sans">{comp.adminReply}</p>
                                                    </div>
                                                  )}

                                                  <div className="space-y-2 pt-2 border-t border-zinc-900/80">
                                                    <label className="text-[9px] text-[#FFD700] uppercase font-black tracking-wider block">
                                                      Type New Reply or Change Reply (उत्तर / समाधान लिखें):
                                                    </label>
                                                    <textarea 
                                                      rows={2}
                                                      placeholder="Yahan reply enter karein..."
                                                      value={replyValue}
                                                      onChange={(e) => setAdminReplyText(prev => ({ ...prev, [comp.id]: e.target.value }))}
                                                      className="w-full bg-black text-white text-xs border border-zinc-850 rounded-lg p-2.5 outline-none focus:border-[#FFD700] placeholder-zinc-700 resize-none transition-all font-sans"
                                                    />

                                                    <div className="flex gap-2 flex-wrap">
                                                      <button
                                                        onClick={() => submitAdminReply(comp.id, replyValue, false)}
                                                        disabled={!replyValue.trim()}
                                                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase text-[9px] rounded-lg border border-zinc-700 disabled:opacity-30 duration-150 transition-all"
                                                      >
                                                        Save Reply Only ✉️
                                                      </button>
                                                      <button
                                                        onClick={() => submitAdminReply(comp.id, replyValue, true)}
                                                        disabled={!replyValue.trim()}
                                                        className="px-3.5 py-2 bg-[#FFD700] hover:bg-white text-black font-black uppercase text-[9px] rounded-lg disabled:opacity-40 duration-150 transition-all flex items-center gap-1 shadow-md"
                                                      >
                                                        <span>Save Reply & Mark Resolved ✅</span>
                                                      </button>
                                                      {comp.status !== 'resolved' && (
                                                        <button
                                                          onClick={() => submitAdminReply(comp.id, comp.adminReply || 'Resolved by Admin.', true)}
                                                          className="px-3.5 py-2 bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-950/30 font-bold uppercase text-[9px] rounded-lg duration-150 transition-all"
                                                        >
                                                          Direct Resolve ✅
                                                        </button>
                                                      )}
                                                    </div>
                                                  </div>

                                                  <div className="text-[8px] text-zinc-650 text-right font-mono">
                                                    Submitted: {new Date(comp.createdAt).toLocaleString('en-IN', { timeZone: 'IST' })}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                            {userComplaints.length === 0 && (
                                              <p className="text-zinc-500 text-xs italic text-center py-2">No complaints submitted by this user.</p>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
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
                      <p className={`font-black uppercase italic tracking-widest text-xs animate-pulse ${adminStatus.type === 'error' ? 'text-red-500' : 'text-[#FFD700]'}`}>
                        {adminStatus.message}
                      </p>
                    )}
                  </div>
                  <p className="mt-4 text-[10px] text-zinc-600 uppercase tracking-widest italic">
                    * Physics override only applies to the next ride. Passcode is saved in your local browser storage.
                  </p>

                  <div className="mt-6 p-4 bg-zinc-950 border border-zinc-805/60 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                        <span className="text-[#FFD700]">⚡</span> Connection Settings
                      </h4>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700] animate-ping" /> Connection Online
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed uppercase italic font-bold">
                      Backend Cloud Run instance processes manual fuel balances, deposits, withdrawals, physics, and promo rewards.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://your-backend-api.run.app"
                          value={customBackendInput}
                          onChange={(e) => setCustomBackendInput(e.target.value)}
                          className="flex-1 bg-black/80 border-2 border-zinc-850 px-3 py-2 text-xs rounded outline-none text-white font-mono focus:border-[#FFD700] transition-all"
                        />
                        <button
                          onClick={handleSaveCustomBackend}
                          className="bg-[#FFD700] hover:bg-white text-black text-[10px] whitespace-nowrap font-black uppercase tracking-wider px-3.5 py-2.5 rounded transition-all active:scale-95"
                        >
                          Set Custom
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => handlePresetBackend("https://ais-dev-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app")}
                          className={`px-3 py-1.5 rounded text-[10px] font-bold font-mono transition-all border-2 ${
                            getBackendUrl() === "https://ais-dev-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app"
                              ? "border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]"
                              : "border-zinc-850 bg-zinc-950 text-zinc-500 hover:text-white"
                          }`}
                        >
                          DEV: ais-dev (Cloud Run)
                        </button>
                        <button
                          onClick={() => handlePresetBackend("https://ais-pre-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app")}
                          className={`px-3 py-1.5 rounded text-[10px] font-bold font-mono transition-all border-2 ${
                            getBackendUrl() === "https://ais-pre-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app"
                              ? "border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]"
                              : "border-zinc-850 bg-zinc-950 text-zinc-500 hover:text-white"
                          }`}
                        >
                          PRE: ais-pre (Cloud Run)
                        </button>
                        {customBackendInput && (
                          <button
                            onClick={handleClearCustomBackend}
                            className="px-3 py-1.5 rounded text-[10px] font-bold bg-red-950/30 text-red-400 border-2 border-red-900/50 hover:bg-red-900 transition-all active:scale-95"
                          >
                            Reset To Auto (Auto-healing)
                          </button>
                        )}
                      </div>
                      <div className="bg-black/60 p-2.5 rounded border border-zinc-850 mt-2">
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Active Endpoint Origin:</div>
                        <div className="text-[11px] text-[#FFD700] font-mono break-all font-semibold select-all mt-1">{getActiveBackendUrl()}</div>
                      </div>
                    </div>
                  </div>
                  
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
      
      {/* Dynamic Top Marquee Slider */}
      <div className="bg-[#0A0A0A] border-b border-[#222] h-11 overflow-hidden select-none flex items-center relative z-40">
        <div className="absolute left-0 top-0 bottom-0 bg-[#FFD700] px-3.5 flex items-center text-black font-black uppercase italic tracking-wider text-[10px] sm:text-xs z-10 border-r border-[#FFD700]/40 shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
          <Trophy className="w-3.5 h-3.5 mr-1 text-black shrink-0 animate-bounce" />
          <span className="hidden xs:inline">GLOBAL </span>HIGH ROLLERS
        </div>
        
        {/* Continuous Scrolling Marquee Track */}
        <div className="flex-1 overflow-hidden relative flex items-center h-full pl-32 sm:pl-36">
          <div className="flex gap-4 sm:gap-6 whitespace-nowrap animate-infinite-scroll">
            {[...marqueeRiders, ...marqueeRiders].map((item, idx) => {
              const formattedAmount = item.winAmount.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              });
              
              return (
                <div 
                  key={`${item.id}-${idx}`} 
                  className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-zinc-300 font-bold px-2.5 py-1 bg-[#121212] border rounded-full transition-all hover:bg-zinc-900 border-[#1A1A1A] ${
                    item.isLive 
                      ? 'shadow-[0_0_8px_rgba(34,197,94,0.3)] border-green-500 bg-[#0E1A12]' 
                      : ''
                  }`}
                  title={`${item.displayName} from ${item.country}`}
                >
                  <span className="text-xs sm:text-sm shrink-0">{item.flag}</span>
                  <span className="text-zinc-500 font-bold text-[9px] sm:text-[10px]">{item.country}</span>
                  <span className={`font-black truncate max-w-[90px] ${item.isLive ? 'text-green-400' : 'text-zinc-100'}`}>{item.displayName}</span>
                  
                  {item.isLive && (
                    <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 text-[8px] font-black uppercase px-1 rounded border border-green-500/40 animate-pulse">
                      Live
                    </span>
                  )}

                  <span className="text-[#FFD700] font-black italic">{item.multiplier.toFixed(2)}x</span>
                  
                  <span className="text-emerald-400 font-mono font-black text-[10px] sm:text-[11px]">
                    {item.coin === 'INR' ? '₹' : item.coin === 'USD' || item.coin === 'USDT' ? '$' : `${item.coin} `}
                    {formattedAmount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Style Tag for Smooth Scrolling without complex setup */}
        <style>{`
          @keyframes infinite-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-infinite-scroll {
            display: flex;
            width: max-content;
            animation: infinite-scroll 320s linear infinite;
          }
          .animate-infinite-scroll:hover {
            animation-play-state: paused;
          }
        `}</style>
      </div>

      {/* Header Section */}
      <header className="flex items-center justify-between p-4 md:p-6 bg-gradient-to-r from-[#1A1A1A] to-[#0F0F0F] border-b border-[#333] sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-[#FFD700] rounded-full flex items-center justify-center text-black font-black text-xl md:text-2xl border-2 border-white shadow-[0_0_15px_rgba(255,215,0,0.4)]">B</div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2">
            Bullet Ride <span className="text-[#FFD700]">350</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          {/* Language Selector */}
          <div className="relative flex items-center">
            <select
              value={language}
              onChange={(e) => {
                const newLang = e.target.value;
                setLanguage(newLang);
                try {
                  localStorage.setItem('aviator_language', newLang);
                } catch (_) {}
              }}
              className="bg-black/40 border border-zinc-800 text-[11px] text-zinc-300 font-bold uppercase tracking-wider py-1 px-3.5 pr-8 rounded-lg focus:border-[#FFD700] hover:border-zinc-700 hover:text-white focus:outline-none transition-all cursor-pointer h-9 shrink-0 appearance-none text-center"
            >
              <option value="en" className="bg-zinc-950 text-white font-sans">🇬🇧 EN</option>
              <option value="hi" className="bg-zinc-950 text-white font-sans">🇮🇳 हिंदी</option>
              <option value="hinglish" className="bg-zinc-950 text-white font-sans">🗣️ HINGLISH</option>
              <option value="es" className="bg-zinc-950 text-white font-sans">🇪🇸 Español</option>
              <option value="pt" className="bg-zinc-950 text-white font-sans">🇧🇷 Português</option>
              <option value="ru" className="bg-zinc-950 text-white font-sans">🇷🇺 Русский</option>
              <option value="ar" className="bg-zinc-950 text-white font-sans">🇸🇦 العربية</option>
              <option value="fr" className="bg-zinc-950 text-white font-sans">🇫🇷 Français</option>
              <option value="zh" className="bg-zinc-950 text-white font-sans">🇨🇳 中文</option>
              <option value="de" className="bg-zinc-950 text-white font-sans">🇩🇪 Deutsch</option>
              <option value="tr" className="bg-zinc-950 text-white font-sans">🇹🇷 Türkçe</option>
              <option value="vi" className="bg-zinc-950 text-white font-sans">🇻🇳 Tiếng Việt</option>
              <option value="id" className="bg-zinc-950 text-white font-sans">🇮🇩 B. Indonesia</option>
              <option value="bn" className="bg-zinc-950 text-white font-sans">🇧🇩 বাংলা</option>
              <option value="pa" className="bg-zinc-950 text-white font-sans">🇮🇳 ਪੰਜਾਬੀ</option>
            </select>
            <div className="absolute right-2.5 pointer-events-none text-zinc-500 text-[9px]">
              ▼
            </div>
          </div>

          {/* Audio Sound Toggle */}
          <button 
            onClick={toggleSound}
            className="p-2 bg-black/40 border border-zinc-800 hover:border-[#FFD700]/50 hover:bg-black/80 text-zinc-400 hover:text-white transition-all rounded-lg cursor-pointer flex items-center justify-center h-9 w-9"
            title={isMuted ? "Unmute sounds" : "Mute sounds"}
          >
            {isMuted ? (
              <VolumeX className="w-4.5 h-4.5 text-red-500" />
            ) : (
              <Volume2 className="w-4.5 h-4.5 text-green-500" />
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 border-r border-zinc-800 pr-6">
                <div className="text-right leading-tight">
                  <p className="text-[10px] uppercase tracking-widest text-[#888]">{t.fuelBalance}</p>
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
                    <p className="text-xs font-black text-red-500 uppercase italic animate-pulse">{t.lowFuel}</p>
                  )}
                </div>
                <SearchableCoinDropdown coins={coins} activeCoin={activeCoin} onChange={handleCoinChange} />
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
              className="bg-[#1A1A1A] border-2 border-[#FFD700] rounded-3xl w-full max-w-lg relative z-10 shadow-[0_0_100px_rgba(255,215,0,0.15)] flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden"
            >
              {/* Sticky Top Header */}
              <div className="p-5 border-b border-zinc-800 bg-[#1A1A1A] flex justify-between items-center z-20 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black uppercase italic text-[#FFD700] tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#FFD700]" />
                    Aapka Profile
                  </span>
                </div>
                <button 
                  onClick={() => setIsProfileModalOpen(false)} 
                  className="px-3 py-1.5 bg-zinc-800 text-[#FFD700] hover:text-white font-black uppercase italic text-[10px] skew-x-[-12deg] border border-zinc-700 hover:bg-zinc-700 transition-all flex items-center gap-1 shrink-0"
                >
                  <span>← Back to Ride</span>
                </button>
              </div>

              {/* Scrollable central content area to fit any screen height */}
              <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                
                {/* User avatar and basic info */}
                <div className="flex items-center gap-4 bg-black/30 p-4 rounded-2xl border border-zinc-800/80">
                  <div className="w-14 h-14 rounded-2xl border-2 border-[#FFD700] overflow-hidden bg-zinc-800 shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-full h-full p-3.5 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {isEditingName ? (
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="text" 
                            className="bg-black border-2 border-red-500/80 text-white font-black uppercase text-xs rounded-xl px-3 py-1.5 outline-none focus:border-[#FFD700] w-full"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            maxLength={25}
                            disabled={isSavingName}
                            placeholder="Enter Name..."
                            autoFocus
                          />
                          <button 
                            onClick={handleUpdateDisplayName}
                            disabled={isSavingName || !editedName.trim()}
                            className="p-2 bg-[#FFD700] hover:bg-white text-black rounded-xl disabled:opacity-40 shrink-0 transition-all cursor-pointer flex items-center justify-center"
                            title="Save Name"
                          >
                            {isSavingName ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button 
                            onClick={() => {
                              setEditedName(user.displayName);
                              setIsEditingName(false);
                              setProfileNameError('');
                            }}
                            disabled={isSavingName}
                            className="p-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl shrink-0 transition-all cursor-pointer flex items-center justify-center"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {profileNameError && (
                          <p className="text-[9px] text-red-500 font-semibold uppercase tracking-wider">{profileNameError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 max-w-full">
                        <h3 className="text-xl font-black italic uppercase text-white tracking-tighter truncate flex-1 min-w-0">
                          {user.displayName}
                        </h3>
                        <button 
                          onClick={() => {
                            setEditedName(user.displayName || '');
                            setProfileNameError('');
                            setIsEditingName(true);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-[#FFD700] hover:bg-zinc-850/50 rounded-lg transition-all shrink-0 cursor-pointer flex items-center justify-center"
                          title="Edit Name"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest truncate">{user.email}</p>
                  </div>
                </div>

                {/* Balance & Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/40 border border-zinc-800 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Fuel Balance</p>
                    {coinBalances[activeCoin] > 0 ? (
                      <p className="text-lg font-mono text-[#FFD700] truncate">
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
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Rides</p>
                    <p className="text-lg font-mono text-white">{history.length}</p>
                  </div>
                  <div className="bg-[#1A1300] border border-[#FFD700]/30 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-[#FFD700]/70 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <span>Promo Bonus</span>
                      <span className="text-[#FFD700]">🎁</span>
                    </p>
                    <p className="text-lg font-mono text-[#FFD700] font-black">{bonusBalance} pts</p>
                  </div>
                  <div className={`p-4 rounded-2xl border ${hasDeposited ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-amber-950/20 border-amber-500/20'}`}>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Withdrawals</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${hasDeposited ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      <p className={`text-xs font-black uppercase italic ${hasDeposited ? 'text-emerald-400' : 'text-amber-500'}`}>
                        {hasDeposited ? "Unlocked 🔓" : "Locked 🔒"}
                      </p>
                    </div>
                    {!hasDeposited && (
                      <p className="text-[8px] text-amber-500/80 mt-1 leading-normal">First approved deposit unlocks withdrawals.</p>
                    )}
                  </div>
                </div>

                {/* Promo Code Redemption Section */}
                <div className="bg-[#121212]/90 border border-[#FFD700]/20 p-5 rounded-2xl space-y-3 shadow-inner">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-1.5 animate-pulse">
                      <Gift className="w-4 h-4 text-[#FFD700]" />
                      Got a Promo Code? (Bole toh Coupon!)
                    </h4>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Enter promo code (e.g. FREE500)" 
                      value={promoInput} 
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          redeemPromoCode();
                        }
                      }}
                      className="flex-1 bg-black/60 border border-zinc-850 text-[#FFD700] placeholder-zinc-600 font-mono text-xs rounded-xl px-3.5 py-3 outline-none tracking-widest focus:border-[#FFD700]/60 transition-colors uppercase font-bold"
                    />
                    <button 
                      onClick={redeemPromoCode}
                      disabled={isRedeemingPromo || !promoInput.trim()}
                      className="px-5 py-3 bg-gradient-to-r from-[#FFD700] to-yellow-500 hover:from-yellow-500 hover:to-[#FFD700] text-black font-black uppercase italic text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none hover:shadow-[0_0_15px_rgba(255,215,0,0.3)] duration-200"
                    >
                      {isRedeemingPromo ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                      ) : "Redeem"}
                    </button>
                  </div>
                  {promoMsg && (
                    <motion.p 
                      initial={{ opacity: 0, y: -5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className={`text-[10px] font-bold uppercase tracking-wider ${promoMsg.type === 'error' ? 'text-red-500' : 'text-green-400'}`}
                    >
                      {promoMsg.text}
                    </motion.p>
                  )}
                </div>

                {/* Referral Link & Dashboard Widget */}
                <div className="bg-[#121212]/90 border border-[#FFD700]/20 rounded-2xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Gift className="w-12 h-12 text-[#FFD700]" />
                  </div>
                  <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-2 mb-2">
                    <Gift className="w-4 h-4 text-[#FFD700]" />
                    Share & Earn Program
                  </h4>
                  <p className="text-[10px] text-zinc-400 leading-normal mb-3">
                    Sign up friends! When they register with your link:
                    <br />
                    <span className="text-[#FFD700] font-bold">• You get 500 bonus points</span>
                    <br />
                    <span className="text-[#FFD700] font-bold">• They get 1000 signup bonus points</span>
                  </p>
                  
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Your Referral Link</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/?ref=${user.uid}`}
                        className="flex-1 bg-black/60 border border-zinc-800 text-zinc-400 font-mono text-xs rounded-xl px-3 py-2 outline-none select-all"
                      />
                      <button 
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(`${window.location.origin}/?ref=${user.uid}`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          } catch (_) {}
                        }}
                        className="px-4 py-2 bg-[#FFD700] text-black font-black uppercase italic text-xs rounded-xl hover:bg-[#FFD700]/80 transition-all flex items-center gap-1 shrink-0"
                      >
                        {copied ? "Copied! ✓" : "Copy Link"}
                      </button>
                    </div>
                  </div>
                  {referredBy && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/50 flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-bold uppercase tracking-widest text-[9px]">Referred By UID</span>
                      <span className="font-mono text-zinc-400 bg-zinc-800/40 px-2 py-0.5 rounded-md truncate max-w-[200px]">{referredBy}</span>
                    </div>
                  )}
                </div>

                {/* Referral Earnings History Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-[#FFD700]" />
                      Referral Earnings History (Kamai Record)
                    </span>
                    {referralHistory.length > 0 && (
                      <span className="text-[10px] bg-[#FFD700]/10 text-[#FFD700] px-2 py-0.5 rounded-full font-mono font-bold">
                        {referralHistory.length} Refs
                      </span>
                    )}
                  </h4>
                  <div className="bg-black/40 border border-zinc-800 rounded-2xl overflow-hidden p-1.5">
                    {loadingReferralHistory ? (
                      <div className="p-6 text-center flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-[#FFD700]" />
                        <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Loading referral earnings...</p>
                      </div>
                    ) : referralHistory.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#1c1c1c] text-zinc-500 uppercase text-[9px] tracking-wider sticky top-0 z-10 rounded-lg">
                            <tr>
                              <th className="p-2.5">User</th>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5 text-right">Bonus (Pts)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 text-[11px]">
                            {referralHistory.map((item) => (
                              <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-2.5 font-bold text-zinc-300">
                                  <div className="text-zinc-200 truncate max-w-[140px] sm:max-w-xs">{item.newUserEmail || "Hidden / Anonymous"}</div>
                                  <div className="text-[9px] text-zinc-500 font-mono font-normal select-all">ID: {item.newUserId}</div>
                                </td>
                                <td className="p-2.5 font-mono text-zinc-400">{item.dateStr}</td>
                                <td className="p-2.5 font-mono font-black text-right text-yellow-400 italic">
                                  +{item.referrerBonus || 500}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center space-y-1">
                        <p className="text-zinc-500 text-xs italic">Koi referral kamai nahi hui hai abhi tak. 😔</p>
                        <p className="text-[#FFD700]/70 text-[10px] uppercase tracking-wider font-semibold">Share your link to earn 500 points per registration!</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 🎫 Live Support & Complaint Center / शिकायत केंद्र */}
                <div className="bg-zinc-950/90 border border-red-500/20 p-5 rounded-2xl space-y-4 shadow-xl relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/10 rounded-full blur-2xl"></div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-905">
                    <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                      <span>Shikayat & Live Chat Box (शिकायत केंद्र) 🎫</span>
                    </h4>
                    <span className="text-[8px] bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-red-900/30">
                      Rider Helpdesk
                    </span>
                  </div>

                  {/* Tabs Selector */}
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-zinc-850">
                    <button
                      onClick={() => setSupportTab('tickets')}
                      className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        supportTab === 'tickets'
                          ? 'bg-red-650 text-white shadow-lg shadow-red-950/20'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Shikayat / Tickets</span>
                    </button>
                    <button
                      onClick={() => setSupportTab('chat')}
                      className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        supportTab === 'chat'
                          ? 'bg-red-650 text-white shadow-lg shadow-red-950/20'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Direct Chat / चैट 💬</span>
                    </button>
                  </div>

                  {supportTab === 'tickets' ? (
                    <div className="space-y-4">
                      <p className="text-[11px] text-zinc-400 leading-normal bg-red-550/5 border border-red-500/10 p-3 rounded-xl">
                        ℹ️ <strong>Bhaiya, koi pareshani hai?</strong> Deposit fansa ho, withdrawal pending ho ya baki koi game related dikkat ho, toh apni shikayat niche enter karein. Hamare admin turant review karke reply karenge!
                      </p>

                      <div className="space-y-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Shikayat Category (शिकायत श्रेणी)</label>
                          <select 
                            value={complaintCategory}
                            onChange={(e) => setComplaintCategory(e.target.value)}
                            className="w-full bg-black border-2 border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-[#FFD700] cursor-pointer font-bold transition-all"
                          >
                            <option value="Deposit">💵 Deposit Issue (डिपॉजिट समस्या)</option>
                            <option value="Withdrawal">💸 Withdrawal Issue (निकासी समस्या)</option>
                            <option value="Game">🎮 Game/Crash Log (खेल/क्रैश समस्या)</option>
                            <option value="Other">❓ Other Support Query (अन्य सामान्य समस्या)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-zinc-505 uppercase font-bold tracking-wider">Describe your Issue (अपनी शिकायत लिखें)</label>
                          <textarea 
                            rows={3}
                            placeholder="Yahan apni shikayat likhein. Agar deposit ka problem hai, toh TXID ya Details zaroor dalo..."
                            value={complaintText}
                            onChange={(e) => setComplaintText(e.target.value)}
                            className="bg-black text-white text-xs border border-zinc-850 rounded-xl p-3 placeholder-zinc-650 outline-none focus:border-red-500 transition-colors resize-none leading-relaxed"
                          />
                        </div>

                        <button
                          onClick={submitComplaint}
                          disabled={isSubmittingComplaint || !complaintText.trim()}
                          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase italic text-xs rounded-xl tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none duration-150 hover:shadow-[0_0_15px_rgba(220,38,38,0.25)]"
                        >
                          {isSubmittingComplaint ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : "SUBMIT COMPLAINT / शिकायत भेजें 🚀"}
                        </button>

                        {complaintMsg && (
                          <motion.p 
                            initial={{ opacity: 0, y: -5 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            className={`text-[10px] font-bold uppercase tracking-wider text-center ${complaintMsg.type === 'error' ? 'text-red-550' : 'text-emerald-400'}`}
                          >
                            {complaintMsg.text}
                          </motion.p>
                        )}
                      </div>

                      {/* Previous Tickets / Submitted Complaints List */}
                      {myComplaints.length > 0 && (
                        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            <span>Your Tickets / आपकी शिकायतें ({myComplaints.length})</span>
                            <span className="text-zinc-655 font-normal">Real-time Sync</span>
                          </div>
                          
                          <div className="max-h-56 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                            {myComplaints.map((item) => (
                              <div key={item.id} className="bg-black/45 border border-zinc-850 p-3 rounded-xl space-y-2.5 text-[11px] hover:border-zinc-800 transition-colors">
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-[#FFD700] uppercase font-bold text-[8px] px-2 py-0.5 bg-[#FFD700]/10 rounded border border-[#FFD700]/20 font-mono">
                                    • {item.category}
                                  </span>
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                    item.status === 'resolved' 
                                      ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40' 
                                      : 'bg-yellow-950/20 text-yellow-500 border-yellow-900/30'
                                  }`}>
                                    {item.status === 'resolved' ? 'RESOLVED ✅' : 'PENDING ⏳'}
                                  </span>
                                </div>
                                <p className="text-zinc-200 font-sans leading-relaxed break-words">{item.message}</p>
                                
                                {item.adminReply ? (
                                  <div className="bg-emerald-950/15 border-l-2 border-emerald-500 p-2.5 rounded-r-lg space-y-1 mt-1">
                                    <p className="text-[9px] font-black uppercase italic text-emerald-400">Admin Reply / समाधान:</p>
                                    <p className="text-zinc-305 font-sans leading-relaxed break-words">{item.adminReply}</p>
                                  </div>
                                ) : (
                                  <p className="text-[8px] text-zinc-550 italic">⏳ Waiting for Admin review...</p>
                                )}

                                <div className="flex justify-between items-center text-[8px] pt-1 border-t border-zinc-900/60">
                                  <span className="text-zinc-600 font-mono">ID: {item.id}</span>
                                  <span className="text-zinc-505">
                                    {new Date(item.createdAt || Date.now()).toLocaleString('en-IN', { timeZone: 'IST' })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Direct Chat Tab
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider pb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span> Live Admin Chat (सीधा संपर्क)
                        </span>
                        <span className="text-zinc-60 font-mono text-[8px]">Real-time Sync Active</span>
                      </div>

                      {/* Chat Messages Log */}
                      <div className="min-h-[200px] max-h-[300px] overflow-y-auto bg-black/60 border border-zinc-850 p-3 rounded-xl space-y-3 custom-scrollbar flex flex-col">
                        {myChatMessages.length === 0 ? (
                          <div className="my-auto text-center p-6 space-y-2">
                            <p className="text-zinc-500 text-xs italic">👋 Bhaiya, seedha Admin se chat karein! Yahan apna message likh kar bhejein.</p>
                            <span className="inline-block text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-500 rounded px-2.5 py-1">Type your message below and press send.</span>
                          </div>
                        ) : (
                          myChatMessages.map((msg) => {
                            const isUser = msg.sender === 'user';
                            return (
                              <div
                                key={msg.id || msg.createdAt}
                                className={`flex flex-col max-w-[85%] ${
                                  isUser ? 'self-end items-end' : 'self-start items-start'
                                }`}
                              >
                                <span className="text-[8px] font-bold text-zinc-500 mb-0.5 px-1 font-mono">
                                  {isUser ? "You" : `Admin`}
                                </span>
                                <div
                                  className={`p-3 rounded-2xl text-xs leading-relaxed font-sans break-words ${
                                    isUser
                                      ? 'bg-red-650 text-white rounded-tr-none shadow-md shadow-red-950/10'
                                      : 'bg-zinc-900/90 text-zinc-100 border border-zinc-800 rounded-tl-none'
                                  }`}
                                >
                                  {msg.message}
                                </div>
                                <span className="text-[7.5px] text-zinc-600 mt-0.5 px-1 font-mono">
                                  {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Chat Input Field / Send Area */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={myChatText}
                          onChange={(e) => setMyChatText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              sendUserChatMessage();
                            }
                          }}
                          placeholder="Type your message / यहाँ लिखें..."
                          className="flex-1 bg-black text-white text-xs border border-zinc-850 rounded-xl px-3.5 py-3 outline-none focus:border-red-500 transition-colors"
                          disabled={isSendingChatMessage}
                        />
                        <button
                          onClick={sendUserChatMessage}
                          disabled={isSendingChatMessage || !myChatText.trim()}
                          className="px-4 bg-red-650 hover:bg-red-700 text-white rounded-xl transition-all flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.02] active:scale-[0.98] duration-150"
                        >
                          {isSendingChatMessage ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 text-white" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-black/40 border border-zinc-800 p-3 rounded-2xl flex justify-between items-center px-4">
                   <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest font-sans">User ID (UID)</p>
                   <p className="text-[9px] font-mono text-zinc-500 select-all">{user?.uid}</p>
                </div>

                {/* Ride History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase italic text-[#FFD700] tracking-widest flex items-center gap-2">
                    <History className="w-4 h-4" />
                    My Personal Ride History (Apni Bazi)
                  </h4>
                  <div className="bg-black/40 border border-zinc-800 rounded-2xl overflow-hidden">
                    {myGameHistory.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto pr-1">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#1c1c1c] text-zinc-500 uppercase text-[9px] tracking-wider sticky top-0 z-10">
                            <tr>
                              <th className="p-3">Time</th>
                              <th className="p-3">Bet</th>
                              <th className="p-3 text-center">Multiplier</th>
                              <th className="p-3 text-right">Profit / Loss</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 text-[11px]">
                             {myGameHistory.map((ride) => (
                               <tr key={ride.id} className="hover:bg-white/5 transition-colors">
                                 <td className="p-3 font-mono text-zinc-400">{ride.time}</td>
                                 <td className="p-3 font-mono text-zinc-300 font-bold">₹{ride.betAmount}</td>
                                 <td className="p-3 font-mono text-zinc-400 text-center">
                                   {ride.multiplier ? `${Number(ride.multiplier).toFixed(2)}x` : '1.00x'}
                                 </td>
                                 <td className={`p-3 font-black font-mono text-right italic ${ride.status === 'win' ? 'text-green-400' : 'text-red-500'}`}>
                                   {ride.status === 'win' ? `+₹${ride.winAmount}` : `-₹${ride.betAmount}`}
                                 </td>
                               </tr>
                             ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <p className="text-zinc-600 text-xs italic">Aapne abhi tak koi bazi nahi lagayi hai. Abhi start karein! 🏁</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sticky bottom Footer containing the home routing button */}
              <div className="p-5 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md flex flex-col sm:flex-row gap-2.5 z-20 shrink-0">
                <button 
                  onClick={() => setIsProfileModalOpen(false)} 
                  className="flex-1 py-3.5 bg-[#FFD700] text-black font-black uppercase italic rounded-2xl hover:bg-[#FFD700]/80 transition-all text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.15)] order-first sm:order-none"
                >
                  <span>Home Screen Par Jayein 🏠</span>
                </button>
                
                {user?.uid === "TUMHARI_ADMIN_UID" && (
                  <button 
                    onClick={() => { setIsProfileModalOpen(false); setShowAdmin(true); }}
                    className="py-3 px-4 bg-zinc-800 text-[#FFD700] font-black uppercase italic rounded-2xl hover:bg-zinc-700 transition-all border border-[#FFD700]/30 flex items-center justify-center gap-2 text-xs font-black"
                  >
                    <User className="w-4 h-4" />
                    Admin
                  </button>
                )}

                <button 
                  onClick={() => { setIsProfileModalOpen(false); signOut(auth); }}
                  className="py-3 px-4 bg-red-600/10 border border-red-600/20 text-red-500 font-black uppercase italic rounded-2xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-black"
                >
                  <LogOut className="w-4 h-4" />
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
              onClick={() => { setIsDepositModalOpen(false); }}
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
                <button onClick={() => { setIsDepositModalOpen(false); }} className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full">✕</button>
              </div>

              {!selectedCoin ? (
                <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4">
                  {coins.filter(c => c.isVisible).map((coin) => (
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
                (() => {
                  const freshCoin = coins.find(c => c.symbol === selectedCoin.symbol) || selectedCoin;
                  return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="flex items-center gap-4 bg-black/60 p-4 rounded-2xl border border-zinc-800">
                        <button onClick={() => setSelectedCoin(null)} className="text-[#FFD700] hover:underline text-xs font-bold uppercase italic">← Back</button>
                        <div className="w-1 h-8 bg-zinc-800" />
                        <div className="flex items-center gap-3">
                          <span className="font-black" style={{ color: freshCoin.color }}>{freshCoin.symbol}</span>
                          <span className="text-white font-bold">{freshCoin.name} Network</span>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-6 items-center">
                        <div className="w-40 h-40 bg-white p-2 rounded-lg shrink-0 flex items-center justify-center">
                          {freshCoin.address && freshCoin.address.length > 5 ? (
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(freshCoin.address)}`} 
                              alt="QR Code" 
                              referrerPolicy="no-referrer"
                              className="w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full border-4 border-black flex items-center justify-center text-black font-black text-[10px] text-center uppercase p-4 italic col-span-full">
                              SET ADDRESS IN ADMIN
                            </div>
                          )}
                        </div>
                        <div className="w-full space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-zinc-500">Deposit Amount ({freshCoin.symbol})</label>
                              <input 
                                type="number"
                                value={depositAmountInput}
                                onChange={(e) => setDepositAmountInput(e.target.value)}
                                className={`w-full bg-black border ${cryptoConfig[freshCoin.symbol] && parseFloat(depositAmountInput) < cryptoConfig[freshCoin.symbol].min ? 'border-red-500' : 'border-zinc-800'} p-3 text-white rounded outline-none focus:border-[#FFD700]`}
                                placeholder="Amount"
                                min={cryptoConfig[freshCoin.symbol]?.min || 0}
                                step="any"
                              />
                              {cryptoConfig[freshCoin.symbol] && (
                                <p className="text-[9px] text-zinc-500 font-bold uppercase">
                                  Min Deposit: {cryptoConfig[freshCoin.symbol].min} {freshCoin.symbol} (Conf: {cryptoConfig[freshCoin.symbol].conf})
                                </p>
                              )}
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
                              {freshCoin.address}
                              <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(freshCoin.address);
                                    showAdminStatus("Address Copied! ✅");
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
                  );
                })()
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
              onClick={() => { setIsWithdrawModalOpen(false); }}
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
                <button onClick={() => { setIsWithdrawModalOpen(false); }} className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full">✕</button>
              </div>

              {withdrawStep === 'coin' ? (
                <div className="space-y-4">
                   <p className="text-[10px] uppercase font-bold text-zinc-500">Select Withdrawal Coin</p>
                   <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                     {coins.filter(c => c.isVisible && c.symbol !== 'BTC').map((coin) => (
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
                        min={selectedCoin ? (cryptoLimits[selectedCoin.symbol]?.min || 0) : 0}
                        max={selectedCoin ? (cryptoLimits[selectedCoin.symbol]?.max || 999999) : 999999}
                        step="any"
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
                        onClick={() => { setIsWithdrawModalOpen(false); }}
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
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Side Panel: History */}
        <aside className="w-full md:w-72 border-r border-[#333] flex flex-col bg-[#141414] overflow-hidden shrink-0">
          {/* Real-time Tabs */}
          <div className="flex border-b border-[#333] bg-[#111]">
            <button 
              onClick={() => setHistoryTab('global')}
              className={`flex-1 py-3 text-[9px] sm:text-[10px] font-black uppercase italic transition-all flex items-center justify-center gap-1 border-b-2 ${
                historyTab === 'global' 
                  ? 'border-[#FFD700] text-[#FFD700] bg-black/40' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-400 hover:bg-[#181818]'
              }`}
            >
              <History className="w-3 h-3" />
              Pit Stops
            </button>
            <button 
              onClick={() => setHistoryTab('personal')}
              className={`flex-1 py-3 text-[9px] sm:text-[10px] font-black uppercase italic transition-all flex items-center justify-center gap-1 border-b-2 ${
                historyTab === 'personal' 
                  ? 'border-[#FFD700] text-[#FFD700] bg-black/40' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-400 hover:bg-[#181818]'
              }`}
            >
              <User className="w-3 h-3" />
              My Rides
            </button>
            <button 
              onClick={() => setHistoryTab('top')}
              className={`flex-1 py-3 text-[9px] sm:text-[10px] font-black uppercase italic transition-all flex items-center justify-center gap-1 border-b-2 ${
                historyTab === 'top' 
                  ? 'border-[#FFD700] text-[#FFD700] bg-black/40' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-400 hover:bg-[#181818]'
              }`}
            >
              <Trophy className="w-3 h-3 text-[#FFD700]" />
              Top Riders
            </button>
          </div>

          <div 
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y pr-2 scrollbar-thin scrollbar-thumb-zinc-800 p-4 h-[150px] md:h-full"
            onTouchStart={(e) => {
              // Allow scrolling only within this container
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
                e.stopPropagation();
            }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {historyTab === 'global' ? (
                <motion.div
                  key="global-history-list"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  {history.map((item) => (
                    <motion.div 
                      key={item.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className={`flex justify-between items-center p-3 mb-2 bg-[#1A1A1A] border-l-4 rounded-r shadow-sm transition-colors hover:bg-[#222] ${
                        item.multiplier > 2 ? 'border-green-500' : 'border-red-500'
                      }`}
                    >
                      <span className="text-xs text-gray-400 font-mono">{item.time}</span>
                      <span className={`text-lg font-black ${item.multiplier > 2 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.multiplier.toFixed(2)}x
                      </span>
                    </motion.div>
                  ))}
                  {history.length === 0 && !isHistoryLoading && (
                    <div className="text-center py-8 text-zinc-600 italic text-sm">Waiting for the engine to start...</div>
                  )}
                  {isHistoryLoading && (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-5 h-5 text-zinc-700 animate-spin" />
                    </div>
                  )}
                </motion.div>
              ) : historyTab === 'personal' ? (
                <motion.div
                  key="personal-history-list"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  {myGameHistory.map((item) => (
                    <motion.div 
                      key={item.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className={`flex flex-col p-3 mb-2.5 bg-[#1A1A1A] border-l-4 rounded-r shadow-md transition-colors hover:bg-[#222] ${
                        item.status === 'win' ? 'border-green-500' : 'border-red-500'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-zinc-500 font-mono font-semibold">{item.time}</span>
                        <span className={`text-[9px] font-black uppercase italic tracking-wider ${item.status === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                          {item.status === 'win' ? 'WON' : 'LOST'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-baseline">
                        <span className="text-zinc-400 text-[11px]">
                          Bet: <strong className="text-zinc-200 font-semibold font-mono">₹{item.betAmount}</strong>
                        </span>
                        <span className={`text-xs font-black font-mono tracking-tight ${item.status === 'win' ? 'text-green-400' : 'text-zinc-400'}`}>
                          {item.status === 'win' ? `+₹${item.winAmount}` : `-₹${item.betAmount}`}
                        </span>
                      </div>

                      <div className="flex justify-between text-[9px] text-zinc-500 mt-1 pb-0.5 border-t border-zinc-800/40 pt-1">
                        <span>Multiplier Exit</span>
                        <span className="font-mono text-zinc-300 font-bold">{item.multiplier ? Number(item.multiplier).toFixed(2) : '1.00'}x</span>
                      </div>
                    </motion.div>
                  ))}
                  {myGameHistory.length === 0 && !isMyHistoryLoading && (
                    <div className="text-center py-8 text-zinc-500 italic text-xs">
                      No rides completed yet! <br/>Place a bet to start.
                    </div>
                  )}
                  {isMyHistoryLoading && (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-5 h-5 text-zinc-700 animate-spin" />
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="top-riders-history-list"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2.5"
                >
                  <p className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1.5 border-b border-zinc-800 pb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[#FFD700]">🏆 Past 24 Hours</span>
                    <span className="text-zinc-500 font-mono text-[9px] normal-case font-normal">Sorted by Multiplier</span>
                  </p>
                  {topRiders.map((item, idx) => {
                    const isGold = idx === 0;
                    const isSilver = idx === 1;
                    const isBronze = idx === 2;
                    return (
                      <motion.div 
                        key={item.id}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className={`flex flex-col p-3 bg-[#1A1A1A] border-l-4 rounded-r shadow-md transition-colors hover:bg-[#222] ${
                          isGold 
                            ? 'border-[#FFD700]' 
                            : isSilver 
                              ? 'border-zinc-400' 
                              : isBronze 
                                ? 'border-amber-700' 
                                : 'border-zinc-800'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-zinc-200 font-black truncate max-w-[125px] flex items-center gap-1 leading-normal">
                            {isGold && <span className="text-sm shrink-0">🥇</span>}
                            {isSilver && <span className="text-sm shrink-0">🥈</span>}
                            {isBronze && <span className="text-sm shrink-0">🥉</span>}
                            {!isGold && !isSilver && !isBronze && <span className="text-[10px] text-zinc-500 font-mono font-bold shrink-0">#{idx + 1}</span>}
                            <span className="truncate">{item.displayName || 'Rider'}</span>
                          </span>
                          <span className="text-sm font-black text-[#FFD700] tracking-tight italic select-all font-mono">
                            {item.multiplier ? Number(item.multiplier).toFixed(2) : '1.00'}x
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-1 pb-0.5 pt-1 border-t border-zinc-800/40">
                          <span className="font-sans text-[10px] leading-none">
                            Payout: <strong className="text-emerald-400 font-mono font-black">
                              {item.coin === 'INR' ? '₹' : ''}
                              {Number(item.winAmount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                              {item.coin !== 'INR' ? ` ${item.coin}` : ''}
                            </strong>
                          </span>
                          <span className="text-[9px] text-zinc-600 font-mono shrink-0 leading-none">{item.time}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                  {topRiders.length === 0 && !loadingTopRiders && (
                    <div className="text-center py-8 text-zinc-600 italic text-xs">
                      No legendary rides recorded yet!<br/>Be the first to hit the list!
                    </div>
                  )}
                  {loadingTopRiders && (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-5 h-5 text-[#FFD700] animate-spin" />
                    </div>
                  )}
                </motion.div>
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
            {(() => {
              if (multiplierPoints.length === 0) return null;
              const lastPoint = multiplierPoints[multiplierPoints.length - 1];
              const lastX = lastPoint.x;
              const lastY = lastPoint.y;
              const maxXVal = Math.max(6, lastX);
              const maxYVal = Math.max(0.5, lastY - 1);
              
              const xBaseLast = (lastX / maxXVal) * 82;
              const yBaseLast = 95 - ((lastY - 1) / maxYVal) * 75;
              
              return (
                <div className="w-full h-full relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor={isCrashed ? "#EF4444" : "#FFD700"} stopOpacity="0" />
                        <stop offset="100%" stopColor={isCrashed ? "#EF4444" : "#FFD700"} stopOpacity="0.4" />
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    
                    {/* Grid lines and axes */}
                    <line x1="0" y1="95" x2="95" y2="95" stroke="#222" strokeWidth="0.5" />
                    <line x1="0" y1="20" x2="0" y2="95" stroke="#222" strokeWidth="0.5" />
                    
                    {/* Dynamic horizontal grid lines */}
                    {[0.25, 0.5, 0.75].map((ratio, index) => {
                      const yPos = 95 - ratio * 75;
                      const val = 1 + (maxYVal * ratio);
                      return (
                        <g key={index} className="opacity-40">
                          <line 
                             x1="0" 
                             y1={yPos} 
                             x2="95" 
                             y2={yPos} 
                             stroke="#444" 
                             strokeDasharray="2,3" 
                             strokeWidth="0.3" 
                          />
                          <text 
                             x="96" 
                             y={yPos + 1} 
                             fill="#FFD700" 
                             fontSize="2.5" 
                             fontWeight="bold"
                             className="font-mono text-[2.5px] fill-zinc-500"
                          >
                            {val.toFixed(2)}x
                          </text>
                        </g>
                      );
                    })}
                    
                    {multiplierPoints.length > 1 && (
                      <>
                        {/* The filled area below the curve */}
                        <motion.path
                          d={`M 0 95 L ${multiplierPoints.map((p) => {
                            const xBase = (p.x / maxXVal) * 82;
                            const yBase = 95 - ((p.y - 1) / maxYVal) * 75;
                            return `${xBase} ${yBase}`;
                          }).join(' L ')} L ${ xBaseLast } 95 Z`}
                          fill="url(#chartGradient)"
                          stroke="none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: isCrashed ? 0.3 : 1 }}
                        />
                        
                        {/* The main golden/red line */}
                        <motion.path
                          d={`M 0 95 L ${multiplierPoints.map((p) => {
                            const xBase = (p.x / maxXVal) * 82;
                            const yBase = 95 - ((p.y - 1) / maxYVal) * 75;
                            return `${xBase} ${yBase}`;
                          }).join(' L ')}`}
                          fill="none"
                          stroke={isCrashed ? "#EF4444" : "#FFD700"}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          filter="url(#glow)"
                        />
                      </>
                    )}
                  </svg>
                  
                  {/* The Bike Icon following the path */}
                  {isPlaying && !isCrashed && (
                    <motion.div 
                      style={{
                        position: 'absolute',
                        left: `${xBaseLast}%`,
                        top: `${yBaseLast}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 20
                      }}
                      className="transition-all duration-75 ease-linear"
                    >
                      <div className="relative">
                         {/* Floating Multiplier Badge */}
                         <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#FFD700]/90 backdrop-blur-md text-black px-4 py-1.5 rounded-full font-black text-sm shadow-[0_0_20px_rgba(255,215,0,0.6)] border-2 border-white/20 pointer-events-none whitespace-nowrap flex items-center gap-1.5">
                           <span className="text-lg">🏍️</span>
                           <span className="tabular-nums tracking-tighter">{lastY.toFixed(2)}x</span>
                         </div>
                      
                         {/* Bike Tilt Effect based on growth speed */}
                         <motion.div
                          animate={{ 
                              rotate: [-5, -15, -5],
                              y: [0, -6, 0]
                          }}
                          transition={{ 
                              duration: 0.3, 
                              repeat: Infinity,
                              ease: "easeInOut"
                          }}
                         >
                          <Bike className="w-14 h-14 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] filter brightness-125" />
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
              );
            })()}
          </div>
 
          <motion.div 
            className="text-center z-10 select-none bg-black/20 p-6 md:p-8 rounded-2xl backdrop-blur-sm border border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.6)]"
            animate={multiplier > 5 && isPlaying ? {
                scale: [1, 1.02, 1],
                rotate: [0, 0.5, -0.5, 0]
            } : {}}
            transition={{ repeat: Infinity, duration: 0.1 }}
          >
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#FFD700]/60 mb-1 font-black flex items-center justify-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 animate-pulse" /> CURRENT THUMP
            </p>
            <div className={`text-6xl md:text-8xl font-black leading-none italic tracking-tighter transition-all duration-300 tabular-nums ${isCrashed ? 'text-red-500' : (isPlaying && hasCashedOut) ? 'text-green-500' : isPlaying ? 'text-white' : 'text-zinc-500'}`}>
              {multiplier.toFixed(2)}<span className="text-2xl md:text-3xl align-top ml-0.5 text-[#FFD700]">x</span>
            </div>
            <div className={`mt-4 inline-block px-6 py-2 border transition-all duration-300 ${
              isCrashed ? 'border-red-600 text-red-500 bg-red-600/10' : hasCashedOut ? 'border-green-500 text-green-500 bg-green-500/10' : isPlaying ? 'border-[#FFD700] text-[#FFD700] bg-[#FFD700]/10' : 'border-zinc-800 text-zinc-500'
            } text-lg md:text-xl font-black uppercase tracking-widest skew-x-[-10deg]`}>
              {isCrashed ? t.statusCrashed : hasCashedOut ? t.successfulExit : isPlaying ? t.ridingHard : (globalStatus === 'WAITING' ? t.readyInGarage : t.connecting)}
            </div>
            
            {globalStatus === 'WAITING' && (
              <div className="mt-6 relative h-1.5 w-48 bg-zinc-800 rounded-full overflow-hidden mx-auto border border-white/5">
                <motion.div 
                   key={globalRoundIdRef.current}
                   initial={{ width: '100%' }}
                   animate={{ width: `${(globalCountdown / 8) * 100}%` }}
                   transition={{ duration: 1, ease: 'linear' }}
                   className="h-full bg-[#FFD700] shadow-[0_0_8px_#FFD700]"
                />
                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black uppercase text-white mix-blend-difference tracking-tighter">
                  Next Thump in {globalCountdown}s
                </div>
              </div>
            )}
            
            <div className="mt-3 flex items-center justify-center gap-1.5">
               <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
               <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600 italic">Global Sync Active</span>
            </div>
            
            {error && (
              <p className="text-red-500 font-bold mt-3 uppercase tracking-wider text-xs">{error}</p>
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
                    <ShieldAlert className="w-6 h-6" /> {t.statusCrashed || "CRASHED!"}
                  </h3>
                  <p className="text-lg italic font-serif leading-tight">"{getTranslatedCrashReason(crashReason || "", language)}"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Centered Large Cashout Success / Win Popup (Prominent Overlay) */}
          <AnimatePresence>
            {winPopup && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  transition: { type: "spring", stiffness: 300, damping: 22 }
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center bg-black/75 z-40 p-4 pointer-events-auto"
              >
                <div className="bg-[#15803D] border-4 border-[#FFD700] rounded-2xl p-6 sm:p-8 text-center max-w-[90vw] w-[350px] sm:w-[380px] shadow-[0_0_50px_rgba(34,197,94,0.6)] relative flex flex-col items-center">
                  
                  {/* Fire gradients */}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#16A34A]/20 to-transparent pointer-events-none rounded-2xl animate-pulse" />

                  {/* Badges/Trophy icons */}
                  <div className="absolute -top-10 text-5xl animate-bounce">🏆</div>
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-2xl animate-pulse">🎉</div>
                  <div className="absolute -right-3 top-1/2 -translate-y-1/2 text-2xl animate-pulse">🎉</div>

                  {/* Header text */}
                  <div className="bg-black/40 px-3.5 py-1.5 rounded-full border border-yellow-300/40 text-yellow-300 text-[10px] sm:text-xs font-black uppercase tracking-widest mb-3 flex items-center justify-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-[#FFD700] shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                    <span>
                      {language === 'hi' ? 'बधाई हो - आप जीत गए!' : language === 'hinglish' ? 'CONGRATULATIONS - YOU WIN!' : 'CONGRATULATIONS - YOU WON!'}
                    </span>
                  </div>

                  {/* Multiplier achieved */}
                  <div className="text-[#FFD700] font-mono font-black italic text-xl sm:text-2xl mt-1 tracking-tight">
                    {winPopup.multiplier.toFixed(2)}x <span className="text-white text-xs not-italic font-normal">MULTIPLIER</span>
                  </div>

                  {/* Label */}
                  <div className="text-zinc-200 font-bold uppercase tracking-widest text-[9px] sm:text-[10px] mt-4 mb-1">
                    {language === 'hi' ? 'कुल जीत की राशि' : 'TOTAL WINNING AMOUNT'}
                  </div>
                  
                  {/* Large Shiny amount */}
                  <div className="flex flex-col items-center">
                    <div className="text-white font-mono font-black text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-white to-yellow-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] select-all leading-tight">
                      {winPopup.coin === 'INR' ? '₹' : ''}
                      {winPopup.amount.toLocaleString(undefined, { 
                        minimumFractionDigits: winPopup.coin === 'INR' ? 2 : Math.min(4, cryptoConfig[winPopup.coin]?.decimals || 4), 
                        maximumFractionDigits: winPopup.coin === 'INR' ? 2 : (cryptoConfig[winPopup.coin]?.decimals || 8)
                      })}
                      {winPopup.coin !== 'INR' ? ` ${winPopup.coin}` : ''}
                    </div>
                    {winPopup.coin !== 'INR' && rates[winPopup.coin] && (
                      <div className="text-xs sm:text-sm text-yellow-300 font-bold font-mono tracking-tight bg-black/30 px-3 py-0.5 rounded-full mt-1.5 border border-yellow-300/10 flex items-center gap-1 shadow-sm">
                        <span>≈</span>
                        <span>{calculateFiatValue(winPopup.amount, winPopup.coin, rates)}</span>
                      </div>
                    )}
                  </div>

                  {/* Fuel Added Message */}
                  <p className="text-[10px] text-emerald-100 font-bold tracking-wide italic flex items-center justify-center gap-1.5 bg-black/20 py-2 px-3 rounded-lg w-full mt-4">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse shrink-0" />
                    {language === 'hi' ? 'बैलेंस आपके वॉलेट में जोड़ दिया गया है! ⛽' : language === 'hinglish' ? 'Fuel balance successfully add ho gaya! ⛽' : 'FUEL BALANCE ADDED SUCCESSFULLY! ⛽'}
                  </p>

                  {/* Button to quickly keep playing */}
                  <button 
                    onClick={() => setWinPopup(null)}
                    className="mt-5 w-full bg-yellow-400 hover:bg-yellow-350 active:scale-95 text-black font-black uppercase tracking-wider text-xs py-2.5 px-6 rounded-lg transition-all shadow-[0_4px_12px_rgba(255,215,0,0.3)] border-b-4 border-yellow-600 hover:border-yellow-700 active:border-b-0 cursor-pointer"
                  >
                    {language === 'hi' ? 'सवारी जारी रखें 🏍️' : language === 'hinglish' ? 'RIDE CHALU RAKHO 🏍️' : 'KEEP RIDING 🏍️'}
                  </button>

                  {/* absolute dismiss X button */}
                  <button
                    onClick={() => setWinPopup(null)}
                    className="absolute top-3 right-3 text-white/50 hover:text-white transition-all p-1 bg-black/20 hover:bg-black/40 rounded-full cursor-pointer z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
        <aside className="w-full md:w-80 bg-[#1A1A1A] p-6 flex flex-col gap-6 border-l border-[#333] max-h-screen overflow-y-auto">
          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <label className="text-[10px] uppercase font-bold text-[#888]">Riding Stake</label>
              <div className="text-[10px] font-mono text-zinc-400">
                {activeCoin !== 'INR' && rates[activeCoin] ? `≈ ${calculateFiatValue(betAmount, activeCoin, rates)}` : ''}
              </div>
            </div>
            <div className="relative">
              <input 
                type="number" 
                value={formatBetAmount(betAmount, activeCoin)} 
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setBetAmount(val);
                }}
                step={activeCoin === 'BTC' ? '0.000001' : '0.01'}
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
                  2x
                </button>
              </div>
            </div>
            
            <button 
                onClick={startRound}
                className="w-full py-4 mt-4 bg-[#FFD700] text-black font-black uppercase italic hover:bg-white transition-all shadow-[0_10px_30px_rgba(255,215,0,0.2)]"
            >
                {t.placeBet} {formatBetAmount(betAmount, activeCoin)} {activeCoin}
            </button>
            
            <div className="flex justify-between items-center bg-black border-2 border-[#333] p-3 rounded mt-2">
              <span className="text-[10px] uppercase font-bold text-[#888]">{t.autoPlay} (Auto-Bet)</span>
              <button 
                onClick={toggleAutoPlay}
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

            <div className="flex justify-between items-center bg-black border-2 border-[#333] p-3 rounded mt-2">
              <span className="text-[10px] uppercase font-bold text-[#888]">{t.autoExit} (Auto Cash Out)</span>
              <button 
                onClick={() => setIsAutoExit(!isAutoExit)}
                className={`w-12 h-6 flex items-center rounded-full px-1 transition-colors ${isAutoExit ? 'bg-green-600' : 'bg-zinc-800'}`}
              >
                <motion.div 
                  layout
                  className="w-4 h-4 bg-white rounded-full shadow"
                  animate={{ x: isAutoExit ? 24 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>

            {isAutoExit && (
              <div className="space-y-1.5 mt-2 transition-all">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] uppercase font-bold text-[#FFD700]">Target Exit Multiplier</label>
                  <span className="text-[9px] text-[#888]">Min: 1.01x / Max: 100x</span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1"
                    min="1.01"
                    max="100"
                    value={autoExitValue} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setAutoExitValue(isNaN(val) ? 1.01 : val);
                    }}
                    className="w-full bg-black border-2 border-[#FFD700]/30 p-4 text-2xl font-mono text-white focus:border-[#FFD700] outline-none" 
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#FFD700] font-mono text-lg font-black">X</span>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={() => {
              if (!user) {
                setShowAuthModal(true);
                return;
              }

              // Evaluate limits only if we are NOT performing a cash out action
              const isCashOutAction = isPlaying && hasActiveBet && !hasCashedOut;
              if (!isCashOutAction) {
                const coinConfig = cryptoConfig[activeCoin];
                if (coinConfig) {
                  if (betAmount < coinConfig.min) {
                    setError(language === 'hi' ? `न्यूनतम दांव ${coinConfig.min} ${activeCoin} है।` : language === 'hinglish' ? `Minimum bet limit ${coinConfig.min} ${activeCoin} hai bhae.` : `Minimum bet is ${coinConfig.min} ${activeCoin}.`);
                    setTimeout(() => setError(null), 3500);
                    return;
                  }
                  if (betAmount > coinConfig.maxBet) {
                    setError(language === 'hi' ? `अधिकतम दांव ${coinConfig.maxBet} ${activeCoin} है।` : language === 'hinglish' ? `Maximum bet limit ${coinConfig.maxBet} ${activeCoin} hai bhae.` : `Maximum bet is ${coinConfig.maxBet} ${activeCoin}.`);
                    setTimeout(() => setError(null), 3500);
                    return;
                  }
                }
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
                // Countdown (WAITING) or CRASHED state
                if (globalStatus === 'WAITING') {
                  if (hasActiveBet) {
                    // Cancel current active bet & refund immediately
                    const b = betAmount;
                    setHasActiveBet(false);
                    updateUserBalance(user.uid, coinBalances[activeCoin] + b, activeCoin);
                    setWithdrawableBalance(prev => prev + b);
                    cancelActiveBetValue(user.uid, globalRoundIdRef.current);
                  } else {
                    // Place direct active bet right now
                    const b = betAmount;
                    if (coinBalances[activeCoin] < b) {
                      setError("Bas kar bhai! Balance low hai.");
                      setTimeout(() => setError(null), 3000);
                      return;
                    }
                    setHasActiveBet(true);
                    updateUserBalance(user.uid, coinBalances[activeCoin] - b, activeCoin);
                    setWithdrawableBalance(prev => Math.max(0, prev - b));
                    registerActiveBetValue(user.uid, globalRoundIdRef.current, b, activeCoin);
                  }
                } else {
                  // CRASHED state, toggle next-round queue
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
              }
            }}
            disabled={(isPlaying && hasActiveBet && hasCashedOut) || loading}
            className={`mt-auto w-full py-8 transition-all shadow-xl active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden relative ${
              (isPlaying && hasActiveBet && !hasCashedOut) || (globalStatus === 'WAITING' && hasActiveBet)
                ? 'bg-red-600 hover:bg-red-500 text-white' 
                : isBetQueued 
                  ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse' 
                  : 'bg-[#FFD700] hover:bg-white text-black'
            }`}
          >
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out" />
            <span className={`relative text-3xl font-black uppercase tracking-tighter ${
              (isPlaying && hasActiveBet && !hasCashedOut) || (globalStatus === 'WAITING' && hasActiveBet) || isBetQueued ? 'text-white' : 'text-black'
            }`}>
              {isPlaying && hasActiveBet && !hasCashedOut 
                ? t.cashOut 
                : (globalStatus === 'WAITING' && hasActiveBet)
                  ? `CANCEL`
                  : (isPlaying && hasActiveBet && hasCashedOut) 
                    ? t.successfulExit 
                    : isBetQueued 
                      ? `CANCEL` 
                      : isPlaying 
                        ? t.queuedForNext 
                        : `${t.placeBet} ${formatBetAmount(betAmount, activeCoin)} ${activeCoin}`}
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

