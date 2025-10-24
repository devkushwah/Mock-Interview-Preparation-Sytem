import { db } from '@/lib/firebaseConfig';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction,  // Yeh add karo
} from 'firebase/firestore';

// -------------------------------
// 🔧 Helper Functions
// -------------------------------

const usersRef = collection(db, 'users');

/** Fetch user by email */
const findUserByEmail = async (email) => {
  const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
  const snapshot = await getDocs(q);
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

/** Get current timestamp (ISO fallback for non-server environments) */
const getTimestamp = () => {
  try {
    return serverTimestamp();
  } catch {
    return new Date().toISOString();
  }
};

// -------------------------------
// 👤 Main User Functions
// -------------------------------

/** Create user if doesn't exist */
export const createUser = async (userData) => {
  try {
    if (!userData?.email || !userData?.name) {
      throw new Error('Invalid user data: email and name are required.');
    }

    // 1. Check for existing user
    const existingUser = await findUserByEmail(userData.email);
    if (existingUser) {
      console.log('User already exists:', existingUser.id);
      return existingUser;
    }

    // 2. Prepare new user schema
    const newUser = {
      name: userData.name.trim(),
      email: userData.email.trim().toLowerCase(),
      avatar: userData.avatar || null,
      credit: 50000,
      isActive: true,
      totalInterviews: 0,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      lastLoginAt: getTimestamp(),
    };

    // 3. Create user in Firestore
    const docRef = await addDoc(usersRef, newUser);
    console.log('✅ New user created:', docRef.id);

    return { id: docRef.id, ...newUser };
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    throw new Error('Failed to create user. Please try again.');
  }
};

/** Get user by email */
export const getUserByEmail = async (email) => {
  try {
    if (!email) throw new Error('Email required.');
    const user = await findUserByEmail(email);
    return user || null;
  } catch (error) {
    console.error('❌ Error fetching user:', error.message);
    throw new Error('Failed to fetch user by email.');
  }
};

/** Update user credits safely */
export const updateUserCredit = async (userId, newCredit) => {
  try {
    if (!userId || typeof newCredit !== 'number') {
      throw new Error('Invalid parameters for updating credit.');
    }

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      credit: newCredit,
      updatedAt: getTimestamp(),
    });

    console.log(`💰 Credit updated for user: ${userId} → ${newCredit}`);
  } catch (error) {
    console.error('❌ Error updating user credit:', error.message);
    throw new Error('Failed to update user credit.');
  }
};

/** Update user statistics */
export const updateUserStats = async (userId, stats = {}) => {
  try {
    if (!userId) throw new Error('User ID required for stats update.');

    const userRef = doc(db, 'users', userId);
    const updates = {
      totalInterviews: stats.totalInterviews ?? 0,
      lastLoginAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await updateDoc(userRef, updates);
    console.log(`📊 Stats updated for user: ${userId}`);
  } catch (error) {
    console.error('❌ Error updating user stats:', error.message);
    throw new Error('Failed to update user stats.');
  }
};

/**
 * Safely updates user credits using Firestore transactions
 * Prevents race conditions or overwrites
 * 
 * @param {string} userId - Firestore user document ID
 * @param {number} creditDelta - Amount to add/subtract (e.g. +500 or -1000)
 */
export const updateUserCreditSafe = async (userId, creditDelta) => {
  try {
    if (!userId || typeof creditDelta !== 'number') {
      throw new Error('Invalid parameters: userId and creditDelta are required.');
    }

    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error('User not found for credit update.');
      }

      const currentCredit = userSnap.data().credit || 0;
      const newCredit = currentCredit + creditDelta;

      if (newCredit < 0) {
        throw new Error(`Insufficient credit. Current: ${currentCredit}, Tried: ${creditDelta}`);
      }

      transaction.update(userRef, {
        credit: newCredit,
        updatedAt: serverTimestamp(),
      });

      console.log(`💰 Transaction success: User ${userId} → ${newCredit}`);
    });

    return true;
  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    throw new Error('Credit update failed. Please retry.');
  }
};
