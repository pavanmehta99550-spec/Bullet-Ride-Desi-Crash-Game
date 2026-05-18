import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, Lock, Chrome, Loader2, X, AlertCircle, 
  UserPlus, LogIn, ChevronRight, CheckCircle2, User 
} from 'lucide-react';
import { 
  auth, googleProvider 
} from '../lib/firebase';
import { 
  signInWithPopup, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, updateProfile 
} from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      console.error("Full Error Object:", err);
      setError(`Login failed: ${err.message}`);
      alert(`🔴 LOGIN FAILED!\nError Code: ${err.code}\nMessage: ${err.message}`);
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
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError("Auth failed. Check console.");
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
                  {mode === 'login' ? 'Welcome Back' : 'Join the Ride'}
                </h3>
                <p className="text-zinc-500 text-[10px] md:text-xs mt-1 uppercase tracking-widest font-bold">
                  {mode === 'login' ? 'Sign in to fuel up' : 'Create your racing profile'}
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
              {error && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-6 p-4 bg-red-600/10 border border-red-600/20 rounded-xl flex items-center gap-3 text-red-500 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}

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

              <div className="relative my-8">
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
