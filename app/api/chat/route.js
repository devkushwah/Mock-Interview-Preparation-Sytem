import { NextResponse } from 'next/server'
import { db } from '@/lib/firebaseConfig'
import { doc, updateDoc, serverTimestamp, collection, addDoc, getDoc } from 'firebase/firestore'
import { AIModel } from '@/services/GlobalServices'
import { callGemini } from '@/services/geminiService'  // add

// Save message to subcollection: /discussionRooms/{roomId}/messages
const saveMessageToDiscussionRoom = async (discussionRoomId, sender, message) => {
  const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
  const messageObj = { sender, message, timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
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
  console.log('🤖 Chat API route hit!')
  
  try {
    const body = await request.json()
    console.log('🤖 Chat API request body:', {
      hasMessage: !!body.message,
      hasContext: !!body.context,
      hasDiscussionRoomId: !!body.discussionRoomId,
      discussionRoomId: body.discussionRoomId
    })
    
    const { message, context, discussionRoomId, userId } = body

    // Fetch room to get tier and free flag
    let roomTier = 'regular'
    let isFreeSession = false
    if (discussionRoomId) {
      try {
        const snap = await getDoc(doc(db, 'discussionRooms', discussionRoomId))
        if (snap.exists()) {
          const data = snap.data()
          roomTier = data?.tier || 'regular'
          isFreeSession = !!data?.isFreeSession
        }
      } catch (e) {
        console.warn('⚠️ failed to get room for tier:', e?.message)
      }
    }

    // Rate limiting
    if (userId && !checkRateLimit(userId)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait.' }, { status: 429 })
    }

    // Per-message credit deduction (skip for free session)
    if (userId && !isFreeSession) {
      try {
        const { deductCredits } = await import('@/services/firebase/userService');
        await deductCredits(userId, 500); // 500 credits per message
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    if (!message) {
      console.error('❌ No message provided')
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Save user message to subcollection
    if (discussionRoomId) {
      try {
        await saveMessageToDiscussionRoom(discussionRoomId, 'user', message)
        console.log('✅ User message saved to subcollection')
      } catch (error) {
        console.error('❌ Failed to save user message:', error)
      }
    } else {
      console.warn('⚠️ No discussionRoomId - skipping save')
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

    // Route by tier:
    let result
    if (roomTier === 'regular') {
      // Prefer Gemini
      const geminiText = await callGemini(conversationPrompt)
      if (geminiText) {
        result = { success: true, response: geminiText }
      } else {
        // Fallback to OpenRouter
        result = await AIModel(
          context?.topic || 'general interview conversation',
          practiceOption,
          conversationPrompt,
          'qwen/qwen-2.5-72b-instruct:free'
        )
      }
    } else {
      // Pro → Qwen
      result = await AIModel(
        context?.topic || 'general interview conversation',
        practiceOption,
        conversationPrompt,
        'qwen/qwen-2.5-72b-instruct:free'
      )
    }

    if (result?.success) {
      let aiResponse = result.response.trim()
      aiResponse = aiResponse
        .replace(/###\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\n+/g, ' ')
        .trim()

      // Save AI response to subcollection
      if (discussionRoomId) {
        try {
          await saveMessageToDiscussionRoom(discussionRoomId, 'ai', aiResponse)
          console.log('✅ AI message saved to subcollection')
        } catch (error) {
          console.error('❌ Failed to save AI response:', error)
        }
      }
      
      return NextResponse.json({ response: aiResponse })
    } else {
      console.error('❌ AI response failed:', result?.error)
      return NextResponse.json({ error: result?.error || 'Failed to generate response' }, { status: 500 })
    }
    
  } catch (error) {
    console.error('❌ Chat API Error:', error)
    return NextResponse.json({ error: 'Failed to generate response. Please try again.' }, { status: 500 })
  }
}