import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Crown, Trophy, Sparkles, Volume2, VolumeX, RotateCcw, 
  Flame, Swords, Users, User, ArrowLeft, ShieldCheck, 
  Coins, Zap, AlertCircle, CheckCircle2, Award, ChevronRight
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

const AI_OPPONENTS = [
  { name: 'Surma Bhopali', title: 'Grandmaster of Gwalior', avatar: '👳', quote: 'Arey hum to chakka jeb me leke ghumte hain!' },
  { name: 'Chulbul Pandey', title: 'Robinhood of Ludo', avatar: '🤠', quote: 'Katti aisi karenge ki dushman yaad rakhega!' },
  { name: 'Gabbar Singh', title: 'Dacoit of Chambal', avatar: '🦁', quote: 'Kitne token the? Sabko ghar bhej diya!' },
  { name: 'Munna Bhaiya', title: 'King of Mirzapur', avatar: '👑', quote: 'Yahan jeet ka niyam hum tay karte hain!' }
];

const DESI_TAUNTS = [
  "🎲 Chakka chahiye baba!",
  "⚔️ Katti kar di na!",
  "🛡️ Safe zone me araam farmao!",
  "🔥 Apna time aayega!",
  "💨 Rasta chhod do raja aa raha hai!",
  "🚀 Seedha ghar ke andar entry!"
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
  // Game Setup States
  const [gameMode, setGameMode] = useState<GameMode>('vs_ai');
  const [matchType, setMatchType] = useState<MatchType>('quick');
  const [selectedStake, setSelectedStake] = useState<number>(() => {
    return activeCoin === 'INR' ? 50 : 1;
  });
  const [isGameActive, setIsGameActive] = useState(false);
  const [isMuted, setIsMuted] = useState(isSoundMuted);
  const [selectedAi, setSelectedAi] = useState(AI_OPPONENTS[0]);

  // Gameplay Board States
  const [activeTurn, setActiveTurn] = useState<LudoColor>('red');
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [consecutiveSixes, setConsecutiveSixes] = useState(0);
  const [tokens, setTokens] = useState<LudoToken[]>(() => initTokens(['red', 'green']));
  const [activeColors, setActiveColors] = useState<LudoColor[]>(['red', 'green']);
  const [canRoll, setCanRoll] = useState(true);
  const [movableTokenIds, setMovableTokenIds] = useState<number[]>([]);
  const [winner, setWinner] = useState<LudoColor | null>(null);
  const [winPrize, setWinPrize] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("Boli lagao aur Shahi Chaupar ka aagaz karo!");
  const [chakkaBurst, setChakkaBurst] = useState(false);
  const [lastKattiNotice, setLastKattiNotice] = useState<string | null>(null);

  // Sync mute to audio engine
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

  // Quick Stake options depending on coin
  const stakeOptions = useMemo(() => {
    if (activeCoin === 'INR') {
      return [0, 20, 50, 100, 250, 500, 1000];
    }
    return [0, 0.5, 1, 2, 5, 10, 25];
  }, [activeCoin]);

  // Start new match
  const handleStartGame = () => {
    if (selectedStake > 0 && balance < selectedStake) {
      alert(`Aapke paas paryapt ${activeCoin} balance nahi hai!`);
      return;
    }

    // Deduct stake if logged in & stake > 0
    if (user && selectedStake > 0) {
      const newBal = Math.max(0, balance - selectedStake);
      onUpdateBalance(user.uid, newBal, activeCoin);
    }

    let colors: LudoColor[] = ['red', 'green'];
    if (gameMode === 'pass_and_play_4p') {
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
    setIsGameActive(true);
    setCommentary(`Khel shuru! Red player ki baari hai. Chakka phenko! 🎲`);
  };

  // Roll the dice
  const handleRollDice = () => {
    if (!canRoll || isRolling || winner) return;

    setIsRolling(true);
    setCanRoll(false);
    setMovableTokenIds([]);
    ludoAudio.playDiceRoll();

    // Dice rolling animation duration
    setTimeout(() => {
      // Authentic roll: 1 to 6
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceRoll(roll);
      setIsRolling(false);

      if (roll === 6) {
        ludoAudio.playChakkaSix();
        setChakkaBurst(true);
        setTimeout(() => setChakkaBurst(false), 1800);
      }

      // Check consecutive sixes rule
      if (roll === 6) {
        const nextSixes = consecutiveSixes + 1;
        setConsecutiveSixes(nextSixes);
        if (nextSixes >= 3) {
          setCommentary(`Haye re! Lagatar 3 chakka aane par baari raddh ho gayi! ❌`);
          setConsecutiveSixes(0);
          setTimeout(() => nextTurn(), 1200);
          return;
        }
      } else {
        setConsecutiveSixes(0);
      }

      // Find tokens of active player that can move
      const currentTokens = tokens.filter(t => t.color === activeTurn);
      const eligibleTokens = currentTokens.filter(t => canTokenMove(t, roll));

      if (eligibleTokens.length === 0) {
        setCommentary(`${COLOR_CONFIG[activeTurn].name} koi token aage nahi badha sakta.`);
        setTimeout(() => nextTurn(), 1100);
      } else if (eligibleTokens.length === 1 && (activeTurn !== 'red' || gameMode === 'vs_ai' && activeTurn !== 'red')) {
        // AI or single auto-move
        setCommentary(`${COLOR_CONFIG[activeTurn].name} ne token badha diya!`);
        setTimeout(() => {
          moveToken(eligibleTokens[0], roll);
        }, 700);
      } else {
        // Highlight movable tokens for human tap
        setMovableTokenIds(eligibleTokens.map(t => t.id));
        setCommentary(`${COLOR_CONFIG[activeTurn].name} apna token chunein jo aage badhana hai.`);

        // If it's AI turn, let AI make its strategic choice
        if (gameMode === 'vs_ai' && activeTurn !== 'red') {
          setTimeout(() => {
            const chosen = chooseBestAiToken(eligibleTokens, roll);
            moveToken(chosen, roll);
          }, 900);
        }
      }
    }, 650);
  };

  // AI decision making
  const chooseBestAiToken = (eligible: LudoToken[], roll: number): LudoToken => {
    // 1. Prioritize capturing opponent's token
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
          if (victim) return t; // Kill!
        }
      }
    }

    // 2. Prioritize bringing out of yard on 6
    if (roll === 6) {
      const yardToken = eligible.find(t => t.step === STEP_IN_YARD);
      if (yardToken) return yardToken;
    }

    // 3. Prioritize reaching Home Goal
    const goalToken = eligible.find(t => calculateNextStep(t, roll) === STEP_GOAL);
    if (goalToken) return goalToken;

    // 4. Prioritize escaping danger or moving farthest pawn
    return eligible.sort((a, b) => b.step - a.step)[0];
  };

  // Move token
  const moveToken = (token: LudoToken, roll: number) => {
    setMovableTokenIds([]);
    const nextStep = calculateNextStep(token, roll);

    ludoAudio.playTokenHop();

    let bonusRoll = (roll === 6);
    let capturedVictim: LudoToken | null = null;

    // Check capture on main track
    if (nextStep >= STEP_START && nextStep <= 50) {
      const destTrackIdx = getGlobalTrackIndex(token.color, nextStep);
      if (destTrackIdx !== null && !SAFE_TRACK_INDICES.has(destTrackIdx)) {
        // Look for opponent token at destination
        const victim = tokens.find(other => 
          other.color !== token.color && 
          other.step >= STEP_START && other.step <= 50 &&
          getGlobalTrackIndex(other.color, other.step) === destTrackIdx
        );
        if (victim) {
          capturedVictim = victim;
          bonusRoll = true; // Capturing grants bonus turn!
        }
      }
    }

    // Check if entered Goal
    if (nextStep === STEP_GOAL) {
      ludoAudio.playHomeGoal();
      bonusRoll = true; // Entering home gives bonus turn!
    }

    // Update tokens state
    setTokens(prev => {
      return prev.map(t => {
        if (t.color === token.color && t.id === token.id) {
          return { ...t, step: nextStep };
        }
        if (capturedVictim && t.color === capturedVictim.color && t.id === capturedVictim.id) {
          // Sent back to yard!
          return { ...t, step: STEP_IN_YARD };
        }
        return t;
      });
    });

    if (capturedVictim) {
      ludoAudio.playCaptureKatti();
      const victimName = COLOR_CONFIG[capturedVictim.color].name;
      setLastKattiNotice(`💥 KATTI! ${COLOR_CONFIG[token.color].name} ne ${victimName} ke token ko thuk diya!`);
      setCommentary(`💥 KATTI HO GAYI! Bonus roll mila hai!`);
      setTimeout(() => setLastKattiNotice(null), 3000);
    }

    // Check Win Condition
    setTimeout(() => {
      checkWinner(token.color, nextStep);
      if (bonusRoll && !winner) {
        setCanRoll(true);
        setCommentary(`🔥 Shandar! ${COLOR_CONFIG[token.color].name} ko mila BONUS ROLL! 🎲`);
        
        // If AI got bonus roll, roll automatically
        if (gameMode === 'vs_ai' && activeTurn !== 'red') {
          setTimeout(() => handleRollDice(), 1000);
        }
      } else {
        nextTurn();
      }
    }, 450);
  };

  // Check if player won
  const checkWinner = (color: LudoColor, latestStep: number) => {
    // Current tokens of this player
    const playerTokens = tokens.map(t => {
      if (t.color === color && t.step === latestStep) {
        return { ...t, step: latestStep };
      }
      return t;
    }).filter(t => t.color === color);

    const homeCount = playerTokens.filter(t => t.step === STEP_GOAL).length;

    let hasWon = false;
    if (matchType === 'quick') {
      hasWon = homeCount >= 1;
    } else {
      hasWon = homeCount >= 4;
    }

    if (hasWon) {
      setWinner(color);
      setCanRoll(false);
      ludoAudio.playVictory();

      // Calculate prize: 1.9x stake
      const prize = selectedStake > 0 ? parseFloat((selectedStake * 1.9).toFixed(2)) : 0;
      setWinPrize(prize);

      // If user (red) won, credit wallet
      if (color === 'red' && user && prize > 0) {
        const newBal = parseFloat((balance + prize).toFixed(8));
        onUpdateBalance(user.uid, newBal, activeCoin);
      }

      setCommentary(`🏆 SHAHI VICTORY! ${COLOR_CONFIG[color].name} ne Chaupar jeet liya!`);
    }
  };

  // Next Turn
  const nextTurn = () => {
    const currentIndex = activeColors.indexOf(activeTurn);
    const nextIndex = (currentIndex + 1) % activeColors.length;
    const nextColor = activeColors[nextIndex];
    setActiveTurn(nextColor);
    setDiceRoll(null);
    setCanRoll(true);
    setMovableTokenIds([]);
    setConsecutiveSixes(0);

    setCommentary(`Ab ${COLOR_CONFIG[nextColor].name} ki baari hai. Pasa phenko!`);

    // If next is AI, auto-trigger roll
    if (gameMode === 'vs_ai' && nextColor !== 'red') {
      setTimeout(() => {
        handleRollDice();
      }, 1000);
    }
  };

  // Handle Token Click by Human
  const handleTokenClick = (token: LudoToken) => {
    if (winner || isRolling || !diceRoll) return;
    if (token.color !== activeTurn) return;
    if (!movableTokenIds.includes(token.id)) return;

    moveToken(token, diceRoll);
  };

  // Progress stats
  const redHomeCount = tokens.filter(t => t.color === 'red' && t.step === STEP_GOAL).length;
  const oppHomeCount = tokens.filter(t => t.color === 'green' && t.step === STEP_GOAL).length;

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center select-none pb-12">
      {/* Top Royal Header Bar */}
      <div className="w-full bg-[#121212] border-b border-[#2A2A2A] px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToBulletRide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition-all border border-zinc-700"
          >
            <ArrowLeft className="w-4 h-4 text-[#FFD700]" />
            <span>Bullet Ride</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                Shahi Chaupar <span className="text-[#FFD700] text-xs font-mono bg-[#FFD700]/10 px-1.5 py-0.5 rounded border border-[#FFD700]/30">LUDO 6</span>
              </h1>
              <p className="text-[10px] text-zinc-400">Desi Royal Arena &bull; Real Stakes</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Active Coin Balance Pill */}
          <div className="bg-black/60 border border-[#333] px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Coins className="w-3.5 h-3.5 text-[#FFD700]" />
            <span className="text-xs font-mono font-bold text-white">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-[#FFD700]">{activeCoin}</span>
            </span>
          </div>

          {/* Sound Mute Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-5xl px-3 sm:px-6 py-4 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6">
        
        {/* Left / Center: The Majestic Ludo Arena Board */}
        <div className="flex flex-col items-center w-full max-w-[500px]">
          {/* Live Hype Banner */}
          <div className="w-full mb-3 px-3 py-2 bg-gradient-to-r from-zinc-900 via-black to-zinc-900 border border-[#333] rounded-xl flex items-center justify-between text-xs shadow-md">
            <div className="flex items-center gap-2 truncate">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-zinc-200 font-medium truncate">{commentary}</span>
            </div>
            {selectedStake > 0 && (
              <span className="shrink-0 text-[10px] font-black uppercase text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 rounded">
                Pot: {(selectedStake * 1.9).toFixed(2)} {activeCoin}
              </span>
            )}
          </div>

          {/* 15x15 Royal Chaupar Board */}
          <div className="relative w-full aspect-square max-w-[460px] bg-[#0E0E0E] p-2.5 rounded-2xl border-4 border-[#FFD700]/40 shadow-[0_0_35px_rgba(255,215,0,0.15)] select-none">
            {/* Wooden filigree corner accents */}
            <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-[#FFD700] pointer-events-none" />
            <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-[#FFD700] pointer-events-none" />
            <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-[#FFD700] pointer-events-none" />
            <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-[#FFD700] pointer-events-none" />

            {/* Board Grid: 15 rows x 15 columns */}
            <div className="relative w-full h-full grid grid-cols-15 grid-rows-15 bg-[#141414] rounded-lg overflow-hidden border border-[#333]">
              
              {/* 1. RED BASE (Top-Left 6x6) */}
              <div className="col-span-6 row-span-6 bg-gradient-to-br from-red-950/90 via-red-900/60 to-black p-2 border-r-2 border-b-2 border-[#FFD700]/30 relative flex items-center justify-center">
                <div className="w-4/5 h-4/5 bg-black/60 rounded-xl border border-red-500/40 p-2 flex flex-col items-center justify-between shadow-inner">
                  <div className="flex items-center justify-between w-full text-[10px] font-black uppercase text-red-400">
                    <span className="flex items-center gap-1">👑 Red Sultan</span>
                    <span>{tokens.filter(t => t.color === 'red' && t.step === STEP_IN_YARD).length} Base</span>
                  </div>
                  {/* Base Pedestals */}
                  <div className="grid grid-cols-2 gap-2.5 my-auto">
                    {[0, 1, 2, 3].map(slotIdx => {
                      const tokenInSlot = tokens.find(t => t.color === 'red' && t.id === slotIdx && t.step === STEP_IN_YARD);
                      const isMovable = tokenInSlot && movableTokenIds.includes(tokenInSlot.id);
                      return (
                        <div 
                          key={slotIdx}
                          onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-red-950/80 border-2 ${
                            isMovable ? 'border-[#FFD700] ring-2 ring-[#FFD700] animate-bounce cursor-pointer' : 'border-red-600/40'
                          } flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]`}
                        >
                          {tokenInSlot && (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-red-500 to-red-800 border border-white/60 flex items-center justify-center text-white shadow-lg text-[10px] font-black">
                              <Crown className="w-3.5 h-3.5 text-white drop-shadow" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. TOP ARM (Green Path) Cols 6,7,8 Rows 0..5 */}
              <div className="col-span-3 row-span-6 grid grid-cols-3 grid-rows-6 border-b-2 border-[#FFD700]/30">
                {renderArmCells(0, 5, 6, 8, 'green')}
              </div>

              {/* 3. GREEN BASE (Top-Right 6x6) */}
              <div className="col-span-6 row-span-6 bg-gradient-to-bl from-emerald-950/90 via-emerald-900/60 to-black p-2 border-l-2 border-b-2 border-[#FFD700]/30 relative flex items-center justify-center">
                <div className="w-4/5 h-4/5 bg-black/60 rounded-xl border border-emerald-500/40 p-2 flex flex-col items-center justify-between shadow-inner">
                  <div className="flex items-center justify-between w-full text-[10px] font-black uppercase text-emerald-400">
                    <span className="flex items-center gap-1">{gameMode === 'vs_ai' ? selectedAi.avatar + ' ' + selectedAi.name : 'Green Nawab'}</span>
                    <span>{tokens.filter(t => t.color === 'green' && t.step === STEP_IN_YARD).length} Base</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 my-auto">
                    {[0, 1, 2, 3].map(slotIdx => {
                      const tokenInSlot = tokens.find(t => t.color === 'green' && t.id === slotIdx && t.step === STEP_IN_YARD);
                      const isMovable = tokenInSlot && activeTurn === 'green' && movableTokenIds.includes(tokenInSlot.id);
                      return (
                        <div 
                          key={slotIdx}
                          onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-950/80 border-2 ${
                            isMovable ? 'border-[#FFD700] ring-2 ring-[#FFD700] animate-bounce cursor-pointer' : 'border-emerald-600/40'
                          } flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]`}
                        >
                          {tokenInSlot && (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-800 border border-white/60 flex items-center justify-center text-white shadow-lg text-[10px] font-black">
                              <Crown className="w-3.5 h-3.5 text-white drop-shadow" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 4. LEFT ARM (Red Path) Rows 6,7,8 Cols 0..5 */}
              <div className="col-span-6 row-span-3 grid grid-cols-6 grid-rows-3 border-r-2 border-[#FFD700]/30">
                {renderArmCells(6, 8, 0, 5, 'red')}
              </div>

              {/* 5. CENTRAL ROYAL VAULT (Home Goal Triangle 3x3) Rows 6..8, Cols 6..8 */}
              <div className="col-span-3 row-span-3 bg-gradient-to-br from-[#1C1A0E] via-[#2A2408] to-black border-2 border-[#FFD700] relative flex items-center justify-center shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                {/* 4 Colored Triangular Insets */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-full grid grid-cols-2 grid-rows-2 opacity-30">
                    <div className="bg-red-600 rounded-tl-full" />
                    <div className="bg-emerald-600 rounded-tr-full" />
                    <div className="bg-blue-600 rounded-bl-full" />
                    <div className="bg-amber-500 rounded-br-full" />
                  </div>
                </div>

                {/* Central Emblem & Goal Counters */}
                <div className="z-10 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#B8860B] flex items-center justify-center text-black shadow-lg border border-white/40 animate-spin-slow">
                    <Trophy className="w-5 h-5 text-black drop-shadow" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#FFD700] mt-0.5">MAHAL</span>
                </div>

                {/* Render tokens that made it home */}
                {tokens.filter(t => t.step === STEP_GOAL).map(t => (
                  <div 
                    key={`goal-${t.color}-${t.id}`}
                    className="absolute z-20 w-5 h-5 rounded-full border border-white flex items-center justify-center text-[9px] font-black text-white shadow-lg"
                    style={{
                      backgroundColor: COLOR_CONFIG[t.color].hex,
                      transform: `translate(${t.color === 'red' ? '-14px' : t.color === 'green' ? '14px' : '0px'}, ${t.color === 'blue' ? '14px' : t.color === 'yellow' ? '-14px' : '0px'})`
                    }}
                  >
                    👑
                  </div>
                ))}
              </div>

              {/* 6. RIGHT ARM (Yellow Path) Rows 6,7,8 Cols 9..14 */}
              <div className="col-span-6 row-span-3 grid grid-cols-6 grid-rows-3 border-l-2 border-[#FFD700]/30">
                {renderArmCells(6, 8, 9, 14, 'yellow')}
              </div>

              {/* 7. BLUE BASE (Bottom-Left 6x6) */}
              <div className="col-span-6 row-span-6 bg-gradient-to-tr from-blue-950/90 via-blue-900/60 to-black p-2 border-r-2 border-t-2 border-[#FFD700]/30 relative flex items-center justify-center">
                <div className="w-4/5 h-4/5 bg-black/60 rounded-xl border border-blue-500/40 p-2 flex flex-col items-center justify-between shadow-inner">
                  <div className="flex items-center justify-between w-full text-[10px] font-black uppercase text-blue-400">
                    <span className="flex items-center gap-1">Sapphire Shahi</span>
                    <span>{tokens.filter(t => t.color === 'blue' && t.step === STEP_IN_YARD).length} Base</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 my-auto">
                    {[0, 1, 2, 3].map(slotIdx => {
                      const tokenInSlot = tokens.find(t => t.color === 'blue' && t.id === slotIdx && t.step === STEP_IN_YARD);
                      const isMovable = tokenInSlot && activeTurn === 'blue' && movableTokenIds.includes(tokenInSlot.id);
                      return (
                        <div 
                          key={slotIdx}
                          onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-950/80 border-2 ${
                            isMovable ? 'border-[#FFD700] ring-2 ring-[#FFD700] animate-bounce cursor-pointer' : 'border-blue-600/40'
                          } flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]`}
                        >
                          {tokenInSlot && (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-800 border border-white/60 flex items-center justify-center text-white shadow-lg text-[10px] font-black">
                              <Crown className="w-3.5 h-3.5 text-white drop-shadow" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 8. BOTTOM ARM (Blue Path) Cols 6,7,8 Rows 9..14 */}
              <div className="col-span-3 row-span-6 grid grid-cols-3 grid-rows-6 border-t-2 border-[#FFD700]/30">
                {renderArmCells(9, 14, 6, 8, 'blue')}
              </div>

              {/* 9. YELLOW BASE (Bottom-Right 6x6) */}
              <div className="col-span-6 row-span-6 bg-gradient-to-tl from-amber-950/90 via-amber-900/60 to-black p-2 border-l-2 border-t-2 border-[#FFD700]/30 relative flex items-center justify-center">
                <div className="w-4/5 h-4/5 bg-black/60 rounded-xl border border-amber-500/40 p-2 flex flex-col items-center justify-between shadow-inner">
                  <div className="flex items-center justify-between w-full text-[10px] font-black uppercase text-amber-400">
                    <span className="flex items-center gap-1">Amber Maharaja</span>
                    <span>{tokens.filter(t => t.color === 'yellow' && t.step === STEP_IN_YARD).length} Base</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 my-auto">
                    {[0, 1, 2, 3].map(slotIdx => {
                      const tokenInSlot = tokens.find(t => t.color === 'yellow' && t.id === slotIdx && t.step === STEP_IN_YARD);
                      const isMovable = tokenInSlot && activeTurn === 'yellow' && movableTokenIds.includes(tokenInSlot.id);
                      return (
                        <div 
                          key={slotIdx}
                          onClick={() => tokenInSlot && handleTokenClick(tokenInSlot)}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-950/80 border-2 ${
                            isMovable ? 'border-[#FFD700] ring-2 ring-[#FFD700] animate-bounce cursor-pointer' : 'border-amber-600/40'
                          } flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]`}
                        >
                          {tokenInSlot && (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 border border-white/60 flex items-center justify-center text-white shadow-lg text-[10px] font-black">
                              <Crown className="w-3.5 h-3.5 text-white drop-shadow" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

            {/* Chakka 6 Shockwave Overlay */}
            <AnimatePresence>
              {chakkaBurst && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1.1, opacity: 1 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-40 bg-black/40 backdrop-blur-[2px] rounded-2xl"
                >
                  <div className="text-4xl sm:text-5xl font-black italic tracking-tighter text-[#FFD700] drop-shadow-[0_0_25px_rgba(255,215,0,0.9)] animate-pulse flex items-center gap-2">
                    🔥 CHAKKA 6! 🎲
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-widest mt-1 bg-black/70 px-3 py-1 rounded-full border border-[#FFD700]">
                    Bonus Turn Mila Hai!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Katti Announcement Popup */}
            <AnimatePresence>
              {lastKattiNotice && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute bottom-4 left-4 right-4 bg-red-950/95 border-2 border-red-500 text-white px-3 py-2 rounded-xl text-center text-xs font-black tracking-wide shadow-2xl z-40"
                >
                  {lastKattiNotice}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Side: Interactive Controls & Match Cockpit */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          
          {/* Active Turn Cockpit */}
          <div className="bg-[#141414] border border-[#2D2D2D] rounded-2xl p-4 shadow-xl flex flex-col gap-3.5">
            <div className="flex items-center justify-between border-b border-[#242424] pb-2.5">
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full shadow" 
                  style={{ backgroundColor: COLOR_CONFIG[activeTurn].hex }}
                />
                <span className="text-xs font-black uppercase text-zinc-300">
                  {activeTurn === 'red' ? 'Aapki Baari (Red)' : `${COLOR_CONFIG[activeTurn].name} ki Baari`}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                {matchType === 'quick' ? '1 Goal to Win' : 'Classic 4 Goals'}
              </span>
            </div>

            {/* 3D Dice Display & Roll Button */}
            <div className="flex items-center justify-center gap-5 py-2">
              {/* Interactive 3D Dice Visual */}
              <div 
                onClick={handleRollDice}
                className={`w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-gradient-to-br from-zinc-100 via-amber-100 to-amber-200 border-4 border-[#FFD700] shadow-[0_10px_25px_rgba(0,0,0,0.8),inset_0_2px_6px_rgba(255,255,255,0.8)] flex items-center justify-center relative cursor-pointer select-none transition-transform ${
                  isRolling ? 'animate-spin' : canRoll ? 'hover:scale-105 active:scale-95 ring-4 ring-[#FFD700]/50' : 'opacity-90'
                }`}
              >
                {renderDicePips(diceRoll || 6)}
                {canRoll && !isRolling && (
                  <span className="absolute -bottom-2 text-[9px] bg-red-600 text-white font-black px-1.5 py-0.2 rounded-full uppercase tracking-tighter">
                    TAP ME
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  disabled={!canRoll || isRolling || !!winner}
                  onClick={handleRollDice}
                  className={`px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg ${
                    canRoll && !isRolling && !winner
                      ? 'bg-gradient-to-r from-[#FFD700] to-[#E6A100] text-black hover:brightness-110 active:scale-95 cursor-pointer ring-2 ring-[#FFD700]/30'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                  }`}
                >
                  <Flame className="w-4 h-4 text-black" />
                  <span>{isRolling ? 'Rolling...' : 'Roll Pasa 🎲'}</span>
                </button>

                <div className="text-[11px] text-zinc-400 text-center font-mono">
                  {diceRoll ? (
                    <span>Last Roll: <b className="text-[#FFD700] text-sm">{diceRoll}</b></span>
                  ) : (
                    <span>Pasa phenkiye</span>
                  )}
                </div>
              </div>
            </div>

            {/* Score Tracker */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#242424]">
              <div className="bg-red-950/40 border border-red-800/40 rounded-lg p-2 flex items-center justify-between">
                <div className="text-[11px] font-bold text-red-400">👑 Aap (Red)</div>
                <div className="text-xs font-mono font-black text-white">{redHomeCount} / {matchType === 'quick' ? 1 : 4} Goals</div>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-2 flex items-center justify-between">
                <div className="text-[11px] font-bold text-emerald-400">👳 Opponent</div>
                <div className="text-xs font-mono font-black text-white">{oppHomeCount} / {matchType === 'quick' ? 1 : 4} Goals</div>
              </div>
            </div>
          </div>

          {/* New Game / Match Configuration Box */}
          <div className="bg-[#141414] border border-[#2D2D2D] rounded-2xl p-4 shadow-xl flex flex-col gap-3.5">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center justify-between">
              <span>Game Settings & Stakes</span>
              <button 
                onClick={handleStartGame}
                className="text-[10px] text-[#FFD700] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Restart Match
              </button>
            </h2>

            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-1.5 bg-black/50 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setGameMode('vs_ai')}
                className={`py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1 ${
                  gameMode === 'vs_ai' ? 'bg-[#FFD700] text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Vs AI</span>
              </button>
              <button
                onClick={() => setGameMode('pass_and_play_2p')}
                className={`py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1 ${
                  gameMode === 'pass_and_play_2p' ? 'bg-[#FFD700] text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>2 Players</span>
              </button>
              <button
                onClick={() => setGameMode('pass_and_play_4p')}
                className={`py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1 ${
                  gameMode === 'pass_and_play_4p' ? 'bg-[#FFD700] text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>4 Players</span>
              </button>
            </div>

            {/* Match Length / Type */}
            <div className="flex items-center justify-between bg-black/40 border border-zinc-800 p-2 rounded-xl">
              <div className="text-[11px] font-bold text-zinc-300">Match Speed:</div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setMatchType('quick')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                    matchType === 'quick' ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  ⚡ Quick Blitz (1 Goal)
                </button>
                <button
                  onClick={() => setMatchType('classic')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                    matchType === 'classic' ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  🏆 Classic (4 Goals)
                </button>
              </div>
            </div>

            {/* Stake Chips Selection */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                <span>Riding Stake:</span>
                <span className="text-[#FFD700] font-mono">{selectedStake} {activeCoin}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stakeOptions.map(amount => (
                  <button
                    key={amount}
                    onClick={() => setSelectedStake(amount)}
                    className={`flex-1 min-w-[50px] py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                      selectedStake === amount 
                        ? 'bg-[#FFD700] text-black border-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.3)]' 
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {amount === 0 ? 'Free' : amount}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Opponent Selector (if vs_ai) */}
            {gameMode === 'vs_ai' && (
              <div className="bg-black/30 border border-zinc-800/80 p-2.5 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{selectedAi.avatar}</span>
                  <div>
                    <div className="text-xs font-bold text-white">{selectedAi.name}</div>
                    <div className="text-[9px] text-zinc-400 italic">"{selectedAi.quote}"</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const idx = (AI_OPPONENTS.indexOf(selectedAi) + 1) % AI_OPPONENTS.length;
                    setSelectedAi(AI_OPPONENTS[idx]);
                  }}
                  className="text-[10px] text-[#FFD700] bg-black/60 px-2 py-1 rounded border border-[#FFD700]/30 hover:bg-[#FFD700] hover:text-black font-bold transition-colors"
                >
                  Change AI
                </button>
              </div>
            )}

            {/* New Match Button */}
            <button
              onClick={handleStartGame}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white font-black text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <Zap className="w-4 h-4 text-[#FFD700]" />
              <span>Naya Match Shuru Karein</span>
            </button>
          </div>

          {/* Quick Desi Dialogue Taunts */}
          <div className="bg-[#141414] border border-[#2D2D2D] rounded-2xl p-3.5 flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase text-zinc-400">Desi Chat &amp; Taunts:</span>
            <div className="flex flex-wrap gap-1.5">
              {DESI_TAUNTS.map((taunt, idx) => (
                <button
                  key={idx}
                  onClick={() => setCommentary(taunt)}
                  className="text-[10px] bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1 rounded-full border border-zinc-700 transition-colors"
                >
                  {taunt}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Winner Celebration Modal */}
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
              className="w-full max-w-sm bg-gradient-to-b from-[#1C1A0E] to-[#0D0D0D] border-2 border-[#FFD700] rounded-3xl p-6 flex flex-col items-center text-center shadow-[0_0_50px_rgba(255,215,0,0.4)]"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFD700] to-[#E6A100] flex items-center justify-center text-black mb-3 shadow-xl animate-bounce">
                <Crown className="w-9 h-9 text-black drop-shadow" />
              </div>

              <h2 className="text-2xl font-black italic tracking-tight uppercase text-[#FFD700] drop-shadow">
                {winner === 'red' ? '👑 AAP JEET GAYE!' : `${COLOR_CONFIG[winner].name} JEET GAYE!`}
              </h2>
              
              <p className="text-xs text-zinc-300 mt-1">
                {winner === 'red' ? 'Shahi Chaupar ke asli Sultan aap hain!' : 'Agli baar behtar strategy ke saath aana bhai!'}
              </p>

              {winner === 'red' && winPrize > 0 && (
                <div className="my-4 p-3 bg-[#FFD700]/10 border border-[#FFD700]/40 rounded-2xl w-full flex flex-col items-center">
                  <span className="text-[11px] text-zinc-400 uppercase font-bold">Inaam Rashi (Winnings)</span>
                  <span className="text-2xl font-mono font-black text-[#FFD700]">
                    +{winPrize.toFixed(2)} {activeCoin}
                  </span>
                  <span className="text-[10px] text-emerald-400 mt-0.5">Wallet me jama ho gaya!</span>
                </div>
              )}

              <div className="flex gap-2 w-full mt-3">
                <button
                  onClick={handleStartGame}
                  className="flex-1 py-3 bg-[#FFD700] text-black font-black text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg cursor-pointer"
                >
                  Phir Se Khelo 🎲
                </button>
                <button
                  onClick={onBackToBulletRide}
                  className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase rounded-xl border border-zinc-700 cursor-pointer"
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

  // Helper to render arm cells
  function renderArmCells(rStart: number, rEnd: number, cStart: number, cEnd: number, armColor: LudoColor) {
    const cells: any[] = [];

    for (let r = rStart; r <= rEnd; r++) {
      for (let c = cStart; c <= cEnd; c++) {
        // Find if this cell is a Track cell
        const trackIdx = TRACK_CELLS.findIndex(tc => tc.r === r && tc.c === c);
        const isSafe = trackIdx !== -1 && SAFE_TRACK_INDICES.has(trackIdx);

        // Check if this cell is part of a Home Run column
        let isHomeRun = false;
        let homeRunColor: LudoColor | null = null;
        Object.entries(HOME_RUN_CELLS).forEach(([colKey, coords]) => {
          if (coords.some(gc => gc.r === r && gc.c === c)) {
            isHomeRun = true;
            homeRunColor = colKey as LudoColor;
          }
        });

        // Check if any token is on this cell
        const cellTokens = tokens.filter(t => {
          const coord = getTokenCoord(t);
          return coord.r === r && coord.c === c;
        });

        // Determine cell background styling
        let bgStyle = 'bg-[#181818]';
        if (isHomeRun && homeRunColor) {
          bgStyle = homeRunColor === 'red' ? 'bg-red-700/80' :
                    homeRunColor === 'green' ? 'bg-emerald-700/80' :
                    homeRunColor === 'yellow' ? 'bg-amber-600/80' : 'bg-blue-700/80';
        } else if (isSafe) {
          bgStyle = 'bg-[#2A2408] border-[#FFD700]/60';
        }

        cells.push(
          <div
            key={`cell-${r}-${c}`}
            className={`border border-[#2D2D2D] relative flex items-center justify-center ${bgStyle}`}
          >
            {/* Safe Star Icon */}
            {isSafe && (
              <span className="text-[10px] sm:text-xs text-[#FFD700] drop-shadow pointer-events-none select-none">
                ★
              </span>
            )}

            {/* Tokens sitting on this cell */}
            {cellTokens.length > 0 && (
              <div className="relative flex items-center justify-center">
                {cellTokens.map((t, idx) => {
                  const isMovable = activeTurn === t.color && movableTokenIds.includes(t.id);
                  const isStacked = cellTokens.length > 1;
                  return (
                    <motion.div
                      key={`token-${t.color}-${t.id}`}
                      onClick={() => handleTokenClick(t)}
                      initial={{ scale: 0.8 }}
                      animate={{ 
                        scale: isMovable ? [1, 1.25, 1] : 1,
                        y: isMovable ? [0, -3, 0] : 0
                      }}
                      transition={isMovable ? { repeat: Infinity, duration: 0.7 } : { duration: 0.2 }}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white/90 flex items-center justify-center text-[9px] font-black text-white shadow-xl cursor-pointer ${
                        isMovable ? 'ring-2 ring-[#FFD700] z-30' : 'z-10'
                      }`}
                      style={{
                        backgroundColor: COLOR_CONFIG[t.color].hex,
                        boxShadow: `0 0 8px ${COLOR_CONFIG[t.color].hex}`,
                        marginLeft: isStacked && idx > 0 ? '-6px' : '0px'
                      }}
                    >
                      <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
    }

    return cells;
  }

  // 3D Dice Pips Renderer
  function renderDicePips(val: number) {
    const dot = "w-3 h-3 sm:w-3.5 sm:h-3.5 bg-black rounded-full shadow-inner border border-black/30";
    switch (val) {
      case 1:
        return <div className="w-full h-full flex items-center justify-center"><div className="w-4 h-4 bg-red-600 rounded-full shadow-inner" /></div>;
      case 2:
        return (
          <div className="w-full h-full p-3 flex flex-col justify-between">
            <div className="flex justify-start"><div className={dot} /></div>
            <div className="flex justify-end"><div className={dot} /></div>
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full p-2.5 flex flex-col justify-between">
            <div className="flex justify-start"><div className={dot} /></div>
            <div className="flex justify-center"><div className={dot} /></div>
            <div className="flex justify-end"><div className={dot} /></div>
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full p-2.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
      case 5:
        return (
          <div className="w-full h-full p-2.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-center"><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
      case 6:
      default:
        return (
          <div className="w-full h-full p-2.5 flex flex-col justify-between">
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
            <div className="flex justify-between"><div className={dot} /><div className={dot} /></div>
          </div>
        );
    }
  }
}
