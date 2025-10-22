import { NextResponse } from 'next/server'
import { AIModel } from '@/services/GlobalServices'

export async function POST(request) {
  try {
    const { message, context } = await request.json()
    
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    console.log('🤖 Chat API: Processing message:', message.substring(0, 50) + '...')
    console.log('📋 Context:', context)

    // Create conversational interview prompt using your existing patterns
    const interviewerName = context?.interviewerName || 'an experienced interviewer'
    const practiceOption = context?.practiceOption || 'Mock Interview'
    
    // Build conversation context
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

    // Use your existing AIModel function with conversational prompt
    const result = await AIModel(
      context?.topic || 'general interview conversation',
      practiceOption,
      conversationPrompt
    )
    
    if (result.success) {
      // Clean up any formatting that might slip through
      let aiResponse = result.response.trim()
      
      // Remove any markdown formatting for voice
      aiResponse = aiResponse
        .replace(/###\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
      
      console.log('✅ AI response generated successfully:', aiResponse.substring(0, 100) + '...')
      
      return NextResponse.json({ 
        response: aiResponse 
      })
    } else {
      console.error('❌ AI response failed:', result.error)
      return NextResponse.json(
        { error: result.error || 'Failed to generate response' },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('❌ Chat API Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    )
  }
}