import { db } from '@/lib/firebaseConfig'
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc,
  query, where, orderBy, startAfter, limit, serverTimestamp
} from 'firebase/firestore'
import { ensureHasCredits, checkAndConsumeDailyFreeInterview } from './userService'

/** ---------------- Helper Functions ---------------- **/

const validateDiscussionInput = (d) => {
  if (!d) return 'discussionData required'
  if (!d.userId) return 'userId required'
  if (!d.topic) return 'topic required'
  if (!d.practiceOption) return 'practiceOption required'
  return null
}

// Normalize Firestore Timestamps
const normalizeDoc = (docSnap) => {
  const data = docSnap.data ? docSnap.data() : docSnap
  const normalizeTs = (v) => {
    if (!v) return null
    if (v.toDate) return v.toDate().toISOString()
    return v
  }

  return {
    ...data,
    createdAt: normalizeTs(data.createdAt),
    updatedAt: normalizeTs(data.updatedAt),
    completedAt: normalizeTs(data.completedAt),
    pausedAt: normalizeTs(data.pausedAt),
    resumedAt: normalizeTs(data.resumedAt),
  }
}

// Compute duration in minutes between two timestamps
const computeDurationMinutes = (start, end = new Date()) => {
  try {
    const s = start.toDate ? start.toDate() : new Date(start)
    return Math.round((end - s) / (1000 * 60))
  } catch (e) {
    return 0
  }
}

/** ---------------- Discussion CRUD ---------------- **/

export const createDiscussionRoom = async (discussionData) => {
  try {
    const invalid = validateDiscussionInput(discussionData)
    if (invalid) return { success: false, error: invalid }

    const tier = discussionData.tier === 'pro' ? 'pro' : 'regular'

    // HARD GATE: user must have credits to start any interview (even free)
    await ensureHasCredits(discussionData.userId)

    // Daily free slot per tier (regular:10/day, pro:1/day)
    let isFreeSession = false
    try {
      const res = await checkAndConsumeDailyFreeInterview(discussionData.userId, tier)
      isFreeSession = !!res.isFree
    } catch (e) {
      console.warn('dailyFree check failed:', e?.message)
    }

    const newDiscussion = {
      userId: discussionData.userId,
      practiceOption: discussionData.practiceOption,
      topic: discussionData.topic,
      interviewerName: discussionData.interviewerName || null,
      jobRole: discussionData.role || discussionData.jobRole || null,
      experience: discussionData.experience || null,
      // new
      tier,
      isFreeSession,
      status: 'active',
      duration: 0,
      totalQuestions: 0,
      feedback: [],
      score: null,
      difficulty: discussionData.difficulty || 'medium',
      tags: discussionData.tags || [],
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const colRef = collection(db, 'discussionRooms')
    const docRef = await addDoc(colRef, newDiscussion)
    const createdDoc = await getDoc(docRef)

    return {
      success: true,
      data: { id: docRef.id, ...(createdDoc.exists() ? createdDoc.data() : newDiscussion) }
    }
  } catch (error) {
    console.error('createDiscussionRoom error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

export const getUserDiscussions = async (userId, limitCount = 10, cursorId = null) => {
  try {
    if (!userId) return { success: false, error: 'userId required' }

    const colRef = collection(db, 'discussionRooms')
    let q

    if (cursorId) {
      const cursorDoc = await getDoc(doc(db, 'discussionRooms', cursorId))
      if (!cursorDoc.exists()) return { success: false, error: 'Invalid cursorId' }
      q = query(
        colRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        orderBy('__name__', 'desc'), // cursor-safe compound key
        startAfter(cursorDoc),
        limit(limitCount)
      )
    } else {
      q = query(
        colRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        orderBy('__name__', 'desc'),
        limit(limitCount)
      )
    }

    const snapshot = await getDocs(q)
    const items = snapshot.docs.map(d => ({ id: d.id, ...normalizeDoc(d) }))
    const nextCursor = items.length ? items[items.length - 1].id : null

    return { success: true, data: { items, nextCursor } }
  } catch (error) {
    console.error('getUserDiscussions error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

export const getDiscussionById = async (discussionId) => {
  try {
    if (!discussionId) return { success: false, error: 'discussionId required' }
    const snap = await getDoc(doc(db, 'discussionRooms', discussionId))
    if (!snap.exists()) return { success: true, data: null }
    return { success: true, data: { id: snap.id, ...normalizeDoc(snap) } }
  } catch (error) {
    console.error('getDiscussionById error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

/** ---------------- Messages Subcollection ---------------- **/

export const addConversationMessage = async (discussionId, message) => {
  try {
    if (!discussionId) return { success: false, error: 'discussionId required' }
    if (!message || !message.text) return { success: false, error: 'message.text required' }

    const messagesRef = collection(db, 'discussionRooms', discussionId, 'messages')
    await addDoc(messagesRef, {
      sender: message.sender || 'user',
      message: message.text,
      timestamp: message.ts || serverTimestamp()
    })

    // Update updatedAt on parent discussion
    await updateDoc(doc(db, 'discussionRooms', discussionId), { updatedAt: serverTimestamp() })

    return { success: true }
  } catch (error) {
    console.error('addConversationMessage error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

/** ---------------- Discussion Status ---------------- **/

export const updateDiscussionStatus = async (discussionId, status, extras = {}) => {
  try {
    if (!discussionId) return { success: false, error: 'discussionId required' }
    await updateDoc(doc(db, 'discussionRooms', discussionId), {
      status,
      updatedAt: serverTimestamp(),
      ...extras
    })
    return { success: true }
  } catch (error) {
    console.error('updateDiscussionStatus error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

export const pauseDiscussion = (discussionId) =>
  updateDiscussionStatus(discussionId, 'paused', { pausedAt: serverTimestamp() })

export const resumeDiscussion = (discussionId) =>
  updateDiscussionStatus(discussionId, 'active', { resumedAt: serverTimestamp() })

export const completeDiscussion = async (discussionId, { feedback = null, score = null, userId = null } = {}) => {
  try {
    if (!discussionId) return { success: false, error: 'discussionId required' }
    const ref = doc(db, 'discussionRooms', discussionId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: 'discussion not found' }

    const data = snap.data()
    const duration = computeDurationMinutes(data.createdAt)

    await updateDoc(ref, {
      status: 'completed',
      isCompleted: true,
      duration,
      feedback,
      score,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    // Update user stats if userId provided
    if (userId) {
      await updateUserStats(userId, { totalInterviews: 1 })
    }

    return { success: true }
  } catch (error) {
    console.error('completeDiscussion error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

/** ---------------- Stats ---------------- **/

export const incrementDiscussionCounters = async (discussionId, { questions = 0, speechSeconds = 0 }) => {
  try {
    if (!discussionId) return { success: false, error: 'discussionId required' }
    const payload = {
      totalQuestions: increment(questions),
      totalSpeechTime: increment(speechSeconds),
      updatedAt: serverTimestamp()
    }
    await updateDoc(doc(db, 'discussionRooms', discussionId), payload)
    return { success: true }
  } catch (error) {
    console.error('incrementDiscussionCounters error:', error)
    return { success: false, error: error.message || String(error) }
  }
}

/** ---------------- Full Feedback Generation ---------------- **/

export const generateAndSaveFullFeedback = async (discussionRoomId, practiceOption, topic, userId) => {
  try {
    // Credit check and deduction for feedback
    if (userId) {
      const { deductCredits } = await import('./userService')
      await deductCredits(userId, 2000) // Deduct 2000 credits per feedback generation
    }

    const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
    const snapshot = await getDocs(query(messagesRef, orderBy('timestamp', 'asc')))
    const messages = snapshot.docs.map(doc => doc.data())

    if (messages.length === 0) throw new Error('No conversation found for feedback')

    const conversationSummary = messages
      .map(msg => `${msg.sender === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.message}`)
      .join('\n')

    const expert = ExpertsList.find(opt => opt.name === practiceOption) || ExpertsList[0]
    if (!expert || !expert.feedbackPrompt) throw new Error('No feedbackPrompt found')

    const feedbackPrompt = expert.feedbackPrompt.replace('{user_topic}', topic || 'general topics')

    // Reorder prompt: instruction first, then conversation
    const fullPrompt = `Provide feedback as a JSON array of objects, each with "point", "feedback", and "strength" (boolean). Output only the JSON array, nothing else.\n\n${feedbackPrompt}\n\nFull Conversation:\n${conversationSummary}`

    const result = await AIModel(topic, practiceOption, fullPrompt)
    let feedbackArray

    if (result.success) {
      try {
        // Clean the response to remove any potential markdown or extra text
        let cleanedResponse = result.response.replace(/```json\s*/g, '').replace(/\s*```/g, '').replace(/^\s*[\[\{]/, '[').replace(/[\]\}]\s*$/, ']').trim();
        // Ensure it's valid JSON by checking for array start
        if (!cleanedResponse.startsWith('[')) {
          throw new Error('Response does not start with array');
        }
        feedbackArray = JSON.parse(cleanedResponse);
        if (!Array.isArray(feedbackArray)) throw new Error('AI did not return array');
      } catch (e) {
        console.error('JSON parse failed, using fallback parsing:', e);
        // Improved fallback: try to extract JSON-like content or split into points
        const lines = result.response.split('\n').filter(line => line.trim().length > 0);
        feedbackArray = lines.map((line, index) => ({
          point: `Feedback Point ${index + 1}`,
          feedback: line.replace(/^- /, '').trim(),
          strength: line.toLowerCase().includes('good') || line.toLowerCase().includes('strength') // Basic heuristic
        }));
      }
    } else {
      // Fallback to Gemini if AIModel fails
      console.log('🔄 Falling back to Gemini for feedback...');
      try {
        const geminiResponse = await callGemini(fullPrompt);
        if (geminiResponse) {
          let cleanedGeminiResponse = geminiResponse.replace(/```json\s*/g, '').replace(/\s*```/g, '').replace(/^\s*[\[\{]/, '[').replace(/[\]\}]\s*$/, ']').trim();
          if (!cleanedGeminiResponse.startsWith('[')) {
            throw new Error('Gemini response does not start with array');
          }
          feedbackArray = JSON.parse(cleanedGeminiResponse);
          if (!Array.isArray(feedbackArray)) throw new Error('Gemini did not return array');
        } else {
          throw new Error('Gemini fallback failed');
        }
      } catch (geminiError) {
        console.error('❌ Gemini fallback failed for feedback:', geminiError);
        // Fallback parsing for Gemini
        const lines = geminiError.message.split('\n').filter(line => line.trim().length > 0);
        feedbackArray = lines.map((line, index) => ({
          point: `Feedback Point ${index + 1}`,
          feedback: line.replace(/^- /, '').trim(),
          strength: false
        }));
      }
    }

    const roomRef = doc(db, 'discussionRooms', discussionRoomId);
    await updateDoc(roomRef, {
      feedback: feedbackArray,
      updatedAt: serverTimestamp()
    });

    return { success: true, feedback: feedbackArray };
  } catch (error) {
    console.error('❌ Full feedback generation error:', error);
    return { success: false, error: error.message };
  }
};

/** ---------------- Export ---------------- **/
export default {
  createDiscussionRoom,
  getUserDiscussions,
  getDiscussionById,
  updateDiscussionStatus,
  addConversationMessage,
  completeDiscussion,
  pauseDiscussion,
  resumeDiscussion,
  incrementDiscussionCounters,
  generateAndSaveFullFeedback
};
