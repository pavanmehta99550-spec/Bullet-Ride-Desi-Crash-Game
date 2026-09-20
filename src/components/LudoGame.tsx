import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Volume2, VolumeX, ArrowLeft, Trophy, RotateCcw, 
  Swords, Users, Sparkles, MessageCircle, Smile, 
  Check, ShieldAlert, Coins, HelpCircle, X
} from 'lucide-react';
import { 
  LudoColor, LudoToken, COLOR_CONFIG, TRACK_CELLS, 
  SAFE_TRACK_INDICES, HOME_RUN_CELLS, BASE_TOKEN_COORDS, 
  CENTER_GOAL, STEP_IN_YARD, STEP_START, STEP_HOME_RUN_START, 
  STEP_GOAL, getTokenCoord, canTokenMove, calculateNextStep, 
  getGlobalTrackIndex, GridCoord 
} from '../lib/ludoLogic';
import { ludoAudio } from '../lib/ludoAudio';

interface LudoGameProps {
  user: any;
  activeCoin: string;
  balance: number;
  rates: Record<string, number>;
  onUpdateBalance: (userId: string, newBalance: number, coin: string) => void;
  onBackToBulletRide: () => void;
  isSoundMuted?: boolean;
}

type GameMode = 'vs_ai' | 'pass_and_play_2p' | 'pass_and_play_4p';
type MatchType = 'quick' | 'classic'; // quick = 1 token to home wins; classic = 4 tokens to home

const AI_BOTS = [
  { name: 'Surma Bhopali', avatar: '👳', level: 'Lv.42' },
  { name: 'Chulbul Pandey', avatar: '🤠', level: 'Lv.35' },
  { name: 'Gabbar Singh', avatar: '🦁', level: 'Lv.50' },
  { name: 'Munna Bhaiya', avatar: '👑', level: 'Lv.28' }
];

const LUDO_KING_EMOJIS = ['😂', '😡', '😭', '😎', '👑', '🎲', '👍', '🔥'];
const LUDO_KING_CHATS = [
  "Roll 6 please! 🎲",
  "Oh no! 😱",
  "Well played! 👏",
  "Hurry up! ⏳",
  "Katti ho gayi! ⚔️",
  "Thanks! 😊"
];

export default function LudoGame({
  user,
  activeCoin,
  balance,
  rates,
  onUpdateBalance,
  onBackToBulletRide,
  isSoundMuted = false
}: LudoGameProps) {
  // Game Setup
  const [gameMode, setGameMode] = useState<GameMode>('vs_ai');
  const [matchType, setMatchType] = useState<MatchType>('quick');
  const [selectedStake, setSelectedStake] = useState<number>(() => activeCoin === 'INR' ? 50 : 1);
  const [isMuted, setIsMuted] = useState(isSoundMuted);
  const [selectedAi, setSelectedAi] = useState(AI_BOTS[0]);
  const [chessPieceType, setChessPieceType] = useState<'knight' | 'pawn' | 'king'>('knight');

  // Turn & Dice States
  const [activeTurn, setActiveTurn] = useState<LudoColor>('red');
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [canRoll, setCanRoll] = useState(true);
  const [consecutiveSixes, setConsecutiveSixes] = useState(0);
  const [activeColors, setActiveColors] = useState<LudoColor[]>(['red', 'green']);
  const [tokens, setTokens] = useState<LudoToken[]>(() => initTokens(['red', 'green']));
  const [movableTokenIds, setMovableTokenIds] = useState<number[]>([]);

  // Feedback & Social
  const [commentary, setCommentary] = useState<string>("Welcome to Ludo King! Red rolls first.");
  const [winner, setWinner] = useState<LudoColor | null>(null);
  const [winPrize, setWinPrize] = useState<number>(0);
  const [showChakkaAnimation, setShowChakkaAnimation] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState<{ sender: LudoColor; text: string } | null>(null);
  const [timerProgress, setTimerProgress] = useState(100);

  // Turn timer interval
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    ludoAudio.setMuted(isMuted);
  }, [isMuted]);

  function initTokens(colors: LudoColor[]): LudoToken[] {
    const list: LudoToken[] = [];
    colors.forEach(col => {
      for (let i = 0; i < 4; i++) {
        list.push({ id: i, color: col, step: STEP_IN_YARD });
      }
    });
    return list;
  }

  // Quick Stake chips
  const stakeOptions = useMemo(() => {
    if (activeCoin === 'INR') return [0, 20, 50, 100, 250, 500, 1000];
    return [0, 0.5, 1, 2, 5, 10, 25];
  }, [activeCoin]);

  // Turn Timer countdown (like Ludo King's circular green/yellow bar)
  useEffect(() => {
    if (winner) return;
    setTimerProgress(100);
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);

    const startTime = Date.now();
    const duration = 15000; // 15 seconds per turn

    turnTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rem = Math.max(0, 100 - (elapsed / duration) * 100);
      setTimerProgress(rem);

      if (rem <= 0) {
        if (turnTimerRef.current) clearInterval(turnTimerRef.current);
        // If human timed out and can roll, auto-roll or forfeit
        if (canRoll) {
          handleRollDice();
        } else if (movableTokenIds.length > 0) {
          // Auto move first movable token
          const currentTokens = tokens.filter(t => t.color === activeTurn);
          const firstMovable = currentTokens.find(t => movableTokenIds.includes(t.id));
          if (firstMovable && diceRoll) {
            moveToken(firstMovable, diceRoll);
          }
        }
      }
    }, 100);

    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [activeTurn, canRoll, diceRoll, winner]);

  // Start / Restart match
  const handleStartGame = (mode?: GameMode) => {
    const nextMode = mode || gameMode;
    if (selectedStake > 0 && balance < selectedStake) {
      alert(`Low balance! Please deposit or select free mode.`);
      return;
    }

    if (user && selectedStake > 0) {
      const newBal = Math.max(0, balance - selectedStake);
      onUpdateBalance(user.uid, newBal, activeCoin);
    }

    let colors: LudoColor[] = ['red', 'green'];
    if (nextMode === 'pass_and_play_4p') {
      colors = ['red', 'green', 'yellow', 'blue'];
    }

    setActiveColors(colors);
    setTokens(initTokens(colors));
    setActiveTurn('red');
    setDiceRoll(null);
    setIsRolling(false);
    setCanRoll(true);
    setMovableTokenIds([]);
    setWinner(null);
    setWinPrize(0);
    setConsecutiveSixes(0);
    setCommentary(`Match started! Roll the dice.`);
  };

  // Roll Dice
  const handleRollDice = (forColor?: LudoColor) => {
    // If a specific color tapped its dice, check if it's their turn
    if (forColor && forColor !== activeTurn) return;
    if (!canRoll || isRolling || winner) return;

    setIsRolling(true);
    setCanRoll(false);
    setMovableTokenIds([]);
    ludoAudio.playDiceRoll();

    setTimeout(() => {
      // 1 to 6
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceRoll(roll);
      setIsRolling(false);

      if (roll === 6) {
        ludoAudio.playChakkaSix();
        setShowChakkaAnimation(true);
        setTimeout(() => setShowChakkaAnimation(false), 1500);

        const nextSixes = consecutiveSixes + 1;
        setConsecutiveSixes(nextSixes);
        if (nextSixes >= 3) {
          setCommentary(`3 Sixes in a row! Turn forfeited! ❌`);
          setConsecutiveSixes(0);
          setTimeout(() => nextTurn(), 1200);
          return;
        }
      } else {
        setConsecutiveSixes(0);
      }

      // Check movable tokens
      const currentTokens = tokens.filter(t => t.color === activeTurn);
      const eligible = currentTokens.filter(t => canTokenMove(t, roll));

      if (eligible.length === 0) {
        setCommentary(`No moves possible for ${COLOR_CONFIG[activeTurn].name}.`);
        setTimeout(() => nextTurn(), 1000);
      } else if (eligible.length === 1 && (activeTurn !== 'red' || (gameMode === 'vs_ai' && activeTurn !== 'red'))) {
        // Auto move single token for bot or smooth play
        setTimeout(() => moveToken(eligible[0], roll), 600);
      } else {
        setMovableTokenIds(eligible.map(t => t.id));
        setCommentary(`${COLOR_CONFIG[activeTurn].name}, select a token to move!`);

        // AI decision if bot turn
        if (gameMode === 'vs_ai' && activeTurn !== 'red') {
          setTimeout(() => {
            const chosen = chooseBestAiToken(eligible, roll);
            moveToken(chosen, roll);
          }, 800);
        }
      }
    }, 600);
  };

  // AI strategy
  const chooseBestAiToken = (eligible: LudoToken[], roll: number): LudoToken => {
    // 1. Capture priority
    for (const t of eligible) {
      const nextStep = calculateNextStep(t, roll);
      if (nextStep >= STEP_START && nextStep <= 50) {
        const targetTrackIdx = getGlobalTrackIndex(t.color, nextStep);
        if (targetTrackIdx !== null && !SAFE_TRACK_INDICES.has(targetTrackIdx)) {
          const victim = tokens.find(other => 
            other.color !== t.color && 
            other.step >= STEP_START && other.step <= 50 &&
            getGlobalTrackIndex(other.color, other.step) === targetTrackIdx
          );
          if (victim) return t;
        }
      }
    }
    // 2. Open out on 6
    if (roll === 6) {
      const yard = eligible.find(t => t.step === STEP_IN_YARD);
      if (yard) return yard;
    }
    // 3. Enter Home Goal
    const goal = eligible.find(t => calculateNextStep(t, roll) === STEP_GOAL);
    if (goal) return goal;
    // 4. Advance farthest token
    return eligible.sort((a, b) => b.step - a.step)[0];
  };

  // Move token
  const moveToken = (token: LudoToken, roll: number) => {
    setMovableTokenIds([]);
    const nextStep = calculateNextStep(token, roll);
    ludoAudio.playTokenHop();

    let bonusRoll = (roll === 6);
    let capturedVictim: LudoToken | null = null;

    if (nextStep >= STEP_START && nextStep <= 50) {
      const destTrackIdx = getGlobalTrackIndex(token.color, nextStep);
      if (destTrackIdx !== null && !SAFE_TRACK_INDICES.has(destTrackIdx)) {
        const victim = tokens.find(other => 
          other.color !== token.color && 
          other.step >= STEP_START && other.step <= 50 &&
          getGlobalTrackIndex(other.color, other.step) === destTrackIdx
        );
        if (victim) {
          capturedVictim = victim;
          bonusRoll = true;
        }
      }
    }

    if (nextStep === STEP_GOAL) {
      ludoAudio.playHomeGoal();
      bonusRoll = true;
    }

    setTokens(prev => {
      return prev.map(t => {
        if (t.color === token.color && t.id === token.id) {
          return { ...t, step: nextStep };
        }
        if (capturedVictim && t.color === capturedVictim.color && t.id === capturedVictim.id) {
          return { ...t, step: STEP_IN_YARD };
        }
        return t;
      });
    });

    if (capturedVictim) {
      ludoAudio.playCaptureKatti();
      setCommentary(`💥 KATTI! ${COLOR_CONFIG[token.color].name} knocked out ${COLOR_CONFIG[capturedVictim.color].name}!`);
    }

    setTimeout(() => {
      const isWon = checkWinner(token.color, nextStep);
      if (isWon) return;

      if (bonusRoll) {
        setCanRoll(true);
        setCommentary(`🔥 Bonus roll for ${COLOR_CONFIG[token.color].name}! Roll again.`);
        if (gameMode === 'vs_ai' && activeTurn !== 'red') {
          setTimeout(() => handleRollDice(), 900);
        }
      } else {
        nextTurn();
      }
    }, 400);
  };

  // Check winner
  const checkWinner = (color: LudoColor, latestStep: number): boolean => {
    const playerTokens = tokens.map(t => (t.color === color && t.step === latestStep ? { ...t, step: latestStep } : t)).filter(t => t.color === color);
    const homeCount = playerTokens.filter(t => t.step === STEP_GOAL).length;

    const hasWon = matchType === 'quick' ? homeCount >= 1 : homeCount >= 4;

    if (hasWon) {
      setWinner(color);
      setCanRoll(false);
      ludoAudio.playVictory();

      const prize = selectedStake > 0 ? parseFloat((selectedStake * 1.9).toFixed(2)) : 0;
      setWinPrize(prize);

      if (color === 'red' && user && prize > 0) {
        const newBal = parseFloat((balance + prize).toFixed(8));
        onUpdateBalance(user.uid, newBal, activeCoin);
      }

      setCommentary(`🏆 ${COLOR_CONFIG[color].name} WON THE MATCH!`);
      return true;
    }
    return false;
  };

  // Next turn
  const nextTurn = () => {
    const currentIndex = activeColors.indexOf(activeTurn);
    const nextIndex = (currentIndex + 1) % activeColors.length;
    const nextColor = activeColors[nextIndex];
    setActiveTurn(nextColor);
    setDiceRoll(null);
    setCanRoll(true);
    setMovableTokenIds([]);
    setConsecutiveSixes(0);

    setCommentary(`${COLOR_CONFIG[nextColor].name}'s turn to roll.`);

    if (gameMode === 'vs_ai' && nextColor !== 'red') {
      setTimeout(() => handleRollDice(), 1000);
    }
  };

  // Send Chat / Reaction
  const handleSendReaction = (text: string) => {
    setFloatingReaction({ sender: 'red', text });
    setShowChatModal(false);
    setTimeout(() => setFloatingReaction(null), 3500);

    // If vs AI, let AI occasionally respond
    if (gameMode === 'vs_ai') {
      setTimeout(() => {
        const aiReplies = ["😎 Bring it on!", "🎲 Watch my next 6!", "😂 No way!", "🔥 Game on!"];
        const randomReply = aiReplies[Math.floor(Math.random() * aiReplies.length)];
        setFloatingReaction({ sender: 'green', text: randomReply });
        setTimeout(() => setFloatingReaction(null), 3000);
      }, 1500);
    }
  };

  // Render Corner Profile Card with Dice (The signature Ludo King Corner Box)
  const renderPlayerCornerCard = (color: LudoColor) => {
    const isPresent = activeColors.includes(color);
    if (!isPresent) return null;

    const isActive = activeTurn === color;
    const cfg = COLOR_CONFIG[color];
    const isHuman = color === 'red' || (gameMode !== 'vs_ai' && isPresent);
    const avatar = color === 'red' ? (user?.photoURL ? user.photoURL : '👑') : (gameMode === 'vs_ai' ? selectedAi.avatar : '👤');
    const name = color === 'red' ? (user?.displayName || 'You') : (gameMode === 'vs_ai' ? selectedAi.name : cfg.name);

    return (
      <div className="relative flex flex-col items-center">
        {/* Floating Chat Bubble */}
        <AnimatePresence>
          {floatingReaction && floatingReaction.sender === color && (
            <motion.div
              initial={{ scale: 0, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: -15, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute -top-10 z-50 bg-white text-black px-3 py-1 rounded-full text-xs font-black shadow-2xl border-2 border-amber-400 whitespace-nowrap flex items-center gap-1 animate-bounce"
            >
              <span>{floatingReaction.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ludo King Style Avatar Pod with Timer Ring */}
        <div className={`flex items-center gap-2 p-1.5 rounded-2xl transition-all ${
          isActive 
            ? 'bg-black/60 shadow-[0_0_15px_rgba(255,215,0,0.5)] ring-2 ring-[#FFD700]' 
            : 'bg-black/30 opacity-75'
        }`}>
          {/* Circular Avatar with Circular Timer Ring */}
          <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center shrink-0">
            {/* SVG Circular Timer Ring */}
            {isActive && (
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 44 44">
                <circle 
                  cx="22" cy="22" r="19" 
                  className="text-zinc-800" 
                  strokeWidth="3" 
                  stroke="currentColor" 
                  fill="transparent" 
                />
                <circle 
                  cx="22" cy="22" r="19" 
                  className={timerProgress < 30 ? "text-red-500" : "text-[#10B981]"} 
                  strokeWidth="3" 
                  strokeDasharray={119.38} 
                  strokeDashoffset={119.38 - (119.38 * timerProgress) / 100} 
                  strokeLinecap="round" 
                  stroke="currentColor" 
                  fill="transparent" 
                />
              </svg>
            )}

            {/* Profile Picture */}
            <div 
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden flex items-center justify-center text-lg border-2"
              style={{ borderColor: cfg.hex, backgroundColor: cfg.baseBg }}
            >
              {typeof avatar === 'string' && avatar.startsWith('http') ? (
                <img src={avatar} alt="pfp" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span>{avatar}</span>
              )}
            </div>

            {/* Color Badge indicator */}
            <div 
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-white flex items-center justify-center shadow"
              style={{ backgroundColor: cfg.hex }}
            />
          </div>

          {/* Player Info & Personal Dice */}
          <div className="flex flex-col min-w-0 pr-1">
            <span className="text-[11px] sm:text-xs font-black text-white truncate max-w-[85px] sm:max-w-[110px] leading-tight">
              {name}
            </span>
            <span className="text-[9px] font-bold text-zinc-400 font-mono">
              {cfg.hindiName}
            </span>
          </div>

          {/* Corner Interactive Dice (Exact Ludo King Placement) */}
          <div 
            onClick={() => isActive && isHuman && handleRollDice(color)}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-white via-amber-50 to-amber-100 border-2 border-[#FFD700] shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center relative select-none transition-all ${
              isActive && isHuman && canRoll
                ? 'cursor-pointer hover:scale-105 active:scale-95 ring-2 ring-emerald-400 animate-pulse'
                : isActive && isRolling
                  ? 'animate-spin'
                  : 'opacity-90'
            }`}
            title={isActive && isHuman ? "Tap to Roll Dice" : undefined}
          >
            {renderDiceFace(isActive ? (diceRoll || 6) : 6)}

            {/* Ludo King Turn Callout Text */}
            {isActive && isHuman && canRoll && !isRolling && (
              <div className="absolute -bottom-4 bg-emerald-500 text-black text-[8px] font-black uppercase px-1 rounded shadow-md whitespace-nowrap">
                ROLL
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-[#102A43] via-[#0B1D3A] to-[#061224] text-white flex flex-col items-center select-none pb-8 relative overflow-x-hidden font-sans">
      
      {/* Top Ludo King Header Bar */}
      <div className="w-full max-w-5xl px-3 sm:px-4 py-2.5 flex items-center justify-between z-30 sticky top-0 bg-[#07172B]/90 backdrop-blur-md border-b border-[#1E3A5F] shadow-lg">
        {/* Back button */}
        <button
          onClick={onBackToBulletRide}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-black uppercase tracking-wider shadow border border-red-400/40 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Bullet Ride</span>
        </button>

        {/* Central Ludo King Prize Pot Medallion */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700]/20 via-[#FFA500]/20 to-[#FFD700]/20 border-2 border-[#FFD700] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.3)]">
          <Trophy className="w-4 h-4 text-[#FFD700]" />
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[9px] uppercase font-black tracking-widest text-[#FFD700]">LUDO KING POT</span>
            <span className="text-xs sm:text-sm font-mono font-black text-white">
              {(selectedStake > 0 ? (selectedStake * 1.9).toFixed(2) : 'FREE')} <span className="text-[#FFD700]">{activeCoin}</span>
            </span>
          </div>
        </div>

        {/* Right Tools: Chat & Sound */}
        <div className="flex items-center gap-2">
          {/* Chat / Emojis Button */}
          <button
            onClick={() => setShowChatModal(true)}
            className="p-2 rounded-xl bg-[#1E3A5F] hover:bg-[#2A4D7C] text-amber-300 border border-amber-400/30 shadow transition-colors relative cursor-pointer"
            title="Send Emoji / Chat"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-[#1E3A5F] hover:bg-[#2A4D7C] text-zinc-200 border border-zinc-600 shadow transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Arena Table */}
      <div className="w-full max-w-4xl px-2 sm:px-4 py-2 flex flex-col items-center">
        
        {/* Commentary Ticker */}
        <div className="w-full max-w-[480px] mb-2 px-3 py-1.5 bg-[#07172B]/80 border border-[#1E3A5F] rounded-xl flex items-center justify-between text-xs text-zinc-200 shadow">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-bold truncate">{commentary}</span>
          </div>
          <span className="text-[10px] font-mono text-[#FFD700] uppercase font-bold shrink-0">
            {matchType === 'quick' ? '⚡ 1 Goal' : '🏆 4 Goals'}
          </span>
        </div>

        {/* Top 2 Player Corner Boxes: Red (Top-Left) & Green (Top-Right) */}
        <div className="w-full max-w-[480px] flex items-center justify-between px-1 mb-1.5">
          {renderPlayerCornerCard('red')}
          {renderPlayerCornerCard('green')}
        </div>

        {/* Authentic Ludo King 15x15 Board */}
        <div className="relative w-full aspect-square max-w-[480px] bg-[#E2D4B7] p-2.5 rounded-2xl border-[6px] border-[#9A6B38] shadow-[0_15px_40px_rgba(0,0,0,0.8),inset_0_2px_10px_rgba(0,0,0,0.4)] select-none">
          
          {/* Ludo King Inner Board */}
          <div className="relative w-full h-full grid grid-cols-15 grid-rows-15 bg-white rounded-lg overflow-hidden border-2 border-[#2B2B2B] shadow-inner">
            
            {/* 1. RED BASE (Top-Left 6x6) */}
            <div className="col-span-6 row-span-6 bg-[#E52521] p-2 sm:p-2.5 border-r-2 border-b-2 border-[#2B2B2B] flex items-center justify-center shadow-inner">
              {/* White Inner Box with Rounded Corners (Iconic Ludo King style) */}
              <div className="w-full h-full bg-white rounded-2xl border-2 border-red-700/40 p-2 flex items-center justify-center shadow">
                {/* 4 Colored Circular Token Pedestals */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(slotIdx => {
                    const tokenInSlot = tokens.find(t => t.color === 'red' && t.id === slotIdx && t.step === STEP_IN_YARD);
                    const isMovable = !!(tokenInSlot && movableTokenIds.includes(tokenInSlot.id));
                    return (
                      <div 
                        key={slotIdx}
                        onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#E52521] border-2 border-white/80 shadow-md flex items-center justify-center relative ${
                          isMovable ? 'ring-4 ring-amber-400 cursor-pointer animate-bounce' : ''
                        }`}
                      >
                        {tokenInSlot && renderLudoKingPawn('red', isMovable)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. TOP ARM (Cols 6,7,8 Rows 0..5) - Green Home Path */}
            <div className="col-span-3 row-span-6 grid grid-cols-3 grid-rows-6 border-b-2 border-[#2B2B2B]">
              {renderBoardArmCells(0, 5, 6, 8, 'green')}
            </div>

            {/* 3. GREEN BASE (Top-Right 6x6) */}
            <div className="col-span-6 row-span-6 bg-[#00A651] p-2 sm:p-2.5 border-l-2 border-b-2 border-[#2B2B2B] flex items-center justify-center shadow-inner">
              <div className="w-full h-full bg-white rounded-2xl border-2 border-emerald-700/40 p-2 flex items-center justify-center shadow">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(slotIdx => {
                    const tokenInSlot = tokens.find(t => t.color === 'green' && t.id === slotIdx && t.step === STEP_IN_YARD);
                    const isMovable = !!(tokenInSlot && activeTurn === 'green' && movableTokenIds.includes(tokenInSlot.id));
                    return (
                      <div 
                        key={slotIdx}
                        onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#00A651] border-2 border-white/80 shadow-md flex items-center justify-center relative ${
                          isMovable ? 'ring-4 ring-amber-400 cursor-pointer animate-bounce' : ''
                        }`}
                      >
                        {tokenInSlot && renderLudoKingPawn('green', isMovable)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. LEFT ARM (Rows 6,7,8 Cols 0..5) - Red Home Path */}
            <div className="col-span-6 row-span-3 grid grid-cols-6 grid-rows-3 border-r-2 border-[#2B2B2B]">
              {renderBoardArmCells(6, 8, 0, 5, 'red')}
            </div>

            {/* 5. CENTER HOME TRIANGLE (3x3 Rows 6..8, Cols 6..8) */}
            <div className="col-span-3 row-span-3 relative border border-[#2B2B2B] overflow-hidden bg-white">
              {/* 4 Colored Triangles Meeting in Center */}
              <svg className="w-full h-full absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Red Triangle (Left) */}
                <polygon points="0,0 50,50 0,100" fill="#E52521" />
                {/* Green Triangle (Top) */}
                <polygon points="0,0 50,50 100,0" fill="#00A651" />
                {/* Yellow Triangle (Right) */}
                <polygon points="100,0 50,50 100,100" fill="#FFC000" />
                {/* Blue Triangle (Bottom) */}
                <polygon points="0,100 50,50 100,100" fill="#0070BA" />
              </svg>

              {/* Central Trophy Medallion */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-[#FFD700] to-[#E6A100] border border-white flex items-center justify-center shadow-lg">
                  <Trophy className="w-4 h-4 text-amber-950 drop-shadow" />
                </div>
              </div>

              {/* Tokens Reached Goal */}
              {tokens.filter(t => t.step === STEP_GOAL).map(t => (
                <div 
                  key={`goal-${t.color}-${t.id}`}
                  className="absolute z-20 w-4 h-4 rounded-full border border-white flex items-center justify-center text-[8px] font-black text-white shadow-lg"
                  style={{
                    backgroundColor: COLOR_CONFIG[t.color].hex,
                    top: t.color === 'green' ? '18%' : t.color === 'blue' ? '68%' : '44%',
                    left: t.color === 'red' ? '18%' : t.color === 'yellow' ? '68%' : '44%'
                  }}
                >
                  ✓
                </div>
              ))}
            </div>

            {/* 6. RIGHT ARM (Rows 6,7,8 Cols 9..14) - Yellow Home Path */}
            <div className="col-span-6 row-span-3 grid grid-cols-6 grid-rows-3 border-l-2 border-[#2B2B2B]">
              {renderBoardArmCells(6, 8, 9, 14, 'yellow')}
            </div>

            {/* 7. BLUE BASE (Bottom-Left 6x6) */}
            <div className="col-span-6 row-span-6 bg-[#0070BA] p-2 sm:p-2.5 border-r-2 border-t-2 border-[#2B2B2B] flex items-center justify-center shadow-inner">
              <div className="w-full h-full bg-white rounded-2xl border-2 border-blue-700/40 p-2 flex items-center justify-center shadow">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(slotIdx => {
                    const tokenInSlot = tokens.find(t => t.color === 'blue' && t.id === slotIdx && t.step === STEP_IN_YARD);
                    const isMovable = !!(tokenInSlot && activeTurn === 'blue' && movableTokenIds.includes(tokenInSlot.id));
                    return (
                      <div 
                        key={slotIdx}
                        onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#0070BA] border-2 border-white/80 shadow-md flex items-center justify-center relative ${
                          isMovable ? 'ring-4 ring-amber-400 cursor-pointer animate-bounce' : ''
                        }`}
                      >
                        {tokenInSlot && renderLudoKingPawn('blue', isMovable)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 8. BOTTOM ARM (Cols 6,7,8 Rows 9..14) - Blue Home Path */}
            <div className="col-span-3 row-span-6 grid grid-cols-3 grid-rows-6 border-t-2 border-[#2B2B2B]">
              {renderBoardArmCells(9, 14, 6, 8, 'blue')}
            </div>

            {/* 9. YELLOW BASE (Bottom-Right 6x6) */}
            <div className="col-span-6 row-span-6 bg-[#FFC000] p-2 sm:p-2.5 border-l-2 border-t-2 border-[#2B2B2B] flex items-center justify-center shadow-inner">
              <div className="w-full h-full bg-white rounded-2xl border-2 border-amber-600/40 p-2 flex items-center justify-center shadow">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(slotIdx => {
                    const tokenInSlot = tokens.find(t => t.color === 'yellow' && t.id === slotIdx && t.step === STEP_IN_YARD);
                    const isMovable = !!(tokenInSlot && activeTurn === 'yellow' && movableTokenIds.includes(tokenInSlot.id));
                    return (
                      <div 
                        key={slotIdx}
                        onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#FFC000] border-2 border-white/80 shadow-md flex items-center justify-center relative ${
                          isMovable ? 'ring-4 ring-amber-400 cursor-pointer animate-bounce' : ''
                        }`}
                      >
                        {tokenInSlot && renderLudoKingPawn('yellow', isMovable)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          {/* Chakka 6 Celebration Overlay */}
          <AnimatePresence>
            {showChakkaAnimation && (
              <motion.div
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                exit={{ scale: 1.3, opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 bg-black/40 rounded-2xl backdrop-blur-[1px]"
              >
                <div className="text-4xl sm:text-5xl font-black italic tracking-tighter text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.9)] animate-pulse">
                  🔥 CHAKKA 6! 🎲
                </div>
                <span className="text-xs font-black uppercase text-white bg-red-600 px-3 py-0.5 rounded-full mt-1 shadow-lg">
                  Bonus Roll Granted!
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom 2 Player Corner Boxes: Blue (Bottom-Left) & Yellow (Bottom-Right) if 4-player */}
        {activeColors.length > 2 && (
          <div className="w-full max-w-[480px] flex items-center justify-between px-1 mt-1.5">
            {renderPlayerCornerCard('blue')}
            {renderPlayerCornerCard('yellow')}
          </div>
        )}

        {/* Bottom Quick Controls & Stake Settings Bar */}
        <div className="w-full max-w-[480px] mt-3 bg-[#07172B] border border-[#1E3A5F] rounded-2xl p-3 shadow-xl flex flex-col gap-2.5">
          
          {/* Mode & Speed Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setGameMode('vs_ai'); handleStartGame('vs_ai'); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                  gameMode === 'vs_ai' ? 'bg-[#FFD700] text-black shadow' : 'bg-[#1E3A5F] text-zinc-300'
                }`}
              >
                ⚔️ Vs AI
              </button>
              <button
                onClick={() => { setGameMode('pass_and_play_2p'); handleStartGame('pass_and_play_2p'); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                  gameMode === 'pass_and_play_2p' ? 'bg-[#FFD700] text-black shadow' : 'bg-[#1E3A5F] text-zinc-300'
                }`}
              >
                👥 2P Pass
              </button>
              <button
                onClick={() => { setGameMode('pass_and_play_4p'); handleStartGame('pass_and_play_4p'); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                  gameMode === 'pass_and_play_4p' ? 'bg-[#FFD700] text-black shadow' : 'bg-[#1E3A5F] text-zinc-300'
                }`}
              >
                👑 4P Pass
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMatchType('quick')}
                className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${
                  matchType === 'quick' ? 'bg-emerald-500 text-black' : 'bg-[#1E3A5F] text-zinc-400'
                }`}
              >
                1 Goal Win
              </button>
              <button
                onClick={() => setMatchType('classic')}
                className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${
                  matchType === 'classic' ? 'bg-emerald-500 text-black' : 'bg-[#1E3A5F] text-zinc-400'
                }`}
              >
                4 Goals Win
              </button>
            </div>
          </div>

          {/* Stake selector chips */}
          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#1E3A5F]/80">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Stake:</span>
            <div className="flex gap-1 overflow-x-auto py-0.5">
              {stakeOptions.map(amount => (
                <button
                  key={amount}
                  onClick={() => setSelectedStake(amount)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                    selectedStake === amount 
                      ? 'bg-[#FFD700] text-black shadow' 
                      : 'bg-[#1E3A5F] text-zinc-300 hover:text-white'
                  }`}
                >
                  {amount === 0 ? 'Free' : `${amount}`}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleStartGame()}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase rounded-md shadow shrink-0 cursor-pointer"
            >
              Restart
            </button>
          </div>

          {/* Chess Pieces (शतरंज गोटियाँ) Style Selector */}
          <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-[#1E3A5F]/80">
            <span className="text-[10px] font-black text-amber-300 uppercase flex items-center gap-1">
              <span>♟️ Goti Style:</span>
            </span>
            <div className="flex items-center gap-1 bg-[#09182B] p-0.5 rounded-lg border border-[#1E3A5F]">
              <button
                onClick={() => setChessPieceType('knight')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer ${
                  chessPieceType === 'knight' 
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black shadow-md' 
                    : 'text-zinc-300 hover:text-white'
                }`}
                title="Chess Knight / Horse Piece"
              >
                <span>♞ Horse (घोड़ा)</span>
              </button>
              <button
                onClick={() => setChessPieceType('pawn')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer ${
                  chessPieceType === 'pawn' 
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black shadow-md' 
                    : 'text-zinc-300 hover:text-white'
                }`}
                title="Chess Pawn / Pyada Piece"
              >
                <span>♟️ Pawn (प्यादा)</span>
              </button>
              <button
                onClick={() => setChessPieceType('king')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer ${
                  chessPieceType === 'king' 
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black shadow-md' 
                    : 'text-zinc-300 hover:text-white'
                }`}
                title="Chess King / Raja Piece"
              >
                <span>♚ King (राजा)</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Ludo King Emoji & Chat Drawer Modal */}
      <AnimatePresence>
        {showChatModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="w-full max-w-xs bg-[#0F2238] border-2 border-amber-400 rounded-3xl p-4 shadow-2xl flex flex-col gap-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-zinc-700">
                <span className="text-xs font-black uppercase text-amber-300">Ludo King Quick Chat</span>
                <button onClick={() => setShowChatModal(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Emojis Grid */}
              <div className="grid grid-cols-4 gap-2 text-2xl">
                {LUDO_KING_EMOJIS.map(em => (
                  <button
                    key={em}
                    onClick={() => handleSendReaction(em)}
                    className="p-2 bg-[#1A365D] hover:bg-[#2A4D7C] rounded-xl hover:scale-110 active:scale-95 transition-all text-center"
                  >
                    {em}
                  </button>
                ))}
              </div>

              {/* Quick Text Messages */}
              <div className="flex flex-col gap-1.5 pt-1">
                {LUDO_KING_CHATS.map(msg => (
                  <button
                    key={msg}
                    onClick={() => handleSendReaction(msg)}
                    className="text-left text-xs bg-[#1A365D] hover:bg-[#2A4D7C] text-zinc-200 px-3 py-1.5 rounded-lg font-bold transition-colors"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ludo King Victory Popup */}
      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="w-full max-w-sm bg-gradient-to-b from-[#1E3A5F] via-[#0F2238] to-[#081321] border-4 border-[#FFD700] rounded-3xl p-6 flex flex-col items-center text-center shadow-[0_0_50px_rgba(255,215,0,0.6)]"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FF8C00] flex items-center justify-center text-black mb-3 shadow-2xl animate-bounce">
                <Trophy className="w-12 h-12 text-amber-950 drop-shadow" />
              </div>

              <h2 className="text-3xl font-black italic tracking-tight uppercase text-[#FFD700] drop-shadow">
                {winner === 'red' ? '👑 YOU WON!' : `${COLOR_CONFIG[winner].name} WON!`}
              </h2>

              <p className="text-xs text-zinc-300 mt-1">
                {winner === 'red' ? 'You are the real Ludo King Champion!' : 'Better luck in the next round!'}
              </p>

              {winner === 'red' && winPrize > 0 && (
                <div className="my-4 p-3.5 bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border-2 border-[#FFD700] rounded-2xl w-full flex flex-col items-center shadow-inner">
                  <span className="text-[11px] text-zinc-300 uppercase font-black">Winning Prize Pot</span>
                  <span className="text-3xl font-mono font-black text-[#FFD700] drop-shadow">
                    +{winPrize.toFixed(2)} {activeCoin}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold mt-1">Directly credited to your wallet!</span>
                </div>
              )}

              <div className="flex gap-2 w-full mt-4">
                <button
                  onClick={() => handleStartGame()}
                  className="flex-1 py-3.5 bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-black text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg cursor-pointer"
                >
                  Play Again 🎲
                </button>
                <button
                  onClick={onBackToBulletRide}
                  className="py-3.5 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-xs uppercase rounded-xl border border-zinc-600 cursor-pointer"
                >
                  Exit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );

  // Human / Bot Click on Token
  function handleTokenClick(token: LudoToken) {
    if (winner || isRolling || !diceRoll) return;
    if (token.color !== activeTurn) return;
    if (!movableTokenIds.includes(token.id)) return;

    moveToken(token, diceRoll);
  }

  // Render authentic Chess piece token (Knight / Pawn / King)
  function renderLudoKingPawn(color: LudoColor, isMovable: boolean = false) {
    const cfg = COLOR_CONFIG[color];
    const gradId = `chess-grad-${color}`;
    const goldGradId = `chess-gold-${color}`;

    return (
      <motion.div
        animate={isMovable ? { y: [0, -6, 0], scale: [1, 1.15, 1] } : {}}
        transition={isMovable ? { repeat: Infinity, duration: 0.6 } : {}}
        className="relative flex flex-col items-center justify-center cursor-pointer select-none"
      >
        {/* Bouncing down arrow indicator for movable piece */}
        {isMovable && (
          <div className="absolute -top-5 text-[11px] text-amber-300 animate-bounce pointer-events-none font-black drop-shadow">
            ▼
          </div>
        )}

        {/* Movable Golden Halo Ring */}
        {isMovable && (
          <div className="absolute inset-0 rounded-full ring-2 ring-[#FFD700] ring-offset-1 animate-pulse pointer-events-none" />
        )}

        {/* 3D Chess Piece Vector SVG */}
        <div className="relative w-6 h-7 sm:w-7 sm:h-8 flex items-center justify-center filter drop-shadow-[0_3px_5px_rgba(0,0,0,0.6)]">
          <svg viewBox="0 0 100 120" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="35%" stopColor={cfg.accent} />
                <stop offset="75%" stopColor={cfg.hex} />
                <stop offset="100%" stopColor={cfg.border} />
              </linearGradient>
              <linearGradient id={goldGradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="50%" stopColor="#FDE047" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>

            {chessPieceType === 'knight' && (
              /* Staunton Chess Knight / Horse (घोड़ा) */
              <g>
                {/* Base Pedestal Bottom Tier */}
                <rect x="16" y="104" width="68" height="11" rx="4" fill={cfg.border} />
                <rect x="18" y="102" width="64" height="10" rx="3" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />
                
                {/* Gold Inlaid Accent Ring */}
                <rect x="23" y="96" width="54" height="6" rx="2" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="0.8" />
                
                {/* Lower Pedestal Collar */}
                <ellipse cx="50" cy="92" rx="28" ry="6" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />

                {/* Horse Head & Chest Profile */}
                <path
                  d="M26,92 C26,76 33,62 36,52 C37,48 33,44 31,38 C29,32 33,24 41,21 C43,17 46,11 53,11 C57,11 58,15 56,19 C66,17 76,23 76,33 C76,39 72,45 68,49 C66,52 69,56 73,63 C77,71 75,83 75,92 Z"
                  fill={`url(#${gradId})`}
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                {/* Carved Mane Grooves */}
                <path d="M51,15 Q45,23 43,31 Q39,37 35,43" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

                {/* White Alert Horse Eye */}
                <circle cx="63" cy="29" r="3.5" fill="#ffffff" />
                <circle cx="63.5" cy="29" r="2" fill="#000000" />
                <circle cx="64.5" cy="28.5" r="0.8" fill="#ffffff" />

                {/* Nostril */}
                <ellipse cx="73" cy="41" rx="1.8" ry="2.6" fill="#000000" opacity="0.6" />

                {/* Glossy Curved Muscle Sheen */}
                <path d="M63,58 C66,68 65,78 66,88" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              </g>
            )}

            {chessPieceType === 'pawn' && (
              /* Staunton Chess Pawn (प्यादा) */
              <g>
                {/* Base Pedestal Bottom Tier */}
                <rect x="18" y="104" width="64" height="11" rx="4" fill={cfg.border} />
                <rect x="20" y="102" width="60" height="10" rx="3" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />

                {/* Gold Rim Band */}
                <rect x="25" y="96" width="50" height="6" rx="2" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="0.8" />
                
                {/* Flared Torso Bell */}
                <path d="M30,96 C32,84 40,77 42,68 L58,68 C60,77 68,84 70,96 Z" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />

                {/* Middle Gold Ring Collar */}
                <ellipse cx="50" cy="67" rx="18" ry="5" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="1" />
                <ellipse cx="50" cy="65" rx="16" ry="4" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1" />

                {/* Slender Neck */}
                <path d="M43,65 C43,56 44,50 45,46 L55,46 C56,50 57,56 57,65 Z" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.2" />

                {/* Top Collar */}
                <ellipse cx="50" cy="46" rx="13" ry="3.5" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="0.8" />

                {/* Spherical Head with Specular Gleam */}
                <circle cx="50" cy="25" r="19" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="2" />
                <ellipse cx="45" cy="19" rx="6" ry="3.5" fill="#ffffff" opacity="0.8" transform="rotate(-30 45 19)" />
              </g>
            )}

            {chessPieceType === 'king' && (
              /* Staunton Chess King / Crowned Raja (राजा) */
              <g>
                {/* Base Pedestal Bottom Tier */}
                <rect x="18" y="104" width="64" height="11" rx="4" fill={cfg.border} />
                <rect x="20" y="102" width="60" height="10" rx="3" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />
                <rect x="25" y="96" width="50" height="6" rx="2" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="0.8" />

                {/* Torso & Column */}
                <path d="M28,96 C30,78 38,64 42,54 L58,54 C62,64 70,78 72,96 Z" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />
                
                {/* Waist Gold Belt with Jewel */}
                <rect x="36" y="72" width="28" height="6" rx="2" fill={`url(#${goldGradId})`} stroke="#ffffff" strokeWidth="0.8" />
                <circle cx="50" cy="75" r="1.8" fill="#EF4444" />

                {/* Royal Collar */}
                <ellipse cx="50" cy="54" rx="20" ry="5.5" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="1" />

                {/* Crown Coronet Dome */}
                <path d="M34,54 C32,40 38,32 44,30 L56,30 C62,32 68,40 66,54 Z" fill={`url(#${gradId})`} stroke="#ffffff" strokeWidth="1.5" />
                
                {/* Crown Filigree Gold Arc */}
                <ellipse cx="50" cy="30" rx="14" ry="4" fill={`url(#${goldGradId})`} stroke="#B45309" strokeWidth="1" />

                {/* Imperial Cross Finial on Crown */}
                <path d="M50,13 L50,28 M43,19 L57,19" stroke={`url(#${goldGradId})`} strokeWidth="3.5" strokeLinecap="square" />
                <path d="M50,13 L50,28 M43,19 L57,19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="square" />
              </g>
            )}
          </svg>
        </div>
      </motion.div>
    );
  }

  // Render Path Arm Cells (Pure Ludo King White & Colored lanes)
  function renderBoardArmCells(rStart: number, rEnd: number, cStart: number, cEnd: number, armColor: LudoColor) {
    const cells: any[] = [];

    for (let r = rStart; r <= rEnd; r++) {
      for (let c = cStart; c <= cEnd; c++) {
        const trackIdx = TRACK_CELLS.findIndex(tc => tc.r === r && tc.c === c);
        const isSafe = trackIdx !== -1 && SAFE_TRACK_INDICES.has(trackIdx);

        // Check Home Run
        let isHomeRun = false;
        let homeRunColor: LudoColor | null = null;
        Object.entries(HOME_RUN_CELLS).forEach(([colKey, coords]) => {
          if (coords.some(gc => gc.r === r && gc.c === c)) {
            isHomeRun = true;
            homeRunColor = colKey as LudoColor;
          }
        });

        // Check Starting Square
        const isStartSquare = trackIdx === 0 || trackIdx === 13 || trackIdx === 26 || trackIdx === 39;
        const startColor: LudoColor | null = 
          trackIdx === 0 ? 'red' :
          trackIdx === 13 ? 'green' :
          trackIdx === 26 ? 'yellow' :
          trackIdx === 39 ? 'blue' : null;

        // Check tokens on this cell
        const cellTokens = tokens.filter(t => {
          const coord = getTokenCoord(t);
          return coord.r === r && coord.c === c;
        });

        // Style
        let cellBg = 'bg-white';
        let arrowSymbol = null;

        if (isHomeRun && homeRunColor) {
          cellBg = homeRunColor === 'red' ? 'bg-[#E52521]' :
                   homeRunColor === 'green' ? 'bg-[#00A651]' :
                   homeRunColor === 'yellow' ? 'bg-[#FFC000]' : 'bg-[#0070BA]';
        } else if (isStartSquare && startColor) {
          cellBg = startColor === 'red' ? 'bg-[#E52521]' :
                   startColor === 'green' ? 'bg-[#00A651]' :
                   startColor === 'yellow' ? 'bg-[#FFC000]' : 'bg-[#0070BA]';
          arrowSymbol = startColor === 'red' ? '➔' : startColor === 'green' ? '⬇' : startColor === 'yellow' ? '⬅' : '⬆';
        }

        cells.push(
          <div
            key={`cell-${r}-${c}`}
            className={`border border-[#CBD5E1] relative flex items-center justify-center ${cellBg}`}
          >
            {/* Safe Spot Star (Ludo King Signature) */}
            {isSafe && !isStartSquare && (
              <span className="text-amber-400 text-xs sm:text-sm drop-shadow font-black select-none pointer-events-none">
                ★
              </span>
            )}

            {/* Starting square arrow */}
            {arrowSymbol && cellTokens.length === 0 && (
              <span className="text-white text-[10px] sm:text-xs font-black drop-shadow pointer-events-none">
                {arrowSymbol}
              </span>
            )}

            {/* Pawns on cell */}
            {cellTokens.length > 0 && (
              <div className="relative flex items-center justify-center">
                {cellTokens.map((t, idx) => {
                  const isMovable = activeTurn === t.color && movableTokenIds.includes(t.id);
                  const isStacked = cellTokens.length > 1;
                  return (
                    <div 
                      key={`token-${t.color}-${t.id}`}
                      onClick={() => handleTokenClick(t)}
                      style={{ marginLeft: isStacked && idx > 0 ? '-6px' : '0px' }}
                    >
                      {renderLudoKingPawn(t.color, isMovable)}
                    </div>
                  );
                })}
                {cellTokens.length > 1 && (
                  <span className="absolute -top-2 -right-2 bg-black text-white text-[8px] font-black px-1 rounded-full border border-white">
                    {cellTokens.length}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      }
    }

    return cells;
  }

  // Render 3D Dice Face
  function renderDiceFace(val: number) {
    const dot = "w-2 h-2 sm:w-2.5 sm:h-2.5 bg-black rounded-full shadow-inner";
    switch (val) {
      case 1:
        return <div className="w-full h-full flex items-center justify-center"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 bg-red-600 rounded-full shadow-inner" /></div>;
      case 2:
        return (
          <div className="w-full h-full p-2 flex flex-col justify-between">
            <div className="flex justify-start"><div className={dot} /></div>
            <div className="flex justify-end"><div className={dot} /></div>
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full p-1.5 flex flex-col justify-between">
            <div className="flex justify-start"><div className={dot} /></div>
            <div className="flex justify-center"><div className={dot} /></div>
            <div className="flex justify-end"><div className={dot} /></div>
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full p-1.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
      case 5:
        return (
          <div className="w-full h-full p-1.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-center"><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
      case 6:
      default:
        return (
          <div className="w-full h-full p-1.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
    }
  }
}
