'use client'

import React, { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserContext } from '@/app/_context/UserContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getUserDiscussions } from '@/services/firebase/discussionService'

const History = () => {
  const { userData } = useContext(UserContext)
  const [discussions, setDiscussions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDiscussion, setSelectedDiscussion] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const fetchDiscussions = async () => {
      try {
        const result = await getUserDiscussions(userData.id, 10);
        if (result.success) {
          setDiscussions(result.data.items);  // Yeh change karo
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (userData?.id) fetchDiscussions();
  }, [userData]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'paused': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const emptyState = useMemo(
    () => ({
      title: 'No sessions yet',
      description: 'Start your first mock interview to see it listed here.'
    }),
    []
  )

  const resolvedConversation = useMemo(() => {
    if (!selectedDiscussion) return []
    if (selectedDiscussion.conversation?.length) return selectedDiscussion.conversation
    if (selectedDiscussion.chatHistory?.length) return selectedDiscussion.chatHistory
    if (selectedDiscussion.messages?.length) return selectedDiscussion.messages
    return []
  }, [selectedDiscussion])

  if (loading) {
    return <div className='h-40 animate-pulse rounded-3xl bg-white/70' />
  }

  if (error) {
    return <div className='rounded-3xl bg-red-50 p-6 text-center text-sm text-red-600'>{error}</div>
  }

  return (
    <section className='w-full rounded-3xl bg-white/95 p-10 shadow-[0_25px_60px_-30px_rgba(30,41,59,0.25)]'>
      <header className='flex flex-col gap-2 text-center md:text-left'>
        <span className='inline-flex items-center gap-2 self-center rounded-full border border-indigo-500/40 bg-indigo-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 md:self-start'>
          Recent Activity
        </span>
        <h2 className='text-2xl font-bold text-slate-900 md:text-3xl'>Keep refining your edge</h2>
        <p className='text-sm text-slate-500 md:max-w-xl'>
          Jump back into previous sessions or open the detailed feedback to understand how the AI rated your performance.
        </p>
      </header>

      {discussions.length === 0 ? (
        <div className='mt-10 rounded-2xl border border-dashed border-indigo-400/40 bg-indigo-50/60 p-10 text-center'>
          <h3 className='text-lg font-semibold text-indigo-700'>{emptyState.title}</h3>
          <p className='mt-2 text-sm text-indigo-600'>{emptyState.description}</p>
        </div>
      ) : (
        <div className='mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2'>
          {discussions.map((discussion) => (
            <article
              key={discussion.id}
              className='group relative flex h-full flex-col justify-between rounded-2xl border border-transparent bg-gradient-to-br from-white/95 to-indigo-50/50 p-6 shadow-[0_25px_55px_-35px_rgba(79,70,229,0.45)] transition hover:-translate-y-1 hover:border-indigo-300/60 hover:shadow-[0_35px_70px_-40px_rgba(129,140,248,0.6)]'
            >
              <div className='flex flex-col gap-3'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600'>
                    <span className='inline-block h-2 w-2 rounded-full bg-indigo-500' />
                    {discussion.practiceOption || 'Custom Track'}
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
                      discussion.status
                    )}`}
                  >
                    <span className='inline-block h-2 w-2 rounded-full bg-current opacity-70' />
                    {discussion.status}
                  </span>
                </div>

                <h3 className='text-lg font-semibold text-slate-900'>{discussion.topic || 'Untitled Session'}</h3>
                <p className='text-sm text-slate-500'>{formatDate(discussion.createdAt)}</p>
                {(discussion.jobRole || discussion.experience) && (
                  <div className='flex flex-wrap gap-2 text-xs font-medium text-indigo-600'>
                    {discussion.jobRole && (
                      <span className='rounded-full bg-indigo-50 px-2.5 py-1'>
                        Role: {discussion.jobRole}
                      </span>
                    )}
                    {discussion.experience && (
                      <span className='rounded-full bg-indigo-50 px-2.5 py-1'>
                        Experience: {discussion.experience}
                      </span>
                    )}
                  </div>
                )}
                <p className='text-sm text-slate-600 line-clamp-2'>
                  {discussion.summary || 'Open the session to review detailed highlights and AI notes.'}
                </p>
              </div>

              <div className='mt-6 flex items-center justify-between gap-4'>
                <button
                  onClick={() => router.push(`/dashboard/interview/${discussion.id}`)}
                  className='flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_20px_45px_-25px_rgba(79,70,229,0.6)] transition hover:shadow-[0_25px_55px_-25px_rgba(79,70,229,0.75)]'
                >
                  Resume
                  <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' viewBox='0 0 24 24' fill='currentColor'>
                    <path d='M5 3v18l15-9L5 3z' />
                  </svg>
                </button>

                <Button
                  variant='outline'
                  size='sm'
                  className='rounded-full border-indigo-300/60 bg-white/80 text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700'
                  onClick={() => setSelectedDiscussion(discussion)}
                >
                  View Feedback
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!selectedDiscussion} onOpenChange={() => setSelectedDiscussion(null)}>
        <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl border border-indigo-100 bg-white p-8 shadow-[0_30px_70px_-35px_rgba(30,41,59,0.45)]'>
          <DialogHeader>
            <DialogTitle className='text-2xl font-semibold text-slate-900'>{selectedDiscussion?.topic}</DialogTitle>
            <p className='text-sm text-slate-500'>{formatDate(selectedDiscussion?.createdAt)}</p>
            {(selectedDiscussion?.jobRole || selectedDiscussion?.experience) && (
              <div className='mt-3 flex flex-wrap gap-2 text-xs font-medium text-indigo-600'>
                {selectedDiscussion?.jobRole && (
                  <span className='rounded-full bg-indigo-50 px-2.5 py-1'>
                    Role: {selectedDiscussion.jobRole}
                  </span>
                )}
                {selectedDiscussion?.experience && (
                  <span className='rounded-full bg-indigo-50 px-2.5 py-1'>
                    Experience: {selectedDiscussion.experience}
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          <div className='mt-6 space-y-6'>
            <section>
              <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-500'>
                <span className='text-lg'>🗨️</span> Conversation
              </h3>
              <div className='space-y-3 rounded-2xl bg-slate-50 p-4'>
                {resolvedConversation.length ? (
                  resolvedConversation.map((entry, idx) => {
                    const sender = entry.sender || entry.role || 'assistant'
                    const message = entry.message || entry.content || ''
                    const isUser = sender === 'user'
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl p-3 text-sm ${
                          isUser ? 'bg-white text-slate-700 shadow-sm' : 'bg-indigo-100 text-indigo-700'
                        }`}
                      >
                        <strong>{isUser ? 'You: ' : 'AI: '}</strong>
                        {message}
                      </div>
                    )
                  })
                ) : (
                  <p className='text-sm text-slate-500'>Conversation transcript will appear once the interview ends.</p>
                )}
              </div>
            </section>

            <section>
              <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-500'>
                <span className='text-lg'>💡</span> AI Feedback
              </h3>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                {selectedDiscussion?.feedback?.length ? (
                  selectedDiscussion.feedback.map((item, idx) => (
                    <div key={idx} className='rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-4'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-indigo-500'>
                        {item.strength ? 'Strength' : 'Improvement'}
                      </p>
                      <p className='mt-2 text-sm font-semibold text-slate-900'>{item.point}</p>
                      <p className='mt-2 text-sm text-slate-600'>{item.feedback}</p>
                    </div>
                  ))
                ) : (
                  <div className='col-span-full rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center text-sm text-indigo-600'>
                    Feedback will be available once analysis completes.
                  </div>
                )}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
};

export default History