import { createClient } from "@deepgram/sdk"
import { NextResponse } from 'next/server'

const deepgram = createClient(process.env.DEEPGRAM_API_KEY)

export async function POST(request) {
  try {
    const { text } = await request.json()
    
    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    console.log('🎵 TTS API: Converting text to speech for:', text.substring(0, 50) + '...')
    console.log('📊 Text length:', text.length, 'characters')
    
    // Add timeout wrapper for Deepgram API
    const ttsPromise = deepgram.speak.request(
      { text },
      {
        model: "aura-2-thalia-en",
        encoding: "linear16", 
        container: "wav",
        sample_rate: 24000,
        speed: 1.1
      }
    )

    // Race between TTS and timeout
    const response = await Promise.race([
      ttsPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Deepgram TTS timeout')), 25000)
      )
    ])

    const stream = await response.getStream()
    
    if (!stream) {
      console.error('❌ Failed to get audio stream from Deepgram')
      return NextResponse.json(
        { error: 'Failed to generate audio stream' },
        { status: 500 }
      )
    }

    console.log('✅ Audio stream received from Deepgram')
    const audioBuffer = await getAudioBuffer(stream)
    
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error('❌ Empty audio buffer received')
      return NextResponse.json(
        { error: 'Empty audio buffer' },
        { status: 500 }
      )
    }

    console.log('✅ Audio buffer created, size:', audioBuffer.length, 'bytes')
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
        'Connection': 'close'
      },
    })
    
  } catch (error) {
    console.error('❌ TTS API Error:', error)
    
    let errorMessage = 'TTS failed'
    if (error.message === 'Deepgram TTS timeout') {
      errorMessage = 'TTS request timed out - text may be too long'
    } else if (error.message) {
      try {
        const parsed = JSON.parse(error.message)
        errorMessage = parsed.err_msg || error.message
      } catch {
        errorMessage = error.message
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

async function getAudioBuffer(response) {
  const reader = response.getReader()
  const chunks = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const dataArray = chunks.reduce(
      (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
      new Uint8Array(0)
    )

    return Buffer.from(dataArray.buffer)
  } catch (error) {
    console.error('❌ Error reading audio stream:', error)
    throw new Error('Failed to process audio stream')
  }
}

