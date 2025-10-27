import { db } from '@/lib/firebaseConfig';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,  // Add this import
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  increment,  // Import increment for atomic updates
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

/** Get current timestamp (readable for India timezone) */
const getTimestamp = () => {
  try {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return new Date().toISOString();
  }
};

// -------------------------------
// 👤 Main User Functions
// -------------------------------

/** Create user if doesn't exist (simple check to avoid transaction errors) */
export const createUser = async (userData) => {
  try {
    if (!db) {
      throw new Error('Firestore db is not initialized.');
    }
    if (!userData?.email || !userData?.name) {
      throw new Error('Invalid user data: email and name are required.');
    }

    const email = userData.email.trim().toLowerCase();
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      console.log('User already exists:', existingUser.id);
      return existingUser;
    }

    const newUser = {
      name: userData.name.trim(),
      email,
      avatar: userData.avatar || null,
      credit: 50000,
      isActive: true,
      totalInterviews: 0,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      lastLoginAt: getTimestamp(),
    };

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

/** Update user statistics (increment totalInterviews) */
export const updateUserStats = async (userId, stats = {}) => {
  try {
    if (!userId) throw new Error('userId required');

    const userRef = doc(db, 'users', userId);
    const updates = {
      totalInterviews: increment(stats.totalInterviews || 1),
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

/** Deduct credits from user (safe transaction) */
export const deductCredits = async (userId, amount) => {
  try {
    if (!userId || typeof amount !== 'number' || amount <= 0) throw new Error('Invalid userId or amount');

    const userRef = doc(db, 'users', userId);
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User not found');

      const currentCredits = userSnap.data().credit || 0;
      if (currentCredits < amount) throw new Error('Insufficient credits');

      transaction.update(userRef, {
        credit: increment(-amount),
        updatedAt: getTimestamp(),
      });
    });

    console.log(`💰 Deducted ${amount} credits from user: ${userId}`);
  } catch (error) {
    console.error('❌ Error deducting credits:', error.message);
    throw new Error('Failed to deduct credits. ' + error.message);
  }
};

/** Get user credits */
export const getUserCredits = async (userId) => {
  try {
    if (!userId) throw new Error('userId required');
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) throw new Error('User not found');
    return userSnap.data().credit || 0;
  } catch (error) {
    console.error('❌ Error getting credits:', error.message);
    throw new Error('Failed to get credits.');
  }
};

const CreateNewUser = async () => {
  if (!user?.primaryEmail || isCreatingUser) return;

  setIsCreatingUser(true);
  try {
    const userData = {
      name: user.displayName || user.primaryEmail.split('@')[0],
      email: user.primaryEmail,
      avatar: user.profileImageUrl || null,
    };

    const createdUser = await createUser(userData);
    setUserData(createdUser);
    console.log('User created/loaded:', createdUser);
  } catch (error) {
    console.error('Error creating user:', error);
  } finally {
    setIsCreatingUser(false);
  }
};
