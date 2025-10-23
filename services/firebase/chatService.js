import { db } from '@/lib/firebaseConfig'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'

/**
 * Save a chat message to the discussionRoom's conversations array.
 * - Appends message using arrayUnion.
 * - Updates updatedAt.
 */
export async function saveMessageToDiscussionRoom(discussionRoomId, sender, message) {
  const roomRef = doc(db, 'discussionRooms', discussionRoomId)
  const timestamp = Date.now()
  const messageObj = { sender, message, timestamp }

  // Only update (never create new doc here)
  await updateDoc(roomRef, {
    conversations: arrayUnion(messageObj),
    updatedAt: serverTimestamp()
  })
}

/**
 * Get all chat messages for a discussionRoom.
 * Returns the conversations array (ordered by timestamp).
 */
export async function getConversationHistory(discussionRoomId) {
  const roomRef = doc(db, 'discussionRooms', discussionRoomId)
  const snap = await getDoc(roomRef)
  if (snap.exists()) {
    const data = snap.data()
    return Array.isArray(data.conversation)
      ? [...data.conversation].sort((a, b) => a.timestamp - b.timestamp)
      : []
  }
  return []
}