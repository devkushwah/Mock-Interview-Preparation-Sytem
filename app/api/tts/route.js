import { createClient } from "@deepgram/sdk"
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const createWavHeader = ({ sampleRate, channels, bitsPerSample }, dataBytes) => {
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataBytes, true)

  return Buffer.from(new Uint8Array(buffer))
}

export async function POST(req) {
  try {
    const { text } = await req.json()

    const clean = String(text || '').trim()
    if (!clean) {
      return new Response('Missing text', { status: 400 })
    }

    // ✅ Put this in .env.local as DEEPGRAM_API_KEY (server-side, NOT public)
    const key = process.env.DEEPGRAM_API_KEY || process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
    if (!key) {
      return new Response('Missing DEEPGRAM_API_KEY', { status: 500 })
    }

    const sampleRate = 48000
    const url = `https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=${sampleRate}`

    const dgRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: clean }),
    })

    if (!dgRes.ok) {
      const errText = await dgRes.text().catch(() => '')
      return new Response(`Deepgram TTS failed: ${dgRes.status} ${errText}`, { status: 502 })
    }

    const pcmBuf = Buffer.from(await dgRes.arrayBuffer())
    const header = createWavHeader({ sampleRate, channels: 1, bitsPerSample: 16 }, pcmBuf.length)
    const wavBuf = Buffer.concat([header, pcmBuf])

    return new Response(wavBuf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new Response(`TTS route error: ${e?.message || 'unknown'}`, { status: 500 })
  }
}

