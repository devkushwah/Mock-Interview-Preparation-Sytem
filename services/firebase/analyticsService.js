import { db } from '@/lib/firebaseConfig';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy,
  limit
} from 'firebase/firestore';

export const createInterviewAnalytics = async (analyticsData) => {
  try {
    console.log('Creating analytics with data:', analyticsData);
    
    const analytics = {
      userId: analyticsData.userId,
      discussionId: analyticsData.discussionId,
      // Performance metrics
      totalQuestions: analyticsData.totalQuestions || 0,
      correctAnswers: analyticsData.correctAnswers || 0,
      averageResponseTime: analyticsData.averageResponseTime || 0,
      score: analyticsData.score || 0,
      // Detailed analysis
      strengths: analyticsData.strengths || [],
      weaknesses: analyticsData.weaknesses || [],
      recommendations: analyticsData.recommendations || [],
      // Categories
      technicalScore: analyticsData.technicalScore || 0,
      communicationScore: analyticsData.communicationScore || 0,
      problemSolvingScore: analyticsData.problemSolvingScore || 0,
      // Metadata
      interviewType: analyticsData.interviewType || 'General',
      difficulty: analyticsData.difficulty || 'medium',
      topics: analyticsData.topics || [],
      duration: analyticsData.duration || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(collection(db, 'interviewAnalytics'), analytics);
    
    console.log('Analytics created with ID:', docRef.id);
    
    return {
      id: docRef.id,
      ...analytics
    };
  } catch (error) {
    console.error('Error in createInterviewAnalytics:', error);
    throw error;
  }
};

export const getUserAnalytics = async (userId, limitCount = 5) => {
  try {
    const analyticsRef = collection(db, 'interviewAnalytics');
    const q = query(
      analyticsRef,
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
    console.error('Error getting user analytics:', error);
    throw error;
  }
};