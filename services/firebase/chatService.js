import { db } from '@/lib/firebaseConfig'
import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore'

export const saveChatMessage = async (discussionRoomId, message, sender, timestamp) => {
  try {
    console.log('💾 Attempting to save chat message:', { discussionRoomId, sender, message: message.substring(0, 50) })
    
    const chatRef = collection(db, 'chats')
    const docRef = await addDoc(chatRef, {
      discussionRoomId,
      message,
      sender, // 'user' or 'ai'
      timestamp,
      createdAt: new Date()
    })
    
    console.log('✅ Chat message saved to Firebase with ID:', docRef.id)
    return docRef.id
  } catch (error) {
    console.error('❌ Error saving chat to Firebase:', error)
    throw error
  }
}

export const getChatHistory = async (discussionRoomId) => {
  try {
    console.log('📖 Fetching chat history for room:', discussionRoomId)
    
    const chatRef = collection(db, 'chats')
    const q = query(
      chatRef, 
      where('discussionRoomId', '==', discussionRoomId),
      orderBy('timestamp', 'asc')
    )
    const querySnapshot = await getDocs(q)
    
    const chatHistory = []
    querySnapshot.forEach((doc) => {
      chatHistory.push({ id: doc.id, ...doc.data() })
    })
    
    console.log('📖 Retrieved chat history:', chatHistory.length, 'messages')
    return chatHistory
  } catch (error) {
    console.error('❌ Error fetching chat history:', error)
    return []
  }
}