import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, Lock, Chrome, Loader2, X, AlertCircle, 
  UserPlus, LogIn, ChevronRight, CheckCircle2, User,
  HelpCircle
} from 'lucide-react';
import { 
  auth, googleProvider, firebaseConfig, db
} from '../lib/firebase';
import { 
  signInWithPopup, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGuestLogin?: (guestUser: any) => void;
}

export default function AuthModal({ isOpen, onClose, onGuestLogin }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDomainError, setIsDomainError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await sendPasswordResetEmail(auth, forgotPasswordEmail);
      setSuccess("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      setError(`Failed to send reset email: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoOrGuestLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to sign in or sign up with a predefined credential first
      const demoEmail = 'guest.rider@thump.com';
      const demoPass = 'thump12345';
      
      try {
        await signInWithEmailAndPassword(auth, demoEmail, demoPass);
        onClose();
        return;
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
            await updateProfile(userCredential.user, { displayName: "Super Rider 🏍️" });
            onClose();
            return;
          } catch (signUpErr: any) {
            console.warn("Demo credentials sign-up failed, falling back to local guest session", signUpErr);
          }
        } else {
          console.warn("Demo credentials sign-in failed, falling back to local guest session", signInErr);
        }
      }
      
      // Direct local guest fallback
      if (onGuestLogin) {
        onGuestLogin({
          uid: 'guest_rider_local_session',
          email: 'guest.rider@thump.local',
          displayName: 'Local Guest Rider 🏍️',
          isAnonymous: true,
          photoURL: null
        });
        onClose();
      } else {
        setError("Bypass guest handler is not available.");
      }
    } catch (err: any) {
      setError(`Guest Login Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setIsDomainError(false);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      console.error("Full Error Object:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setIsDomainError(true);
        setError(`Domain Authorization Error: Under security guidelines, this dynamic preview URL is not authorized by your Firebase Project settings.`);
      } else {
        setError(`Login failed: ${err.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        // Manually create/update user doc with our name to avoid syncUserProfile race condition
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: name,
            walletBalance: 0,
            coinBalances: { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0, LTC: 0, TRX: 0, BNB: 0, XRP: 0, MATIC: 0, TON: 0, ADA: 0, BCH: 0, DASH: 0, DGB: 0, FEY: 0, LINK: 0, DOT: 0 },
            activeCoin: 'INR',
            bonus_balance: 0,
            has_deposited: false,
            referralCode: userCredential.user.uid,
            createdAt: Date.now(),
        }, { merge: true });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Invalid email or password. If you don't have an account, click 'Signup Now' below.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(`Auth failed: ${err.message || "Check console."}`);
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div 
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className="bg-[#1A1A1A] border-2 border-[#FFD700]/30 rounded-3xl w-full max-w-md relative z-10 shadow-[0_0_100px_rgba(255,215,0,0.1)] overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#FFD700]/10 blur-[80px] -z-10" />

            <div className="p-6 md:p-8 border-b border-zinc-800/50 flex justify-between items-start">
              <div>
                <h3 className="text-2xl md:text-3xl font-black italic uppercase text-[#FFD700]">
                  {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Join the Ride' : 'Reset Password'}
                </h3>
                <p className="text-zinc-500 text-[10px] md:text-xs mt-1 uppercase tracking-widest font-bold">
                  {mode === 'login' ? 'Sign in to fuel up' : mode === 'signup' ? 'Create your racing profile' : 'Recover your account'}
                </p>
              </div>
              <button 
                onClick={onClose} 
                className="text-zinc-500 hover:text-white bg-zinc-800/50 p-2 rounded-full transition-colors hover:bg-zinc-700"
                id="close-auth-modal"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
              {success && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-6 p-4 bg-emerald-600/10 border border-emerald-600/20 rounded-xl flex items-center gap-3 text-emerald-500 text-sm"
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p>{success}</p>
                </motion.div>
              )}
              {error && !isDomainError && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-6 p-4 bg-red-600/10 border border-red-600/20 rounded-xl flex items-center gap-3 text-red-500 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}

              {isDomainError && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-6 p-5 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl text-amber-200 text-xs leading-relaxed space-y-4"
                >
                  <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider">
                    <AlertCircle className="w-5 h-5 text-amber-400 animate-pulse shrink-0" />
                    <span>Firebase Auth: Domain Error ⚠️</span>
                  </div>
                  
                  <p className="text-zinc-300">
                    यह एरर इसलिए आ रहा है क्योंकि Firebase Google Sign-In आपके इस नए डोमेन को नहीं पहचानता है।
                  </p>

                  <div className="bg-black/50 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Your Domain URL</span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="bg-zinc-900 px-2 py-1.5 rounded text-white font-mono text-[11px] block select-all break-all flex-1">
                        {window.location.hostname}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.hostname);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="bg-[#FFD700] hover:bg-white text-black px-3 py-1.5 rounded-xl font-black uppercase text-[10px] transition-colors shrink-0"
                      >
                        {copied ? "Copied! ✅" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-zinc-400 text-[11px] list-none">
                    <span className="font-bold text-zinc-350">इसे ठीक करने के 2 रास्ते (2 Solutions):</span>
                    <div className="flex items-start gap-1">
                      <span className="text-amber-500 font-bold">1.</span>
                      <span>Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains में जाकर ऊपर वाले URL को जोड़ें।</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-emerald-500 font-bold">2.</span>
                      <span className="text-[#FFD700] font-black">बिना किसी झंझट के तुरंत खेलने के लिए नीचे दिए गए 'Instant Guest Rider' लाल बटन पर क्लिक करें!</span>
                    </div>
                  </div>
                </motion.div>
              )}

{mode !== 'forgot-password' ? (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Hero Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input 
                        type="text" 
                        placeholder="e.g. Rahul Rider"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full bg-black/40 border border-zinc-800 p-4 pl-12 text-white rounded-2xl outline-none focus:border-[#FFD700] transition-colors font-medium text-sm md:text-base"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Email ID</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input 
                      type="email" 
                      placeholder="rider@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-black/40 border border-zinc-800 p-4 pl-12 text-white rounded-2xl outline-none focus:border-[#FFD700] transition-colors font-medium text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input 
                      type="password" 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-black/40 border border-zinc-800 p-4 pl-12 text-white rounded-2xl outline-none focus:border-[#FFD700] transition-colors font-medium text-sm md:text-base"
                    />
                  </div>
                  {mode === 'login' && (
                    <button 
                      type="button"
                      onClick={() => {
                        setMode('forgot-password');
                        setError(null);
                        setSuccess(null);
                      }}
                      className="text-[10px] text-zinc-500 hover:text-[#FFD700] font-bold uppercase transition-colors ml-1"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-[#FFD700] text-black font-black uppercase italic rounded-2xl hover:bg-white transition-all shadow-[0_10px_30px_rgba(255,215,0,0.15)] flex items-center justify-center gap-2 group mt-4 h-14 md:h-16"
                  id="email-auth-submit"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                      <span>{mode === 'login' ? 'Sign In Now' : 'Create Account'}</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
                </form>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">Email ID</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input 
                        type="email" 
                        placeholder="rider@example.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        required
                        className="w-full bg-black/40 border border-zinc-800 p-4 pl-12 text-white rounded-2xl outline-none focus:border-[#FFD700] transition-colors font-medium text-sm md:text-base"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-[#FFD700] text-black font-black uppercase italic rounded-2xl hover:bg-white transition-all shadow-[0_10px_30px_rgba(255,215,0,0.15)] flex items-center justify-center gap-2 group mt-4 h-14 md:h-16"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Reset Password</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccess(null);
                    }}
                    className="w-full py-3 text-zinc-600 hover:text-zinc-400 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    Back to Login
                  </button>
                </form>
              )}

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#1A1A1A] px-4 text-zinc-500 font-black tracking-[0.2em]">OR FAST ACCESS</span></div>
              </div>

              <button 
                onClick={handleDemoOrGuestLogin}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-500 text-white font-black uppercase italic rounded-2xl hover:brightness-110 transition-all shadow-[0_10px_30px_rgba(239,68,68,0.25)] flex items-center justify-center gap-3 h-14 md:h-16 border border-red-500/20"
                id="guest-login-btn"
              >
                <span className="text-xl animate-bounce">🏍️</span>
                <span>Instant Guest Rider (One-Click)</span>
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#1A1A1A] px-4 text-zinc-500 font-black tracking-[0.2em]">OR FUEL WITH</span></div>
              </div>

              <button 
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-4 bg-white/5 border border-zinc-800 text-white font-bold rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 group h-14 md:h-16"
                id="google-signin-btn"
              >
                <Chrome className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                <span>Continue with Google</span>
              </button>

              <div className="mt-8 text-center text-zinc-500 text-xs font-bold uppercase tracking-wider pb-4">
                {mode === 'login' ? (
                  <p>
                    Don't have an account? {' '}
                    <button 
                      onClick={() => setMode('signup')}
                      className="text-[#FFD700] hover:underline"
                      id="switch-to-signup"
                    >
                      Signup Now
                    </button>
                  </p>
                ) : (
                  <p>
                    Already a rider? {' '}
                    <button 
                      onClick={() => setMode('login')}
                      className="text-[#FFD700] hover:underline"
                      id="switch-to-login"
                    >
                      Login Now
                    </button>
                  </p>
                )}
              </div>

              <button 
                onClick={onClose}
                className="w-full mt-4 py-3 text-zinc-600 hover:text-zinc-400 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-3 h-3" />
                <span>Maybe Later / Exit</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
