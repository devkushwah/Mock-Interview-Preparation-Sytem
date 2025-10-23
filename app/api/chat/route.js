import { NextResponse } from 'next/server'
import { db } from '@/lib/firebaseConfig'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { AIModel } from '@/services/GlobalServices'

// Save message to discussion room
const saveMessageToDiscussionRoom = async (discussionRoomId, sender, message) => {
  const roomRef = doc(db, 'discussionRooms', discussionRoomId)
  const timestamp = Date.now()
  const messageObj = { sender, message, timestamp }
  await updateDoc(roomRef, {
    conversation: arrayUnion(messageObj),
    updatedAt: serverTimestamp()
  })
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
    
    const { message, context, discussionRoomId } = body
    
    if (!message) {
      console.error('❌ No message provided')
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('🤖 Processing message:', message.substring(0, 50) + '...')
    
    // Save user message
    if (discussionRoomId) {
      try {
        await saveMessageToDiscussionRoom(discussionRoomId, 'user', message)
        console.log('✅ User message saved to discussionRoom conversation array')
      } catch (error) {
        console.error('❌ Failed to save user message:', error)
      }
    } else {
      console.warn('⚠️ No discussionRoomId - skipping save')
    }

    // Generate AI response
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
- Candidate: BTech Computer Science student
- Projects: LMS and AI-powered mock interview system
- Type: ${practiceOption}

Candidate just said: "${message}"

Respond naturally as an interviewer speaking out loud:`

    console.log('🤖 Calling AIModel...', typeof AIModel)
    const result = await AIModel(
      context?.topic || 'general interview conversation',
      practiceOption,
      conversationPrompt
    )
    
    if (result.success) {
      let aiResponse = result.response.trim()
      
      // Clean formatting
      aiResponse = aiResponse
        .replace(/###\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
      
      console.log('✅ AI response generated:', aiResponse.substring(0, 100) + '...')
      
      // Save AI response
      if (discussionRoomId) {
        try {
          await saveMessageToDiscussionRoom(discussionRoomId, 'ai', aiResponse)
          console.log('✅ AI message saved to discussionRoom conversation array')
        } catch (error) {
          console.error('❌ Failed to save AI response:', error)
        }
      }
      
      return NextResponse.json({ response: aiResponse })
    } else {
      console.error('❌ AI response failed:', result.error)
      return NextResponse.json({ error: result.error || 'Failed to generate response' }, { status: 500 })
    }
    
  } catch (error) {
    console.error('❌ Chat API Error:', error)
    return NextResponse.json({ error: 'Failed to generate response. Please try again.' }, { status: 500 })
  }
}