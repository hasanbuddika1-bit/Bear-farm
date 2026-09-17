import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

const BOT_TOKEN = "8994723606:AAFY0fncCZmFZun_k3aavzjxFZMRpiRFKQc";
const ADMIN_TELEGRAM_ID = "5419054691";
const PAYMENT_CHANNEL_ID = "@bearfarm_pay_out"; // Channel handle or ID

// 1. TELEGRAM INIT DATA VERIFICATION & AUTH TOKEN CREATION
export const authenticateTelegramUser = functions.https.onCall(async (data, context) => {
  const { initData, referrerId } = data;
  if (!initData) throw new functions.https.HttpsError("invalid-argument", "Missing initData");

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  urlParams.delete("hash");

  // Sort parameters alphabetically
  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, val]) => `${key}=${val}`)
    .sort()
    .join("\n");

  // HMAC Validation
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (calculatedHash !== hash) {
    throw new functions.https.HttpsError("unauthenticated", "Invalid Telegram signature");
  }

  const userData = JSON.parse(urlParams.get("user") || "{}");
  const telegramId = String(userData.id);
  const firebaseUid = `telegram:${telegramId}`;

  const userRef = db.collection("users").doc(firebaseUid);
  const userSnap = await userRef.get();

  if (!userSnap.exists()) {
    // New User Setup & Anti-Multi Account Logic
    await db.runTransaction(async (transaction) => {
      transaction.set(userRef, {
        telegramId: telegramId,
        username: userData.username || userData.first_name || "Bear Farmer",
        balance: 0,
        miningState: { active: false, startTime: null },
        dailyClaim: { streak: 0, lastClaimDate: null },
        walletAddress: null,
        isSuspended: false,
        referredBy: referrerId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Handle Referral Setup
      if (referrerId && referrerId !== telegramId) {
        const refUserRef = db.collection("users").doc(`telegram:${referrerId}`);
        const refSnap = await transaction.get(refUserRef);
        if (refSnap.exists()) {
          const refLedgerRef = db.collection("ledgers").doc();
          transaction.set(refLedgerRef, {
            userId: `telegram:${referrerId}`,
            type: "REFERRAL_JOIN",
            amount: 200,
            status: "PENDING_CLAIM",
            referredId: telegramId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });

    // Telegram Bot Notify Admin for New User
    await sendTelegramMessage(ADMIN_TELEGRAM_ID, `🆕 *New Farmer Joined!*\nUser: @${userData.username || telegramId}\nID: \`${telegramId}\``);
  }

  // Create Firebase Custom Token
  const customClaims = telegramId === ADMIN_TELEGRAM_ID ? { admin: true } : {};
  const customToken = await admin.auth().createCustomToken(firebaseUid, customClaims);

  return { token: customToken };
});

// 2. MINING ENGINE (Hourly Claiming Logic)
export const claimMiningReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
  const uid = context.auth.uid;
  const userRef = db.collection("users").doc(uid);

  return await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new functions.https.HttpsError("not-found", "User missing");

    const userData = userSnap.data()!;
    if (userData.isSuspended) throw new functions.https.HttpsError("permission-denied", "Account Suspended");

    const now = Date.now();
    const mining = userData.miningState;

    if (!mining.active) {
      // Start Mining
      transaction.update(userRef, {
        "miningState.active": true,
        "miningState.startTime": now
      });
      return { status: "STARTED", message: "Mining started for 1 hour!" };
    } else {
      // Claim Mining (Must be after 1 Hour)
      const duration = now - mining.startTime;
      if (duration < 3600000) { // 1 Hour in ms
        throw new functions.https.HttpsError("failed-precondition", "Mining cycle not complete");
      }

      const rewardAmount = 100; // Can be configured dynamic via admin system config doc
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(rewardAmount),
        "miningState.active": false,
        "miningState.startTime": null
      });

      // Telegram Bot Notification to user
      const telegramId = uid.replace("telegram:", "");
      await sendTelegramMessage(telegramId, `🌾 *Mining Completed!*\nYou earned *${rewardAmount} Tokens*! Tap below to start next cycle.`, [
        [{ text: "🌾 Open Mini App", url: "https://t.me/Bear_Farmbot/earn" }]
      ]);

      return { status: "CLAIMED", amount: rewardAmount };
    }
  });
});

// 3. WITHDRAWAL REQUEST & TELEGRAM NOTIFICATION SYSTEM
export const approveWithdrawal = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin Access Required");
  }

  const { requestId, txId } = data;
  const withdrawRef = db.collection("withdrawals").doc(requestId);

  await db.runTransaction(async (transaction) => {
    const reqSnap = await transaction.get(withdrawRef);
    if (!reqSnap.exists()) throw new functions.https.HttpsError("not-found", "Request not found");

    const reqData = reqSnap.data()!;
    if (reqData.status !== "PENDING") throw new functions.https.HttpsError("failed-precondition", "Already processed");

    transaction.update(withdrawRef, {
      status: "APPROVED",
      txId: txId,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const netUsdt = (reqData.tokenAmount / 100000) * 0.95;

    // Send Admin & User Bot Messages
    const userTelegramId = reqData.userId.replace("telegram:", "");
    await sendTelegramMessage(userTelegramId, 
      `✅ *Withdrawal Approved!*\n\n` +
      `*Number of withdrawal:* #${requestId.slice(0, 6)}\n` +
      `*Amount:* ${reqData.tokenAmount} Tokens\n` +
      `*Withdrawal fee:* 5% + $0.01\n` +
      `*Net balance:* $${netUsdt.toFixed(2)}\n` +
      `*Status:* Success`,
      [
        [{ text: "🔍 View Transaction", url: `https://bscscan.com/tx/${txId}` }],
        [{ text: "📢 Payment Channel", url: "https://t.me/bearfarm_pay_out" }]
      ]
    );

    // Broadcast to Payment Channel
    await sendTelegramMessage(PAYMENT_CHANNEL_ID,
      `🎉 *New Withdrawal Approved*\n\n` +
      `👤 *User:* ${reqData.username}\n` +
      `🔢 *Number:* #${requestId.slice(0, 6)}\n` +
      `💰 *Amount:* ${reqData.tokenAmount} Tokens\n` +
      `💵 *Net Value:* $${netUsdt.toFixed(2)}\n` +
      `⚡ *Status:* Success`,
      [
        [{ text: "🔍 View Transaction", url: `https://bscscan.com/tx/${txId}` }],
        [{ text: "🌾 Open Mini App", url: "https://t.me/Bear_Farmbot/earn" }]
      ]
    );
  });

  return { success: true };
});

// Telegram Bot Helper Function
async function sendTelegramMessage(chatId: string, text: string, inlineKeyboard: any[] = []) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
    });
  } catch (err) {
    console.error("Telegram Bot API Error:", err);
  }
}
