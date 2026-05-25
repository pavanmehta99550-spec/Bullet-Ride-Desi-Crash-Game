import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON parsing middleware early
  app.use(express.json());

  // Add Health Check early
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Load Firebase Config for Admin SDK
  let firebaseConfig: any = {};
  try {
    const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(firebaseConfigPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
      console.log("Firebase config loaded for Admin SDK");
    } else {
      console.warn("firebase-applet-config.json not found, using environment defaults");
    }
  } catch (err) {
    console.error("Failed to load firebase-applet-config.json:", err);
  }

  // Initialize Firebase Admin
  if (!admin.apps.length && firebaseConfig.projectId) {
    try {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log("Firebase Admin initialized");
    } catch (err) {
      console.error("Firebase Admin initialization failed:", err);
    }
  }

  const db = admin.apps.length ? admin.firestore() : null;

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

  let withdrawalRequests: any[] = [];
  let depositRequests: any[] = [];
  let userNotifications: any[] = [];

  // Load coins, deposits, withdrawals, and notifications from Firestore on startup - Non-blocking
  if (db) {
    db.collection('admin').doc('settings').get().then(configDoc => {
      if (configDoc.exists && configDoc.data()?.cryptoCoins) {
        const docCoins = configDoc.data()?.cryptoCoins;
        if (Array.isArray(docCoins) && docCoins.length > 0) {
          cryptoCoins = docCoins;
          console.log("Loaded crypto addresses from Firestore");
        }
      } else {
        // Doc doesn't exist or doesn't have cryptoCoins - seed defaults!
        db.collection('admin').doc('settings').set({
          cryptoCoins: cryptoCoins,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
          console.log("Seeded default crypto addresses to Firestore settings doc");
        }).catch(err => {
          console.error("Failed to seed default settings in Firestore:", err);
        });
      }
    }).catch(err => {
      console.error("Failed to load settings from Firestore, using defaults", err);
    });

    db.collection('deposits').get().then(snap => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      list.sort((a, b) => a.id - b.id);
      depositRequests = list;
      console.log(`Loaded ${list.length} deposits from Firestore`);
    }).catch(err => {
      console.error("Failed to load deposits from Firestore:", err);
    });

    db.collection('withdrawals').get().then(snap => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      list.sort((a, b) => a.id - b.id);
      withdrawalRequests = list;
      console.log(`Loaded ${list.length} withdrawals from Firestore`);
    }).catch(err => {
      console.error("Failed to load withdrawals from Firestore:", err);
    });

    db.collection('notifications').get().then(snap => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      list.sort((a, b) => a.id - b.id);
      userNotifications = list;
      console.log(`Loaded ${list.length} notifications from Firestore`);
    }).catch(err => {
      console.error("Failed to load notifications from Firestore:", err);
    });
  }

  app.get("/api/config/crypto", (req, res) => {
    res.json(cryptoCoins);
  });

  app.post("/api/admin/set-crypto", async (req, res) => {
    const { coins } = req.body;
    if (coins && Array.isArray(coins)) {
      cryptoCoins = coins;
      if (!db) {
        return res.json({ status: "ok", message: "Crypto addresses saved in memory! (Database offline) ✅" });
      }
      try {
        await db.collection('admin').doc('settings').set({ 
          cryptoCoins: coins,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ status: "ok", message: "Crypto addresses saved to Database! ✅" });
      } catch (err) {
        console.error("Firestore save error:", err);
        res.json({ status: "ok", message: "Crypto addresses saved in memory! (Database error) ✅" });
      }
    } else {
      res.status(400).json({ error: "Invalid coins data" });
    }
  });

  app.post("/api/deposit/request", async (req, res) => {
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

    if (db) {
      try {
        await db.collection('deposits').doc(request.id.toString()).set(request);
      } catch (err) {
        console.error("Failed to save deposit request in Firestore:", err);
      }
    }

    res.json({ status: "ok", message: "Deposit request submitted! Please wait for approval." });
  });

  app.get("/api/admin/deposits", (req, res) => {
    res.json(depositRequests);
  });

  app.post("/api/admin/deposit/approve", async (req, res) => {
    const { requestId } = req.body;
    const request = depositRequests.find(r => r.id === requestId);
    
    let dbSuccess = false;
    if (db) {
      try {
        const depRef = db.collection('deposits').doc(requestId.toString());
        const depDoc = await depRef.get();
        if (depDoc.exists) {
          const depData = depDoc.data();
          if (depData && depData.status === 'pending') {
            await depRef.update({ status: 'approved' });
            
            // Increment the user's permanent walletBalance in Firestore
            const userRef = db.collection('users').doc(depData.userId);
            const userDoc = await userRef.get();
            
            const coinSymbol = depData && depData.coin 
              ? (typeof depData.coin === 'string' ? depData.coin : (depData.coin.symbol || "INR"))
              : "INR";

            let coinBalances: Record<string, number> = { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 };
            if (userDoc.exists) {
              const data = userDoc.data();
              if (data?.coinBalances) {
                coinBalances = { ...coinBalances, ...data.coinBalances };
              } else if (data?.walletBalance !== undefined) {
                coinBalances.INR = data.walletBalance || 0;
              }
            }

            const currentSymbolBalance = coinBalances[coinSymbol] || 0;
            coinBalances[coinSymbol] = parseFloat((currentSymbolBalance + depData.amount).toFixed(8));

            await userRef.set({
              uid: depData.userId,
              walletBalance: coinBalances[coinSymbol],
              coinBalances: coinBalances,
              activeCoin: coinSymbol,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`Incremented Firestore balance for user ${depData.userId} by ${depData.amount} ${coinSymbol}`);
            
            const notification = {
              id: Date.now(),
              type: 'deposit_approved',
              amount: depData.amount,
              coin: depData.coin,
              userId: depData.userId,
              timestamp: new Date().toISOString(),
              message: `Deposit of ₹${depData.amount} via ${depData.coin.symbol} was successful! Balance added.`
            };
            await db.collection('notifications').doc(notification.id.toString()).set(notification);
            
            // Sync local memory data
            if (request) request.status = 'approved';
            depositRequests = depositRequests.map(r => r.id === requestId ? { ...r, status: 'approved' } : r);
            userNotifications.push(notification);

            dbSuccess = true;
            return res.json({ status: "ok", message: "Deposit approved!" });
          } else {
            return res.status(400).json({ error: "Deposit already processed or not pending" });
          }
        }
      } catch (err) {
        console.warn("Bypassing server Firestore process (due to permission/connection error):", err);
      }
    }

    if (!dbSuccess && request) {
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
      res.json({ status: "ok", message: "Deposit approved (in-memory with client sync)!" });
    } else if (!dbSuccess) {
      res.status(404).json({ error: "Request not found" });
    }
  });

  app.post("/api/withdraw/request", async (req, res) => {
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

    if (db) {
      try {
        await db.collection('withdrawals').doc(request.id.toString()).set(request);
      } catch (err) {
        console.error("Failed to save withdrawal in Firestore:", err);
      }
    }

    res.json({ status: "ok", message: "Withdrawal request submitted!" });
  });

  app.get("/api/admin/withdrawals", (req, res) => {
    res.json(withdrawalRequests);
  });

  app.post("/api/admin/withdraw/approve", async (req, res) => {
    const { requestId } = req.body;
    const request = withdrawalRequests.find(r => r.id === requestId);
    
    let dbSuccess = false;
    if (db) {
      try {
        const witRef = db.collection('withdrawals').doc(requestId.toString());
        const witDoc = await witRef.get();
        if (witDoc.exists) {
          const witData = witDoc.data();
          if (witData && witData.status === 'pending') {
            await witRef.update({ status: 'approved' });
            
            const notification = {
              id: Date.now(),
              type: 'withdrawal_approved',
              amount: witData.amount,
              coin: witData.coin,
              userId: witData.userId,
              timestamp: new Date().toISOString(),
              message: `Withdrawal of ${witData.amount} ${witData.coin.symbol} was successful!`
            };
            await db.collection('notifications').doc(notification.id.toString()).set(notification);

            if (request) request.status = 'approved';
            withdrawalRequests = withdrawalRequests.map(r => r.id === requestId ? { ...r, status: 'approved' } : r);
            userNotifications.push(notification);

            dbSuccess = true;
            return res.json({ status: "ok", message: "Withdrawal approved!" });
          } else {
            return res.status(400).json({ error: "Withdrawal already processed or not pending" });
          }
        }
      } catch (err) {
        console.warn("Withdrawal approval Firestore error (bypassing):", err);
      }
    }

    if (!dbSuccess && request) {
      request.status = 'approved';
      const notification = {
        id: Date.now(),
        type: 'withdrawal_approved',
        amount: request.amount,
        coin: request.coin,
        userId: request.userId,
        timestamp: new Date().toISOString(),
        message: `Withdrawal of ${request.amount} ${request.coin.symbol} was successful!`
      };
      userNotifications.push(notification);
      res.json({ status: "ok", message: "Withdrawal approved (in-memory with client sync)!" });
    } else if (!dbSuccess) {
      res.status(404).json({ error: "Request not found" });
    }
  });

  app.get("/api/user/notifications", (req, res) => {
    res.json(userNotifications);
  });

  // Fetch all registered users in Firestore (Admin only)
  app.get("/api/admin/users", async (req, res) => {
    if (!db) {
      return res.json([]);
    }
    try {
      const snap = await db.collection("users").get();
      const list: any[] = [];
      snap.forEach(doc => {
        list.push({ ...doc.data(), uid: doc.id });
      });
      res.json(list);
    } catch (err: any) {
      console.warn("Bypassing server users list Firestore fetch (permission/connection error):", err);
      res.json([]);
    }
  });

  // Manually add balance to a specific user (Admin only)
  app.post("/api/admin/user/update-balance", async (req, res) => {
    const { userId, amountToAdd, coinSymbol } = req.body;
    if (!userId || amountToAdd === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const val = parseFloat(amountToAdd);
    if (isNaN(val)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let dbSuccess = false;
    if (db) {
      try {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        
        let coinBalances: Record<string, number> = { INR: 0, BTC: 0, ETH: 0, USDT: 0, SOL: 0, DOGE: 0 };
        if (userDoc.exists) {
          const data = userDoc.data();
          if (data?.coinBalances) {
            coinBalances = { ...coinBalances, ...data.coinBalances };
          } else if (data?.walletBalance !== undefined) {
            coinBalances.INR = data.walletBalance || 0;
          }
        }

        const symbol = coinSymbol || "INR";
        const currentSymbolBalance = coinBalances[symbol] || 0;
        coinBalances[symbol] = parseFloat(val.toFixed(8));

        await userRef.set({
          uid: userId,
          walletBalance: coinBalances[symbol],
          coinBalances: coinBalances,
          activeCoin: symbol,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const coinDetails: Record<string, {name: string, color: string}> = {
          'BTC': { name: 'Bitcoin', color: '#F7931A' },
          'ETH': { name: 'Ethereum', color: '#627EEA' },
          'USDT': { name: 'Tether', color: '#26A17B' },
          'SOL': { name: 'Solana', color: '#14F195' },
          'DOGE': { name: 'Dogecoin', color: '#C2A633' },
          'INR': { name: 'Direct Fuel Balance', color: '#FFD700' }
        };

        const targetCoin = coinSymbol && coinDetails[coinSymbol] 
          ? { name: coinDetails[coinSymbol].name, symbol: coinSymbol, color: coinDetails[coinSymbol].color }
          : { name: 'Direct Fuel Balance', symbol: 'INR', color: '#FFD700' };

        // Push real-time deposit approval notification to trigger auto-balance update in User UI
        const notification = {
          id: Date.now(),
          type: 'deposit_approved',
          amount: val,
          coin: targetCoin,
          userId: userId,
          timestamp: new Date().toISOString(),
          message: `Admin has added ${val} balance directly to your account using ${targetCoin.symbol}! ✅`
        };
        await db.collection('notifications').doc(notification.id.toString()).set(notification);
        userNotifications.push(notification);

        console.log(`Successfully added ₹${val} balance to user ${userId} using ${targetCoin.symbol}`);
        dbSuccess = true;
        return res.json({ status: "ok", message: `Directly added ${val} to user's wallet using ${targetCoin.symbol}!` });
      } catch (err) {
        console.warn("Direct balance addition Firestore error (bypassing):", err);
      }
    }

    if (!dbSuccess) {
      const coinDetails: Record<string, {name: string, color: string}> = {
        'BTC': { name: 'Bitcoin', color: '#F7931A' },
        'ETH': { name: 'Ethereum', color: '#627EEA' },
        'USDT': { name: 'Tether', color: '#26A17B' },
        'SOL': { name: 'Solana', color: '#14F195' },
        'DOGE': { name: 'Dogecoin', color: '#C2A633' },
        'INR': { name: 'Direct Fuel Balance', color: '#FFD700' }
      };

      const targetCoin = coinSymbol && coinDetails[coinSymbol] 
        ? { name: coinDetails[coinSymbol].name, symbol: coinSymbol, color: coinDetails[coinSymbol].color }
        : { name: 'Direct Fuel Balance', symbol: 'INR', color: '#FFD700' };

      const notification = {
        id: Date.now(),
        type: 'deposit_approved',
        amount: val,
        coin: targetCoin,
        userId: userId,
        timestamp: new Date().toISOString(),
        message: `Admin has added ${val} balance directly to your account using ${targetCoin.symbol}! ✅`
      };
      userNotifications.push(notification);

      console.log(`Muted Firestore direct balance addition fallback triggered for ${userId} with ${val} ${targetCoin.symbol}`);
      res.json({ status: "ok", message: `Directly added ${val} to user's wallet in memory (client-side update active) using ${targetCoin.symbol}!` });
    }
  });

  // Reset user's balance to 0 (Admin only)
  app.post("/api/admin/user/reset-balance", async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let dbSuccess = false;
    if (db) {
      try {
        const userRef = db.collection("users").doc(userId);
        const resetBalances = {
          INR: 0,
          BTC: 0,
          ETH: 0,
          USDT: 0,
          SOL: 0,
          DOGE: 0
        };

        await userRef.set({
          walletBalance: 0,
          coinBalances: resetBalances,
          activeCoin: 'INR',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Push real-time notification
        const notification = {
          id: Date.now(),
          type: 'balance_reset',
          amount: 0,
          coin: { name: 'Admin Direct Cash', symbol: 'INR', color: '#FFD700' },
          userId: userId,
          timestamp: new Date().toISOString(),
          message: `Admin has reset your fuel balance to 0 due to correction. 🛠️`
        };
        await db.collection('notifications').doc(notification.id.toString()).set(notification);
        userNotifications.push(notification);

        console.log(`Successfully reset balance to 0 for user ${userId}`);
        dbSuccess = true;
        return res.json({ status: "ok", message: `Successfully reset user ${userId} balance to 0!` });
      } catch (err) {
        console.warn("Direct balance reset Firestore error (bypassing):", err);
      }
    }
    
    if (!dbSuccess) {
      const notification = {
        id: Date.now(),
        type: 'balance_reset',
        amount: 0,
        coin: { name: 'Admin Direct Cash', symbol: 'INR', color: '#FFD700' },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: `Admin has reset your fuel balance to 0 due to correction. 🛠️`
      };
      userNotifications.push(notification);
      console.log(`Muted Firestore direct balance reset fallback triggered for ${userId}`);
      res.json({ status: "ok", message: `Successfully reset user ${userId} balance to 0 (client sync)!` });
    }
  });

  // Toggle block/unblock status for a user (Admin only)
  app.post("/api/admin/user/toggle-block", async (req, res) => {
    const { userId, isBlocked } = req.body;
    if (!userId || isBlocked === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let dbSuccess = false;
    if (db) {
      try {
        console.log(`Admin toggle block for user ${userId} to ${isBlocked}`);
        const userRef = db.collection("users").doc(userId);
        await userRef.set({
          isBlocked: !!isBlocked,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`Firestore updated for user ${userId}`);

        // Push real-time notification
        const notification = {
          id: Date.now(),
          type: 'account_status',
          amount: 0,
          coin: { name: 'System Security', symbol: 'SEC', color: '#ef4444' },
          userId: userId,
          timestamp: new Date().toISOString(),
          message: isBlocked 
            ? `Your account has been blocked by the administrator. 🚫 Please contact support.` 
            : `Your account has been successfully unblocked by the administrator. ✅`
        };
        await db.collection('notifications').doc(notification.id.toString()).set(notification);
        userNotifications.push(notification);

        console.log(`Successfully updated blocked status to ${isBlocked} for user ${userId}`);
        dbSuccess = true;
        return res.json({ status: "ok", message: `Successfully updated block status to ${isBlocked} for user ${userId}!` });
      } catch (err) {
        console.error("Direct change block status Firestore error:", err);
      }
    }
    
    if (!dbSuccess) {
      const notification = {
        id: Date.now(),
        type: 'account_status',
        amount: 0,
        coin: { name: 'System Security', symbol: 'SEC', color: '#ef4444' },
        userId: userId,
        timestamp: new Date().toISOString(),
        message: isBlocked 
          ? `Your account has been blocked by the administrator. 🚫 Please contact support.` 
          : `Your account has been successfully unblocked by the administrator. ✅`
      };
      userNotifications.push(notification);
      console.log(`Muted Firestore toggle block fallback triggered for ${userId}`);
      res.json({ status: "ok", message: `Successfully updated block status to ${isBlocked} (client sync)!` });
    }
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

  // API 404 handler - MUST be before Vite/Static fallback
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.originalUrl} not found` });
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
