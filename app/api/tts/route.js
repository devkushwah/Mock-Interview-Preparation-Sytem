import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing DEEPGRAM_API_KEY on server' },
        { status: 500 }
      )
    }

    const { text } = await request.json()

    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const cleanText = String(text).trim()

    // Hard timeout via AbortController
    const ac = new AbortController()
    const timeoutId = setTimeout(() => ac.abort(), 25000)

    const url = 'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3'

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: cleanText }),
      signal: ac.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeoutId))

    if (!resp.ok) {
      const details = (await resp.text().catch(() => '')).slice(0, 600).trim()
      return NextResponse.json(
        {
          error: 'Deepgram TTS failed',
          status: resp.status,
          details: details || 'No details',
        },
        { status: 502 }
      )
    }

    const arrayBuffer = await resp.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Empty audio response' }, { status: 502 })
    }

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-store',
        Connection: 'close',
      },
    })
  } catch (error) {
    const msg = error?.name === 'AbortError' ? 'TTS request timed out' : (error?.message || 'TTS failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

