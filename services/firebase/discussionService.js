import { db } from '@/lib/firebaseConfig'
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc, setDoc,  // <-- add setDoc
  query, where, orderBy, startAfter, limit, serverTimestamp, increment
} from 'firebase/firestore'
import { ensureHasCredits } from '@/services/firebase/userService'
import { ExpertsList } from '@/services/options'
import { AIModel } from '@/services/GlobalServices'
import { callGemini } from '@/services/geminiService'

/** ---------------- Helper Functions ---------------- **/

// Remove duplicated countTodaysFreeByTier / decideFreeSession (keep single versions below)

// Daily limits
const REGULAR_DAILY_LIMIT = 10
const PRO_DAILY_LIMIT = 1

const getStartOfDay = () => {
  const d = new Date()
  d.setHours(0,0,0,0)
  return d
}

const dayKey = () => {
  const d = new Date()
  d.setHours(0,0,0,0)
  // yyyy-mm-dd
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const da = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${da}`
}

const countTodaysFreeByTier = async (userId) => {
  const startOfDay = getStartOfDay()
  const snap = await getDocs(
    query(
      collection(db, 'discussionRooms'),
      where('userId','==', userId),
      where('isFreeSession','==', true)
    )
  )
  let usedRegular = 0
  let usedPro = 0
  snap.forEach(s => {
    const data = s.data() || {}
    const ts = data.createdAt
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
    const isToday = !d || d >= startOfDay // treat missing timestamp as today
    if (!isToday) return
    if (data.tier === 'pro') usedPro++
    else usedRegular++
  })
  return { usedRegular, usedPro }
}

const decideFreeSession = async (userId, tier) => {
  const { usedRegular, usedPro } = await countTodaysFreeByTier(userId)
  if (tier === 'pro') {
    return { isFree: usedPro < PRO_DAILY_LIMIT, usedRegular, usedPro }
  }
  return { isFree: usedRegular < REGULAR_DAILY_LIMIT, usedRegular, usedPro }
}

const validateDiscussionInput = (d) => {
  if (!d) return 'discussionData required'
  if (!d.userId) return 'userId required'
  if (!d.practiceOption) return 'practiceOption required'
  if (!d.topic || typeof d.topic !== 'string' || !d.topic.trim()) d.topic = 'General'
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
    if (invalid) return { success:false, error:invalid }

    const tier = (discussionData.tier === 'pro') ? 'pro' : 'regular'

    await ensureHasCredits(discussionData.userId)

    const beforeCounts = await countTodaysFreeByTier(discussionData.userId)
    const decision = await decideFreeSession(discussionData.userId, tier)

    const beforeLeftRegular = Math.max(0, REGULAR_DAILY_LIMIT - beforeCounts.usedRegular)
    const beforeLeftPro = Math.max(0, PRO_DAILY_LIMIT - beforeCounts.usedPro)

    console.log(`[FREE] BEFORE CREATE | user=${discussionData.userId} tier=${tier} usedRegular=${beforeCounts.usedRegular}/${REGULAR_DAILY_LIMIT} usedPro=${beforeCounts.usedPro}/${PRO_DAILY_LIMIT} isFreeEligible=${decision.isFree} leftRegular=${beforeLeftRegular} leftPro=${beforeLeftPro}`)

    const newDiscussion = {
      userId: discussionData.userId,
      practiceOption: discussionData.practiceOption,
      topic: discussionData.topic,
      interviewerName: discussionData.interviewerName || null,
      role: discussionData.role || null,
      experience: discussionData.experience || null,
      tier,
      isFreeSession: !!decision.isFree,
      status: 'active',
      duration: 0,
      totalQuestions: 0,
      feedback: [],
      score: null,
      difficulty: discussionData.difficulty || 'medium',
      tags: discussionData.tags || [],
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    const ref = await addDoc(collection(db, 'discussionRooms'), newDiscussion)

    // Safe per-day usage write (create if missing, never throw)
    try {
      if (decision.isFree) {
        const key = dayKey()
        const usageRef = doc(db, 'users', discussionData.userId, 'dailyUsage', key)
        const incField = tier === 'pro' ? { proUsed: increment(1) } : { regularUsed: increment(1) }
        // Ensure doc exists, then increment
        await setDoc(usageRef, { dateKey: key, regularUsed: 0, proUsed: 0 }, { merge: true })
        await setDoc(usageRef, { ...incField, lastDiscussionId: ref.id, lastUpdatedAt: serverTimestamp() }, { merge: true })
        console.log(`[FREE] dailyUsage updated | user=${discussionData.userId} key=${key} inc=${tier}`)
      }
    } catch (e) {
      console.warn('[FREE] dailyUsage write skipped:', e?.message || e)
      // Do not fail the interview creation for analytics issues
    }

    // Optimistic AFTER
    const afterUsedRegular = beforeCounts.usedRegular + (tier === 'regular' && decision.isFree ? 1 : 0)
    const afterUsedPro = beforeCounts.usedPro + (tier === 'pro' && decision.isFree ? 1 : 0)
    const afterLeftRegular = Math.max(0, REGULAR_DAILY_LIMIT - afterUsedRegular)
    const afterLeftPro = Math.max(0, PRO_DAILY_LIMIT - afterUsedPro)

    console.log(`[FREE] AFTER CREATE (OPTIMISTIC) | doc=${ref.id} tier=${tier} decremented=${decision.isFree ? 1 : 0} usedRegular=${afterUsedRegular}/${REGULAR_DAILY_LIMIT} usedPro=${afterUsedPro}/${PRO_DAILY_LIMIT} leftRegular=${afterLeftRegular} leftPro=${afterLeftPro}`)

    setTimeout(async () => {
      try {
        const verify = await countTodaysFreeByTier(discussionData.userId)
        const vLeftRegular = Math.max(0, REGULAR_DAILY_LIMIT - verify.usedRegular)
        const vLeftPro = Math.max(0, PRO_DAILY_LIMIT - verify.usedPro)
        console.log(`[FREE] VERIFY RECOUNT | user=${discussionData.userId} usedRegular=${verify.usedRegular}/${REGULAR_DAILY_LIMIT} usedPro=${verify.usedPro}/${PRO_DAILY_LIMIT} leftRegular=${vLeftRegular} leftPro=${vLeftPro}`)
      } catch (e) {
        console.warn('[FREE] VERIFY FAILED:', e?.message)
      }
    }, 500)

    const snap = await getDoc(ref)
    return {
      success: true,
      data: {
        id: ref.id,
        ...(snap.exists() ? snap.data() : newDiscussion),
        freeStats: {
          before: { leftRegular: beforeLeftRegular, leftPro: beforeLeftPro },
          after: { leftRegular: afterLeftRegular, leftPro: afterLeftPro }
        }
      }
    }
  } catch (error) {
    console.error('createDiscussionRoom error:', error)
    return { success:false, error:error.message || String(error) }
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

    // Dynamically import updateUserStats to avoid ReferenceError if not exported
    if (userId) {
      try {
        const { updateUserStats } = await import('./userService')
        if (typeof updateUserStats === 'function') {
          await updateUserStats(userId, { totalInterviews: increment(1) })
        } else {
          console.warn('updateUserStats not defined or not a function')
        }
      } catch (e) {
        console.warn('updateUserStats unavailable:', e?.message)
      }
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
      await deductCredits(userId, 2000)
    }

    // Fetch room to get tier/role/experience for model routing
    const roomSnap = await getDoc(doc(db, 'discussionRooms', discussionRoomId))
    const room = roomSnap.exists() ? roomSnap.data() : {}
    const tier = (room?.tier || 'regular').toLowerCase()
    const role = room?.role || room?.jobRole || null
    const experience = room?.experience || null

    const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
    const snapshot = await getDocs(query(messagesRef, orderBy('timestamp', 'asc')))
    const messages = snapshot.docs.map(doc => doc.data())
    if (messages.length === 0) throw new Error('No conversation found for feedback')

    const conversationSummary = messages
      .map(msg => `${msg.sender === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.message}`)
      .join('\n')

    // Safeguard: if ExpertsList is undefined, load it dynamically
    const expertsList =
      (Array.isArray(ExpertsList) && ExpertsList.length > 0)
        ? ExpertsList
        : (await import('@/services/options')).ExpertsList || []

    const expert = expertsList.find(opt => opt.name === practiceOption) || expertsList[0]
    if (!expert || !expert.feedbackPrompt) throw new Error('No feedbackPrompt found')

    const feedbackPrompt = expert.feedbackPrompt.replace('{user_topic}', topic || 'general topics')

    const fullPrompt =
      `Provide feedback as a JSON array of objects, each with "point", "feedback", and "strength" (boolean). Output only the JSON array, nothing else.\n\n${feedbackPrompt}\n\nFull Conversation:\n${conversationSummary}`

    // Pass tier to AIModel so it routes correctly
    const contextForModel = { topic, role, experience, tier }
    const result = await AIModel(contextForModel, practiceOption, fullPrompt)
    let feedbackArray

    if (result.success) {
      try {
        let cleanedResponse = result.response
          .replace(/```json\s*/g, '')
          .replace(/\s*```/g, '')
          .trim()
        if (!cleanedResponse.startsWith('[')) throw new Error('Response does not start with array')
        feedbackArray = JSON.parse(cleanedResponse)
        if (!Array.isArray(feedbackArray)) throw new Error('AI did not return array')
      } catch (e) {
        console.error('JSON parse failed, using fallback parsing:', e)
        const lines = result.response.split('\n').filter(line => line.trim().length > 0)
        feedbackArray = lines.map((line, index) => ({
          point: `Feedback Point ${index + 1}`,
          feedback: line.replace(/^- /, '').trim(),
          strength: /good|strength/i.test(line)
        }))
      }
    } else {
      // As AIModel already tried Gemini when needed, just surface a minimal fallback
      const lines = (result.error || '').split('\n').filter(line => line.trim().length > 0)
      feedbackArray = lines.length ? lines.map((line, i) => ({
        point: `Feedback Point ${i + 1}`,
        feedback: line,
        strength: false
      })) : []
    }

    const roomRef = doc(db, 'discussionRooms', discussionRoomId)
    await updateDoc(roomRef, {
      feedback: feedbackArray,
      updatedAt: serverTimestamp()
    })

    return { success: true, feedback: feedbackArray }
  } catch (error) {
    console.error('❌ Full feedback generation error:', error)
    return { success: false, error: error.message }
  }
}

/** ---------------- Free Interview Slots ---------------- **/

export const getDailyFreeInterviewStatus = async (userId) => {
  try {
    if (!userId) return { success: false, error: 'userId required' }

    const REGULAR_LIMIT = 10
    const PRO_LIMIT = 1

    const startOfDay = getStartOfDay()
    const roomsQ = query(
      collection(db, 'discussionRooms'),
      where('userId', '==', userId),
      where('isFreeSession', '==', true)
    )
    const snap = await getDocs(roomsQ)

    const isToday = (ts) => {
      // Treat missing/pending serverTimestamp as today
      if (!ts) return true
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d >= startOfDay
    }

    let usedRegular = 0
    let usedPro = 0
    snap.forEach(docSnap => {
      const data = docSnap.data()
      if (!isToday(data.createdAt)) return
      if (data.tier === 'pro') usedPro++
      else usedRegular++
    })

    return {
      success: true,
      data: {
        regular: { used: usedRegular, left: Math.max(0, REGULAR_LIMIT - usedRegular), limit: REGULAR_LIMIT },
        pro: { used: usedPro, left: Math.max(0, PRO_LIMIT - usedPro), limit: PRO_LIMIT }
      }
    }
  } catch (e) {
    console.error('getDailyFreeInterviewStatus error:', e)
    return { success: false, error: e.message || String(e) }
  }
}

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
  generateAndSaveFullFeedback,
  getDailyFreeInterviewStatus
};
