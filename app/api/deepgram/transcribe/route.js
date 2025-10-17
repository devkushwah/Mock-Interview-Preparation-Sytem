import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req) {
  console.log('🚀 Deepgram API route called')
  
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      console.error('❌ Deepgram API key not configured')
      return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 500 })
    }

    const arrayBuffer = await req.arrayBuffer()
    console.log('📦 Audio data received:', arrayBuffer.byteLength, 'bytes')
    
    if (arrayBuffer.byteLength === 0) {
      console.warn('⚠️ Empty audio data received')
      return NextResponse.json({ transcript: '' })
    }
    
    console.log('📡 Sending to Deepgram...')
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?language=en-US&punctuate=true&smart_format=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/webm'
        },
        body: Buffer.from(arrayBuffer)
      }
    )

    console.log('📨 Deepgram response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Deepgram API error:', errorText)
      return NextResponse.json({ error: 'Transcription service error' }, { status: response.status })
    }

    const data = await response.json()
    console.log('📋 Deepgram response data:', JSON.stringify(data, null, 2))
    
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    console.log('📝 Extracted transcript:', transcript)
    
    return NextResponse.json({ 
      transcript,
      confidence: data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0
    })

  } catch (error) {
    console.error('🚨 Transcription error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}