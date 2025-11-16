import { NextResponse } from 'next/server'
import { db } from '@/lib/firebaseConfig'
import {
  collection, addDoc, serverTimestamp, updateDoc, doc, getDoc
} from 'firebase/firestore'
import { callGemini } from '@/services/geminiService'
import { AIModel } from '@/services/GlobalServices'
import { ExpertsList } from '@/services/options' 

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

    // Fetch room data
    let roomTier = 'regular'
    let isFreeSession = false
    let roomData = null
    
    if (discussionRoomId) {
      const snap = await getDoc(doc(db, 'discussionRooms', discussionRoomId))
      if (snap.exists()) {
        roomData = snap.data()
        roomTier = (roomData?.tier || 'regular').toLowerCase()
        isFreeSession = !!roomData?.isFreeSession
      }
    }

    // Save user message
    // Don't persist initial/system instruction prompts (start=true) into user-visible chat history.
    // These are used only to generate the AI response.
    if (discussionRoomId && !body.start) {
      await saveMessageToDiscussionRoom(discussionRoomId, 'user', message)
    }
    

    const interviewerName = context?.interviewerName || 'an experienced interviewer'
    const practiceOption = context?.practiceOption || 'Mock Interview'
    const topic = context?.topic || roomData?.topic || 'General'
    const role = roomData?.role || context?.role || null
    const experience = roomData?.experience || context?.experience || null

    // ✅ FIX: Get the ACTUAL expert prompt from ExpertsList
    const expert = ExpertsList.find(exp => exp.name === practiceOption) || ExpertsList[0]
    
    if (!expert || !expert.prompt) {
      console.error('❌ Expert not found or missing prompt:', practiceOption)
      return NextResponse.json({ error: 'Invalid interview type' }, { status: 400 })
    }

    // ✅ Use expert's detailed prompt and replace placeholders
    let systemPrompt = expert.prompt
      .replace(/{user_topic}/gi, topic)
      .replace(/{user_role}/gi, role || 'the target role')
      .replace(/{user_experience}/gi, experience || 'your experience level')

    // ✅ Add voice-specific instructions (keep responses short for TTS)
    const isEnglishPractice = (practiceOption || '').toLowerCase() === 'english practice'
    const voiceInstructions = isEnglishPractice ? `

VOICE CONVERSATION MODE (English Practice):
- Keep your replies short (1–2 sentences) and friendly.
- Ask open-ended, everyday questions that invite long answers (aim 5–8+ sentences from the learner).
- Encourage details, feelings, and stories. Avoid corporate/interview tone.
- Give only lightweight corrections after the learner speaks (1–3 quick fixes or improved phrases).
- No bullet points in normal voice responses; keep it natural and conversational.
- Wait for the learner's response before continuing.

` : `

VOICE CONVERSATION MODE:
- Keep responses conversational and concise (2-3 sentences max)
- Ask ONE clear question at a time
- Speak naturally as if having a real interview conversation
- NO bullet points, formatting, or long explanations in voice mode
- Wait for candidate's response before proceeding

`

    systemPrompt += voiceInstructions

    console.log('🎯 Using Expert Prompt:', {
      practiceOption,
      expert: expert.name,
      promptPreview: systemPrompt.substring(0, 150) + '...',
      hasRole: !!role,
      hasExperience: !!experience
    })

    // ✅ Build conversation with proper system prompt
    const conversationPrompt = `${systemPrompt}

Candidate just said: "${message}"

Respond as ${interviewerName}:`

    // Route by tier
    // Use AIModel for both regular and pro on the server so GROQ_API_KEY_2 (server env) can be used for regular,
    // with AIModel handling Groq -> Gemini fallback logic.
    let result = null
    try {
      result = await AIModel(
        { topic, role, experience, tier: roomTier },
        practiceOption,
        message // AIModel composes system prompt from ExpertsList
      )
    } catch (e) {
      console.warn('AIModel call failed:', e?.message || e)
      result = null
    }

    // If AIModel failed and this is regular tier, try a direct Gemini fallback using the prepared conversationPrompt
    if ((!result || !result.success || !result.response) && roomTier === 'regular') {
      try {
        const geminiText = await callGemini(conversationPrompt)
        if (geminiText) result = { success: true, response: geminiText, fallback: 'gemini' }
      } catch (e) {
        console.warn('Gemini fallback failed:', e?.message || e)
      }
    }

    if (!result || !result.success || !result.response) {
      return NextResponse.json({ error: 'Service busy, try again.' }, { status: 503 })
    }

    const aiText = result.response

    if (discussionRoomId) {
      await saveMessageToDiscussionRoom(discussionRoomId, 'assistant', aiText)
    }

    return NextResponse.json({ success: true, response: aiText })
  } catch (error) {
    console.error('❌ Chat API Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}