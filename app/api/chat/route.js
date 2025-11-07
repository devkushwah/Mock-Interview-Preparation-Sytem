import { NextResponse } from 'next/server'
import { db } from '@/lib/firebaseConfig'
import {
  collection, addDoc, serverTimestamp, updateDoc, doc, getDoc
} from 'firebase/firestore'
import { callGemini } from '@/services/geminiService'
import { AIModel } from '@/services/GlobalServices'

// Save message to subcollection: /discussionRooms/{roomId}/messages
const saveMessageToDiscussionRoom = async (discussionRoomId, sender, message) => {
  const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
  const messageObj = {
    sender,
    message,
    type: 'text',
    timestamp: serverTimestamp(),              // USE Firestore Timestamp
    timestampText: new Date().toISOString(),   // optional human-readable
  }
  await addDoc(messagesRef, messageObj)
  // Update room's updatedAt
  const roomRef = doc(db, 'discussionRooms', discussionRoomId)
  await updateDoc(roomRef, { updatedAt: serverTimestamp() })
}

// Basic rate limiting (in-memory, for demo; use Redis in production)
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const MAX_REQUESTS = 10 // per user per window

const checkRateLimit = (userId) => {
  const now = Date.now()
  const userRequests = rateLimitMap.get(userId) || []
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW)
  if (recentRequests.length >= MAX_REQUESTS) {
    return false
  }
  recentRequests.push(now)
  rateLimitMap.set(userId, recentRequests)
  return true
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { message, context, discussionRoomId, userId } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // Fetch room to get tier and free flag
    let roomTier = 'regular'
    let isFreeSession = false
    if (discussionRoomId) {
      const snap = await getDoc(doc(db, 'discussionRooms', discussionRoomId))
      if (snap.exists()) {
        const data = snap.data()
        roomTier = (data?.tier || 'regular').toLowerCase()
        isFreeSession = !!data?.isFreeSession
      }
    }

    // Optional: basic rate limit (skip if missing userId)
    // if (userId && !checkRateLimit(userId)) { return NextResponse.json({ error: 'Rate limit' }, { status: 429 }) }

    // Save user message
    if (discussionRoomId) {
      await saveMessageToDiscussionRoom(discussionRoomId, 'user', message)
    }

    const interviewerName = context?.interviewerName || 'an experienced interviewer'
    const practiceOption = context?.practiceOption || 'Mock Interview'

    const conversationPrompt = `You are ${interviewerName} conducting a ${practiceOption} session.

CRITICAL VOICE CONVERSATION RULES:
- Give SHORT responses (1-2 sentences maximum)
- Ask ONLY ONE question at a time
- Be natural and conversational like speaking out loud
- NO formatting, bullet points, or structured templates
- Keep tone professional but friendly and encouraging
- Wait for candidate's response before next question

Interview Context:
- Type: ${practiceOption}

Candidate just said: "${message}"

Respond naturally as an interviewer speaking out loud:`

    // Strict routing by tier
    let result
    if (roomTier === 'regular') {
      const geminiText = await callGemini(conversationPrompt)
      if (!geminiText) {
        return NextResponse.json({ error: 'Service busy, try again.' }, { status: 503 })
      }
      result = { success: true, response: geminiText }
    } else {
      // Pro => force Qwen
      result = await AIModel(
        { topic: context?.topic, role: null, experience: null, tier: 'pro' },
        practiceOption,
        conversationPrompt,
        'qwen/qwen-2.5-72b-instruct:free'
      )
    }

    const aiText = result?.success ? result.response : "Sorry, I'm having trouble responding right now."

    if (discussionRoomId) {
      await saveMessageToDiscussionRoom(discussionRoomId, 'assistant', aiText)
    }

    return NextResponse.json({ success: true, response: aiText })
  } catch (error) {
    console.error('❌ Chat API Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}