/**
 * Firebase Cloud Functions (v2) - Referral & Bonus System
 * 
 * This file contains the safe, production-ready serverless functions to handle 
 * user signup events, validate referrers, and atomically credit promotional 
 * bonuses using Firestore Transactions.
 * 
 * Deployment: Use 'firebase deploy --only functions'
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Admin SDK if not already done
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Trigger: Runs atomically whenever a new user profile document is created.
 * Detects if the user has a valid 'referredBy' UID, validates it,
 * and distributes the 500/1000 promotional points using a transaction.
 */
exports.handleNewUserReferral = onDocumentCreated("users/{userId}", async (event) => {
  const newUserSnap = event.data;
  if (!newUserSnap) {
    console.log("No snapshot data available.");
    return null;
  }

  const newUserData = newUserSnap.data();
  const newUserId = event.params.userId;
  const referrerId = newUserData.referredBy;

  // If there is no referrer specified, or it has already been processed, skip
  if (!referrerId || typeof referrerId !== "string" || referrerId.trim() === "") {
    console.log(`User ${newUserId} registered without a referral.`);
    return null;
  }

  // Self-referral protection
  if (referrerId === newUserId) {
    console.warn(`User ${newUserId} attempted self-referral.`);
    return null;
  }

  if (newUserData.referralPaid === true) {
    console.log(`Referral for ${newUserId} has already been paid.`);
    return null;
  }

  const referrerRef = db.collection("users").doc(referrerId);
  const newUserRef = db.collection("users").doc(newUserId);

  try {
    // Execute atomic transaction
    await db.runTransaction(async (transaction) => {
      // 1. Fetch both documents inside the transaction (all reads must come before writes)
      const referrerDoc = await transaction.get(referrerRef);
      const newUserDoc = await transaction.get(newUserRef);

      if (!referrerDoc.exists) {
        throw new Error(`Referrer user ${referrerId} does not exist.`);
      }

      // Re-verify payload state within transactional context
      const freshNewUserData = newUserDoc.data() || {};
      if (freshNewUserData.referralPaid === true) {
        throw new Error(`Referral bonus already awarded.`);
      }

      const freshReferrerData = referrerDoc.data() || {};

      // Calculate new bonus balances
      const currentReferrerBonus = freshReferrerData.bonus_balance || 0;
      const currentNewUserBonus = freshNewUserData.bonus_balance || 0;

      const updatedReferrerBonus = currentReferrerBonus + 500;
      const updatedNewUserBonus = currentNewUserBonus + 1000;

      // 2. Perform updates atomically
      transaction.update(referrerRef, {
        bonus_balance: updatedReferrerBonus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(newUserRef, {
        bonus_balance: updatedNewUserBonus,
        referralPaid: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Log the referral entry for auditing and transparency
      const referralLogRef = db.collection("referral_logs").doc(`${referrerId}_${newUserId}`);
      transaction.set(referralLogRef, {
        referrerUid: referrerId,
        newUserId: newUserId,
        referrerEmail: freshReferrerData.email || "",
        newUserEmail: freshNewUserData.email || "",
        referrerBonus: 500,
        newUserBonus: 1000,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // 4. Create in-app notifications for both users
      const refNotificationRef = db.collection("notifications").doc(`ref_bonus_${Date.now()}_${referrerId}`);
      transaction.set(refNotificationRef, {
        id: refNotificationRef.id,
        userId: referrerId,
        type: "referral_bonus",
        amount: 500,
        coin: { name: "Referral Bonus", symbol: "BONUS", color: "#FFD700" },
        timestamp: new Date().toISOString(),
        message: `Congratulations! ${freshNewUserData.displayName || "A new player"} signed up using your referral link. You received 500 bonus points! 🎁`
      });

      const newNotificationRef = db.collection("notifications").doc(`new_bonus_${Date.now()}_${newUserId}`);
      transaction.set(newNotificationRef, {
        id: newNotificationRef.id,
        userId: newUserId,
        type: "signup_bonus",
        amount: 1000,
        coin: { name: "Signup Bonus", symbol: "BONUS", color: "#FFD700" },
        timestamp: new Date().toISOString(),
        message: `Welcome! You earned 1000 signup bonus points for joining via a referral link. Play and enjoy! 🚀`
      });

      console.log(`Atomic transaction success: User ${newUserId} referred by ${referrerId}. 500 to referrer, 1000 to new user.`);
    });
  } catch (error) {
    console.error("Referral transaction failed:", error.message);
  }

  return null;
});

/**
 * Callable HTTPS Function/Endpoint to validate withdrawal requests.
 * Checks whether user has made a successful 'deposit' (has_deposited: true)
 * and guarantees they cannot withdraw their 'bonus_balance' field.
 */
exports.validateWithdrawalEligibility = onCall(async (request) => {
  // Ensure the request is coming from an authenticated UI
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Aap authenticated nahi hain! Pehle login karein.");
  }

  const userId = request.auth.uid;
  const withdrawAmount = request.data.amount;

  if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
    throw new HttpsError("invalid-argument", "Valid amount dalo bhai!");
  }

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User profile nahi mila!");
  }

  const userData = userDoc.data();

  // Condition 1: Must have made at least one successful deposit
  if (userData.has_deposited !== true) {
    throw new HttpsError(
      "failed-precondition", 
      "Withdrawal unlocked nahi hai! Pehle kam se kam ek deposit/top-up transaction karein. (Please make at least one successful deposit first)."
    );
  }

  // Condition 2: Users cannot withdraw their bonus balance
  const currentCoin = userData.activeCoin || "INR";
  const coinBalance = (userData.coinBalances && userData.coinBalances[currentCoin]) || 0;
  const bonusBalance = userData.bonus_balance || 0;

  // Main active trade/game Balance should only permit withdrawals of non-bonus funds
  // Let's verify that the withdrawAmount requested doesn't exceed the safe withdrawable cash
  if (withdrawAmount > coinBalance) {
    throw new HttpsError("failed-precondition", "Aapke paas balance kam hai!");
  }

  return {
    isEligible: true,
    message: "Withdrawal parameters verified! Sahi chal raha hai.",
  };
});
