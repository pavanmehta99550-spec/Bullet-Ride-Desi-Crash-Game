import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Load Firebase Config
  let firebaseConfig: any = {};
  try {
    const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(firebaseConfigPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    }
  } catch (err) {
    console.error("Failed to load firebase-applet-config.json:", err);
  }

  // FORCE PROJECT ID for GCP Libraries (fix for internal project API issues)
  if (firebaseConfig.projectId) {
    process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
    process.env.GCP_PROJECT = firebaseConfig.projectId;
    console.log(`[FIREBASE] Forcing GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT}`);
  }

  // Initialize Firebase Admin
  let db: any = null;
  const existingApps = getApps();
  if (existingApps.length === 0 && firebaseConfig.projectId) {
    try {
      const adminApp = initializeApp({
        projectId: firebaseConfig.projectId
      });
      // Use named database if provided, otherwise default
      const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
        ? firebaseConfig.firestoreDatabaseId 
        : undefined;
      
      db = getFirestore(adminApp, dbId);
      console.log(`[FIREBASE] Admin SDK initialized (Project: ${firebaseConfig.projectId}, DB: ${dbId || 'default'}).`);

      // Verify reachability
      db.collection('game').limit(1).get().then(() => {
          console.log("[FIREBASE] Verification: Managed to query collections. Admin Auth OK. ✅");
      }).catch(err => {
          console.error("[FIREBASE] Verification: FAILED to query collections.", (err as any).message);
      });
    } catch (err) {
      console.error("[FIREBASE] Admin SDK Initialization failed:", err);
    }
  } else if (existingApps.length > 0) {
    const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
      ? firebaseConfig.firestoreDatabaseId 
      : undefined;
    db = getFirestore(existingApps[0], dbId);
  }

  // --- STATE VARIABLES ---
  let nextForcedCrash: number | null = null;
  let nextForcedReason: string | null = null;

  const crashReasons = [
    "Challan kat gaya 👮‍♂️",
    "Saand samne aa gaya 🐂",
    "Pothole me gir gaye 🕳️",
    "Mama ne pakad liya 🚓",
    "Petrol khatam ho gaya ⛽",
    "Tyre puncture ho gaya 📌",
    "Aage traffic jam hai 🚥",
    "Raste me JCB ki khudai chal rahi hai 🚜",
    "Papa ki pari ne takkar maar di 🛴",
    "Engine overheat ho gaya 🔥",
    "Kutte piche pad gaye 🐕",
    "Speedbreaker nahi dikha 🚧",
    "Road roller achanak aa gaya 🦺",
    "Bike slip ho gayi 🛣️",
    "Dost ne peeche se hila diya 😅",
    "Naaka bandi mein fas gaye 🛑",
    "Chai tapri pe ruk gaye ☕"
  ];

  let cryptoCoins = [
    { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A', address: 'bc1qxy2kgdy6jr...789' },
    { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', address: '0x71C765...d897' },
    { name: 'Tether', symbol: 'USDT', color: '#26A17B', address: '0x26A17B...e456' },
    { name: 'Solana', symbol: 'SOL', color: '#14F195', address: '6x5d...f678' },
    { name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633', address: 'D8vB...m90l' }
  ];

  let withdrawalRequests: any[] = [];
  let depositRequests: any[] = [];
  let userNotifications: any[] = [];
  // -----------------------------------------------------------------

  app.use(express.json());

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Sync state from Firestore (Non-blocking)
  if (db) {
    // Sync coins
    db.collection('admin').doc('settings').get().then(snapshot => {
      if (snapshot.exists && snapshot.data()?.cryptoCoins) cryptoCoins = snapshot.data()?.cryptoCoins;
    }).catch(console.error);

    // Sync other lists
    const fetchList = async (coll: string, target: any[]) => {
      try {
        const snap = await db.collection(coll).get();
        const list: any[] = [];
        snap.forEach(d => list.push(d.data()));
        list.sort((a, b) => a.id - b.id);
        target.length = 0;
        target.push(...list);
      } catch (e) {
        console.error(`[SYNC] Failed to fetch ${coll}:`, e);
      }
    };
    fetchList('deposits', depositRequests);
    fetchList('withdrawals', withdrawalRequests);
    fetchList('notifications', userNotifications);
  }

  // --- ADMIN PHYSICS ROUTES ---
  app.post("/api/admin/set-crash", (req, res) => {
    const { crashPoint, crashReason } = req.body;
    if (crashPoint === undefined || crashPoint === null || crashPoint === "") {
        return res.status(400).json({ error: "Missing crashPoint value" });
    }
    const parsed = parseFloat(crashPoint);
    if (isNaN(parsed) || parsed < 1) {
        return res.status(400).json({ error: "Invalid crashPoint. Must be >= 1.00" });
    }
    nextForcedCrash = parsed;
    nextForcedReason = crashReason || "Admin Override 🛠️";
    
    res.json({ status: "ok", message: `Physics Modified: Next Ride will crash at ${nextForcedCrash}x! ✅` });
  });

  app.post("/api/admin/consume-override", (req, res) => {
    nextForcedCrash = null;
    nextForcedReason = null;
    res.json({ status: "ok", message: "Override cleared!" });
  });

  // --- CONFIG ROUTES ---
  app.get("/api/config/crypto", (req, res) => res.json(cryptoCoins));
  app.post("/api/admin/set-crypto", async (req, res) => {
    const { coins } = req.body;
    if (coins && Array.isArray(coins)) {
      cryptoCoins = coins;
      if (db) await db.collection('admin').doc('settings').set({ cryptoCoins: coins, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.json({ status: "ok", message: "Crypto addresses saved! ✅" });
    } else res.status(400).json({ error: "Invalid coins data" });
  });

  // --- DEPOSIT & WITHDRAWAL ROUTES ---
  app.post("/api/deposit/request", async (req, res) => {
    const { amount, coin, transactionId, userId } = req.body;
    const request = { id: Date.now(), amount: parseFloat(amount), coin, transactionId, userId, status: 'pending', timestamp: new Date().toISOString() };
    depositRequests.push(request);
    if (db) await db.collection('deposits').doc(request.id.toString()).set(request);
    res.json({ status: "ok", message: "Deposit request submitted! Please wait for approval." });
  });

  app.get("/api/admin/deposits", (req, res) => res.json(depositRequests));

  app.post("/api/admin/deposit/approve", async (req, res) => {
    const { requestId } = req.body;
    const request = depositRequests.find(r => r.id === requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });
    
    request.status = 'approved';
    if (db) {
       await db.collection('deposits').doc(requestId.toString()).update({ status: 'approved' });
       // Note: Balance is handled on client side in App.tsx but admin also pushes notification
       const notification = {
         id: Date.now().toString(), type: 'deposit_approved', amount: request.amount, coin: request.coin,
         userId: request.userId, timestamp: new Date().toISOString(),
         message: `Deposit of ₹${request.amount} via ${request.coin.symbol} was successful! Balance added.`
       };
       await db.collection('notifications').doc(notification.id).set(notification);
       userNotifications.push(notification);
    }
    res.json({ status: "ok", message: "Deposit approved!" });
  });

  app.post("/api/withdraw/request", async (req, res) => {
    const { amount, coin, userAddress, userId } = req.body;
    const request = { id: Date.now(), amount: parseFloat(amount), coin, userAddress, userId, status: 'pending', timestamp: new Date().toISOString() };
    withdrawalRequests.push(request);
    if (db) await db.collection('withdrawals').doc(request.id.toString()).set(request);
    res.json({ status: "ok", message: "Withdrawal request submitted!" });
  });

  app.get("/api/admin/withdrawals", (req, res) => res.json(withdrawalRequests));

  app.post("/api/admin/withdraw/approve", async (req, res) => {
    const { requestId } = req.body;
    const request = withdrawalRequests.find(r => r.id === requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });
    request.status = 'approved';
    if (db) {
      await db.collection('withdrawals').doc(requestId.toString()).update({ status: 'approved' });
      const notification = {
        id: Date.now().toString(), type: 'withdrawal_approved', amount: request.amount, coin: request.coin,
        userId: request.userId, timestamp: new Date().toISOString(),
        message: `Withdrawal of ${request.amount} ${request.coin.symbol} was successful!`
      };
      await db.collection('notifications').doc(notification.id).set(notification);
      userNotifications.push(notification);
    }
    res.json({ status: "ok", message: "Withdrawal approved!" });
  });

  // --- NOTIFICATIONS ---
  app.get("/api/user/notifications", (req, res) => {
    const { userId } = req.query;
    res.json(userNotifications.filter(n => n.userId === userId));
  });

  app.post("/api/user/notifications/delete", async (req, res) => {
    const { id } = req.body;
    userNotifications = userNotifications.filter(n => n.id.toString() !== id.toString());
    if (db) await db.collection('notifications').doc(id.toString()).delete();
    res.json({ status: "ok" });
  });

  // --- USER MANAGEMENT ---
  app.get("/api/admin/users", async (req, res) => {
    if (!db) return res.json([]);
    try {
      const snap = await db.collection("users").get();
      const list: any[] = [];
      snap.forEach(doc => list.push({ ...doc.data(), uid: doc.id }));
      res.json(list);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/admin/user/update-balance", async (req, res) => {
    const { userId, amountToAdd, coinSymbol } = req.body;
    if (db) {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      let coinBalances = userSnap.exists ? (userSnap.data()?.coinBalances || {}) : {};
      const symbol = coinSymbol || "INR";
      coinBalances[symbol] = parseFloat((parseFloat(amountToAdd)).toFixed(8));
      await userRef.set({ uid: userId, coinBalances, activeCoin: symbol, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      
      const notification = {
        id: Date.now().toString(), type: 'deposit_approved', amount: amountToAdd,
        coin: { symbol }, userId, timestamp: new Date().toISOString(),
        message: `Admin has updated your ${symbol} balance to ${amountToAdd}! ✅`
      };
      await db.collection('notifications').doc(notification.id).set(notification);
      userNotifications.push(notification);
    }
    res.json({ status: "ok", message: "Balance updated!" });
  });

  app.post("/api/admin/user/reset-balance", async (req, res) => {
    const { userId } = req.body;
    if (db) {
      await db.collection("users").doc(userId).set({ 
        walletBalance: 0, 
        coinBalances: { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 },
        activeCoin: 'INR',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    res.json({ status: "ok", message: "Balance reset!" });
  });

  app.post("/api/admin/user/toggle-block", async (req, res) => {
    const { userId, isBlocked } = req.body;
    if (db) await db.collection("users").doc(userId).set({ isBlocked, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ status: "ok", message: "User status updated!" });
  });

  // --- GAME LOGIC (Synchronized Global Loop) ---
  let globalRound = {
    status: 'WAITING',
    roundId: Date.now().toString(),
    startTime: Date.now() + 8000,
    crashPoint: 2.00,
    crashReason: "Engine Phat Gaya! 🧨",
    lastResetTime: Date.now()
  };

  let broadcastFailureCount = 0;
  async function broadcastGlobalState() {
    if (!db) return;
    try {
      await db.collection('game').doc('current').set({
        ...globalRound,
        serverTime: FieldValue.serverTimestamp()
      });
      broadcastFailureCount = 0; // Reset on success
    } catch (e) {
      broadcastFailureCount++;
      if (broadcastFailureCount <= 3) {
        console.error("[LOOP] Broadcast failed (Firestore sync issue):", (e as any).message);
      } else if (broadcastFailureCount === 4) {
        console.warn("[LOOP] Firestore broadcast repeatedly failing. Continuing in memory-only mode for preview.");
      }
      // Continue anyway, client will use fallback logic if it can't see the document
    }
  }

  function startNewRound() {
    const data = generateRoundData(true); // Consumes override logic
    globalRound = {
      status: 'WAITING',
      roundId: data.roundId,
      startTime: Date.now() + 8000, // 8s countdown
      crashPoint: data.crashPoint,
      crashReason: data.crashReason,
      lastResetTime: Date.now()
    };
    console.log(`[LOOP] New Round: ${globalRound.crashPoint}x (ID: ${globalRound.roundId})`);
    broadcastGlobalState();
  }

  // Use a stable heartbeat for the global game loop
  setInterval(async () => {
    const now = Date.now();
    if (globalRound.status === 'WAITING' && now >= globalRound.startTime) {
      globalRound.status = 'IN_PROGRESS';
      // Adjust startTime to be exactly 'now' for synced calculating
      globalRound.startTime = now; 
      broadcastGlobalState();
    } else if (globalRound.status === 'IN_PROGRESS') {
      const elapsed = (now - globalRound.startTime) / 1000;
      // Standard crash multiplier formula: 1.00 * e^(0.06 * t)
      const currentMult = Math.pow(Math.E, 0.06 * elapsed);
      if (currentMult >= globalRound.crashPoint) {
        globalRound.status = 'CRASHED';
        globalRound.lastResetTime = now;
        broadcastGlobalState();
        
        // Save to Global History
        if (db) {
          db.collection('globalHistory').doc(globalRound.roundId).set({
            id: globalRound.roundId,
            multiplier: globalRound.crashPoint,
            createdAt: now,
            timestamp: FieldValue.serverTimestamp()
          }).catch(console.error);
        }
      }
    } else if (globalRound.status === 'CRASHED' && now >= globalRound.lastResetTime + 4000) {
      startNewRound();
    }
  }, 100);

  // Initialize first round
  setTimeout(startNewRound, 2000);

  function generateRoundData(shouldConsume = false) {
    let crashPoint: number;
    let crashReason: string;
    let isOverride = false;
    const roundId = Date.now().toString();

    if (nextForcedCrash !== null) {
      crashPoint = nextForcedCrash;
      crashReason = nextForcedReason || "Admin Override 🛠️";
      isOverride = true;
      if (shouldConsume) {
        nextForcedCrash = null;
        nextForcedReason = null;
      }
    } else {
      const rand = Math.random();
      let cp;
      if (rand < 0.5) cp = 1.00 + (Math.random() * 1.00);
      else if (rand < 0.8) cp = 2.00 + (Math.random() * 3.00);
      else cp = 5.00 + (Math.random() * 5.00);
      crashPoint = parseFloat(cp.toFixed(2));
      crashReason = crashReasons[Math.floor(Math.random() * crashReasons.length)];
    }
    return { roundId, crashPoint, crashReason, isOverride };
  }

  // --- VITE / STATIC ---
  app.use("/api/*", (req, res) => res.status(404).json({ error: "API route not found" }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();
