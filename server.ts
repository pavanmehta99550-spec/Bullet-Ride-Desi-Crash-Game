import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import fs from "fs";

// Load Firebase Config for Admin SDK
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON parsing middleware
  app.use(express.json());

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

  let nextForcedCrash: number | null = null;
  let nextForcedReason: string | null = null;

  // Default coins
  let cryptoCoins = [
    { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A', address: 'bc1qxy2kgdy6jr...789' },
    { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', address: '0x71C765...d897' },
    { name: 'Tether', symbol: 'USDT', color: '#26A17B', address: '0x26A17B...e456' },
    { name: 'Solana', symbol: 'SOL', color: '#14F195', address: '6x5d...f678' },
    { name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633', address: 'D8vB...m90l' }
  ];

  // Load coins from Firestore on startup
  try {
    const configDoc = await db.collection('admin').doc('settings').get();
    if (configDoc.exists && configDoc.data()?.cryptoCoins) {
      cryptoCoins = configDoc.data()?.cryptoCoins;
      console.log("Loaded crypto addresses from Firestore");
    }
  } catch (err) {
    console.error("Failed to load settings from Firestore, using defaults", err);
  }

  let withdrawalRequests: any[] = [];
  let depositRequests: any[] = [];
  let userNotifications: any[] = [];

  app.get("/api/config/crypto", (req, res) => {
    res.json(cryptoCoins);
  });

  app.post("/api/admin/set-crypto", async (req, res) => {
    const { coins } = req.body;
    if (coins && Array.isArray(coins)) {
      cryptoCoins = coins;
      try {
        await db.collection('admin').doc('settings').set({ 
          cryptoCoins: coins,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ status: "ok", message: "Crypto addresses saved to Database! ✅" });
      } catch (err) {
        res.status(500).json({ error: "Failed to save to Database" });
      }
    } else {
      res.status(400).json({ error: "Invalid coins data" });
    }
  });

  app.post("/api/deposit/request", (req, res) => {
    const { amount, coin, transactionId, userId } = req.body;
    if (!amount || !coin || !transactionId || !userId) {
      return res.status(400).json({ error: "Missing deposit details" });
    }

    const request = {
      id: Date.now(),
      amount: parseFloat(amount),
      coin,
      transactionId,
      userId,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    depositRequests.push(request);
    res.json({ status: "ok", message: "Deposit request submitted! Please wait for approval." });
  });

  app.get("/api/admin/deposits", (req, res) => {
    res.json(depositRequests);
  });

  app.post("/api/admin/deposit/approve", (req, res) => {
    const { requestId } = req.body;
    const request = depositRequests.find(r => r.id === requestId);
    
    if (request) {
      request.status = 'approved';
      const notification = {
        id: Date.now(),
        type: 'deposit_approved',
        amount: request.amount,
        coin: request.coin,
        userId: request.userId,
        timestamp: new Date().toISOString(),
        message: `Deposit of ₹${request.amount} via ${request.coin.symbol} was successful! Balance added.`
      };
      userNotifications.push(notification);
      res.json({ status: "ok", message: "Deposit approved!" });
    } else {
      res.status(404).json({ error: "Request not found" });
    }
  });

  app.post("/api/withdraw/request", (req, res) => {
    const { amount, coin, userAddress, userId } = req.body;
    if (!amount || !coin || !userAddress || !userId) {
      return res.status(400).json({ error: "Missing withdrawal details" });
    }

    const request = {
      id: Date.now(),
      amount: parseFloat(amount),
      coin,
      userAddress,
      userId,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    withdrawalRequests.push(request);
    res.json({ status: "ok", message: "Withdrawal request submitted!" });
  });

  app.get("/api/admin/withdrawals", (req, res) => {
    res.json(withdrawalRequests);
  });

  app.post("/api/admin/withdraw/approve", (req, res) => {
    const { requestId } = req.body;
    const request = withdrawalRequests.find(r => r.id === requestId);
    
    if (request) {
      request.status = 'approved';
      const notification = {
        id: Date.now(),
        type: 'withdrawal_approved',
        amount: request.amount,
        coin: request.coin,
        timestamp: new Date().toISOString(),
        message: `Withdrawal of ${request.amount} ${request.coin.symbol} was successful!`
      };
      userNotifications.push(notification);
      res.json({ status: "ok", message: "Withdrawal approved!" });
    } else {
      res.status(404).json({ error: "Request not found" });
    }
  });

  app.get("/api/user/notifications", (req, res) => {
    res.json(userNotifications);
    // Optional: Clear notifications after fetching?
    // userNotifications = [];
  });

  app.post("/api/admin/set-crash", (req, res) => {
    const { crashPoint, crashReason } = req.body;
    if (crashPoint) {
      nextForcedCrash = parseFloat(crashPoint);
      nextForcedReason = crashReason || "Admin Override 🛠️";
      res.json({ status: "ok", message: `Next crash set to ${nextForcedCrash}x` });
    } else {
      res.status(400).json({ error: "Missing crashPoint" });
    }
  });

  // The requested backend endpoint
  app.post("/api/round/start", (req, res) => {
    let finalCrashPoint: number;
    let finalCrashReason: string;

    if (nextForcedCrash !== null) {
      finalCrashPoint = nextForcedCrash;
      finalCrashReason = nextForcedReason || "Admin Override 🛠️";
      nextForcedCrash = null;
      nextForcedReason = null;
    } else {
      const rand = Math.random();
      let crashPoint;
      if (rand < 0.5) {
        crashPoint = 1.00 + (Math.random() * 1.00);
      } else if (rand < 0.8) {
        crashPoint = 2.00 + (Math.random() * 3.00);
      } else {
        crashPoint = 5.00 + (Math.random() * 5.00);
      }
      finalCrashPoint = parseFloat(crashPoint.toFixed(2));
      finalCrashReason = crashReasons[Math.floor(Math.random() * crashReasons.length)];
    }
    
    res.json({
      crashPoint: finalCrashPoint,
      crashReason: finalCrashReason
    });
  });

  // Also support GET for easier testing
  app.get("/api/round/start", (req, res) => {
    const crashPointStr = (Math.random() * 9.00 + 1.00).toFixed(2);
    const crashPoint = parseFloat(crashPointStr);
    const crashReason = crashReasons[Math.floor(Math.random() * crashReasons.length)];
    res.json({ crashPoint, crashReason });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
