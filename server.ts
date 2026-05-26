import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- STATE VARIABLES (Must be at top for hoisting/scope safety) ---
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

  // Initialize Firebase Admin
  if (!admin.apps.length && firebaseConfig.projectId) {
    try {
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    } catch (err) {
      console.error("Firebase Admin initialization failed:", err);
    }
  }

  const db = admin.apps.length ? admin.firestore() : null;

  // Sync state from Firestore (Non-blocking)
  if (db) {
    // Sync coins
    db.collection('admin').doc('settings').get().then(doc => {
      if (doc.exists && doc.data()?.cryptoCoins) cryptoCoins = doc.data()?.cryptoCoins;
    }).catch(console.error);

    // Sync other lists
    const fetchList = (coll: string, target: any[]) => {
      db.collection(coll).get().then(snap => {
        const list: any[] = [];
        snap.forEach(d => list.push(d.data()));
        list.sort((a, b) => a.id - b.id);
        target.length = 0;
        target.push(...list);
      }).catch(console.error);
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
    
    // Immediately update the next round state so everyone gets it on next prefetch
    nextRoundState = generateRoundData(false);
    
    res.json({ status: "ok", message: `Physics Modified: Next Ride will crash at ${nextForcedCrash}x! ✅` });
  });

  app.post("/api/admin/consume-override", (req, res) => {
    nextForcedCrash = null;
    nextForcedReason = null;
    nextRoundState = generateRoundData(false);
    res.json({ status: "ok", message: "Override cleared!" });
  });

  // --- CONFIG ROUTES ---
  app.get("/api/config/crypto", (req, res) => res.json(cryptoCoins));
  app.post("/api/admin/set-crypto", async (req, res) => {
    const { coins } = req.body;
    if (coins && Array.isArray(coins)) {
      cryptoCoins = coins;
      if (db) await db.collection('admin').doc('settings').set({ cryptoCoins: coins, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
    const snap = await db.collection("users").get();
    const list: any[] = [];
    snap.forEach(doc => list.push({ ...doc.data(), uid: doc.id }));
    res.json(list);
  });

  app.post("/api/admin/user/update-balance", async (req, res) => {
    const { userId, amountToAdd, coinSymbol } = req.body;
    if (db) {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      let coinBalances = userDoc.exists ? (userDoc.data()?.coinBalances || {}) : {};
      const symbol = coinSymbol || "INR";
      coinBalances[symbol] = parseFloat((parseFloat(amountToAdd)).toFixed(8));
      await userRef.set({ uid: userId, coinBalances, activeCoin: symbol, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    res.json({ status: "ok", message: "Balance reset!" });
  });

  app.post("/api/admin/user/toggle-block", async (req, res) => {
    const { userId, isBlocked } = req.body;
    if (db) await db.collection("users").doc(userId).set({ isBlocked, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ status: "ok", message: "User status updated!" });
  });

  // --- GAME LOGIC ---
  let nextRoundState = generateRoundData(false);

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

  app.post("/api/round/get-data", (req, res) => {
    // Return the stable next round state
    res.json(nextRoundState);
  });

  app.post("/api/round/start", (req, res) => {
    // If we have an override, we must consume it.
    // If not, we can either return nextRoundState or generate new one.
    const result = { ...nextRoundState };
    // Consume the override logic
    if (result.isOverride) {
        nextForcedCrash = null;
        nextForcedReason = null;
    }
    // Prepare next round for future calls
    nextRoundState = generateRoundData(false);
    res.json(result);
  });

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
