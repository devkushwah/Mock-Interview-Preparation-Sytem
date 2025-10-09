import { db } from '@/lib/firebaseConfig';
import { collection, addDoc, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

export const createUser = async (userData) => {
  try {
    console.log('Creating user with data:', userData);
    
    // Check if user already exists
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', userData.email));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const existingUser = querySnapshot.docs[0];
      console.log('User already exists:', existingUser.id);
      return {
        id: existingUser.id,
        ...existingUser.data()
      };
    }
    
    // Create new user with proper schema
    const newUser = {
      name: userData.name,
      email: userData.email,
      credit: 50000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Additional fields from Convex schema
      avatar: userData.avatar || null,
      isActive: true,
      totalInterviews: 0,
      lastLoginAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(usersRef, newUser);
    
    console.log('New user created with ID:', docRef.id);
    
    return {
      id: docRef.id,
      ...newUser
    };
  } catch (error) {
    console.error('Error in createUser:', error);
    throw error;
  }
};

export const getUserByEmail = async (email) => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const userDoc = querySnapshot.docs[0];
    return {
      id: userDoc.id,
      ...userDoc.data()
    };
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
};

export const updateUserCredit = async (userId, newCredit) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      credit: newCredit,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating user credit:', error);
    throw error;
  }
};

export const updateUserStats = async (userId, stats) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      totalInterviews: stats.totalInterviews || 0,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating user stats:', error);
    throw error;
  }
};