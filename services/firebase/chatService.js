import { db } from '@/lib/firebaseConfig'
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  doc
} from 'firebase/firestore'

/**
 * Save a chat message to subcollection:
 * /discussionRooms/{roomId}/messages
 */
export async function saveMessage(discussionRoomId, sender, message, type = 'text') {
  try {
    if (!discussionRoomId || !sender || !message) {
      throw new Error('Missing required parameters.')
    }

    const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')

    const messageData = {
      sender,
      message,
      type, // e.g. 'text' | 'audio' | 'system'
      timestamp: serverTimestamp(),
    }

    const docRef = await addDoc(messagesRef, messageData)

    console.log('💬 Message saved:', docRef.id)
    return { id: docRef.id, ...messageData }
  } catch (error) {
    console.error('❌ Error saving message:', error)
    throw new Error('Failed to save message.')
  }
}

/**
 * Get all messages for a discussionRoom (ordered by time ascending)
 */
export async function getMessages(discussionRoomId, limitCount = 100) {
  try {
    const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
    const q = query(messagesRef, orderBy('timestamp', 'asc'))

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
  } catch (error) {
    console.error('❌ Error fetching messages:', error)
    throw new Error('Failed to load messages.')
  }
}

/**
 * Fetch ordered messages from subcollection /discussionRooms/{roomId}/messages
 * Returns array of { id, sender, message, timestamp }
 */
export async function getConversationHistory(discussionRoomId) {
  if (!discussionRoomId) return []
  try {
    const messagesRef = collection(db, 'discussionRooms', discussionRoomId, 'messages')
    const q = query(messagesRef, orderBy('timestamp', 'asc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map(m => ({ id: m.id, ...m.data() }))
  } catch (error) {
    console.error('getConversationHistory error:', error)
    return []
  }
}
