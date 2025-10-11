import React from 'react'
import { db } from '@/lib/firebaseConfig';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  getDoc,
  orderBy, 
  limit,
  arrayUnion,
  serverTimestamp 
} from 'firebase/firestore';

export const createDiscussionRoom = async (discussionData) => {
  try {
    console.log('Creating discussion room with data:', discussionData);
    
    const newDiscussion = {
      userId: discussionData.userId,
      practiceOption: discussionData.practiceOption,
      topic: discussionData.topic,
      interviewerName: discussionData.interviewerName,
      conversation: [],
      status: 'active', // active, completed, paused
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Additional schema fields
      duration: 0, // in minutes
      totalQuestions: 0,
      feedback: null,
      score: null,
      difficulty: discussionData.difficulty || 'medium',
      tags: discussionData.tags || [],
      isCompleted: false,
      // Voice interview specific
      audioQuality: 'good',
      totalSpeechTime: 0, // in seconds
      averageResponseTime: 0
    };
    
    const docRef = await addDoc(collection(db, 'discussionRooms'), newDiscussion);
    
    console.log('Discussion room created with ID:', docRef.id);
    
    return {
      id: docRef.id,
      ...newDiscussion
    };
  } catch (error) {
    console.error('Error creating discussion room:', error);
    throw error;
  }
};

export const getUserDiscussions = async (userId, limitCount = 10) => {
  try {
    const discussionsRef = collection(db, 'discussionRooms');
    const q = query(
      discussionsRef, 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting user discussions:', error);
    throw error;
  }
};

export const getDiscussionById = async (discussionId) => {
  try {
    const docRef = doc(db, 'discussionRooms', discussionId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting discussion:', error);
    throw error;
  }
};

export const updateDiscussionStatus = async (discussionId, status) => {
  try {
    const docRef = doc(db, 'discussionRooms', discussionId);
    await updateDoc(docRef, {
      status: status,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating discussion status:', error);
    throw error;
  }
};



export const completeDiscussion = async (discussionId, feedback = null, score = null) => {
  try {
    const discussionRef = doc(db, 'discussionRooms', discussionId);
    const discussionDoc = await getDoc(discussionRef);
    
    if (discussionDoc.exists()) {
      const startTime = new Date(discussionDoc.data().createdAt);
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / (1000 * 60)); // in minutes
      
      await updateDoc(discussionRef, {
        status: 'completed',
        isCompleted: true,
        duration: duration,
        feedback: feedback,
        score: score,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      console.log('Discussion completed:', discussionId);
    }
  } catch (error) {
    console.error('Error completing discussion:', error);
    throw error;
  }
};

export const pauseDiscussion = async (discussionId) => {
  try {
    const discussionRef = doc(db, 'discussionRooms', discussionId);
    await updateDoc(discussionRef, {
      status: 'paused',
      pausedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('Discussion paused:', discussionId);
  } catch (error) {
    console.error('Error pausing discussion:', error);
    throw error;
  }
};

export const resumeDiscussion = async (discussionId) => {
  try {
    const discussionRef = doc(db, 'discussionRooms', discussionId);
    await updateDoc(discussionRef, {
      status: 'active',
      resumedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('Discussion resumed:', discussionId);
  } catch (error) {
    console.error('Error resuming discussion:', error);
    throw error;
  }
};

const interviewService = () => {
  return (
    <div>interviewService</div>
  )
}

export default interviewService