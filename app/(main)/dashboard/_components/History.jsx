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
  const [activeTab, setActiveTab] = useState('conversation') // 'conversation' | 'feedback'
  const router = useRouter()
  const [clickedId, setClickedId] = useState(null) // NEW: which card was clicked

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

  // Reset tab when opening/closing dialog
  useEffect(() => {
    if (selectedDiscussion) setActiveTab('conversation')
    if (!selectedDiscussion) setClickedId(null) // clear highlight when dialog closes
  }, [selectedDiscussion])

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
    return (
      <section className='relative left-1/2 right-1/2 w-screen -translate-x-1/2 pt-0 pb-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
        <div className='h-60 w-full animate-pulse rounded-3xl bg-white/75' />
      </section>
    )
  }

  if (error) {
    return (
      <section className='relative left-1/2 right-1/2 w-screen -translate-x-1/2 pt-0 pb-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
        <div className='w-full rounded-3xl bg-red-50 p-6 text-center text-sm text-red-600'>
          {error}
        </div>
      </section>
    )
  }

  return (
    <section className='relative left-1/2 right-1/2 w-screen -translate-x-1/2 pt-0 pb-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
      <div className='w-full'>
        <div className='rounded-3xl bg-white/95 p-10 shadow-[0_25px_60px_-30px_rgba(30,41,59,0.25)]'>
          <header className='flex flex-col items-center gap-2 text-center'>
            <span className='inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700'>
              Recent Activity
            </span>
            <h2 className='text-2xl font-bold text-slate-900 md:text-3xl'>Keep refining your edge</h2>
            <p className='text-sm text-slate-500 md:max-w-xl md:text-center'>
              Jump back into previous sessions or open the detailed feedback to understand how the AI rated your performance.
            </p>
          </header>

          {discussions.length === 0 ? (
            <div className='mt-10 rounded-2xl border border-dashed border-indigo-400/40 bg-indigo-50/60 p-10 text-center'>
              <h3 className='text-lg font-semibold text-indigo-700'>{emptyState.title}</h3>
              <p className='mt-2 text-sm text-indigo-600'>{emptyState.description}</p>
            </div>
          ) : (
            <div className='mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:mx-auto lg:max-w-4xl xl:max-w-5xl'>
              {discussions.map((discussion) => {
                const isActive = clickedId === discussion.id
                return (
                  <article
                    key={discussion.id}
                    className={`group relative overflow-hidden flex h-full flex-col justify-between rounded-2xl
                      ring-1 ring-slate-200 bg-gradient-to-br from-indigo-50/60 via-white to-white p-6
                      shadow-md transition
                      hover:-translate-y-1 hover:ring-indigo-300 hover:shadow-lg
                      ${isActive ? 'ring-2 ring-indigo-400 bg-indigo-50/80 scale-[0.995]' : ''}`}
                  >
                    {/* Left accent bar */}
                    <span className='pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-indigo-500 to-violet-400 opacity-70' />
                    {/* Decorative glow */}
                    <span className='pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-indigo-300/20 blur-3xl' />
                    <span className='pointer-events-none absolute -left-24 -bottom-24 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl' />

                    <div className='relative flex flex-col gap-3'>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-600'>
                          <span className='inline-block h-2 w-2 rounded-full bg-indigo-500' />
                          {discussion.practiceOption || 'Custom Track'}
                        </div>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusColor(
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
                        <div className='flex flex-wrap gap-2 text-[11px] font-medium text-indigo-700'>
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

                    {/* Actions */}
                    <div className='mt-6 flex justify-end relative'>
                      <Button
                        size='sm'
                        className={`rounded-full transition-all duration-200 shadow-sm sm:w-auto
                          ${isActive
                            ? 'bg-indigo-700 text-white hover:bg-indigo-800 px-5'
                            : 'w-full bg-indigo-600 text-white hover:bg-indigo-700 px-5'}`}
                        onClick={() => {
                          setClickedId(discussion.id)
                          setSelectedDiscussion(discussion)
                        }}
                        aria-pressed={isActive}
                      >
                        View Feedback
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          <Dialog open={!!selectedDiscussion} onOpenChange={() => setSelectedDiscussion(null)}>
            <DialogContent className='flex flex-col max-w-4xl max-h-[85vh] rounded-3xl border border-indigo-100 bg-white p-0 shadow-[0_30px_70px_-35px_rgba(30,41,59,0.45)]'>
              <div className='sticky top-0 z-10 border-b bg-white/95 backdrop-blur px-5 py-4 shrink-0'>
                <DialogHeader className='p-0'>
                  <DialogTitle className='text-lg md:text-2xl font-semibold text-slate-900'>
                    {selectedDiscussion?.topic || 'Interview Session'}
                  </DialogTitle>
                  <p className='text-xs md:text-sm text-slate-500 mt-1'>
                    {formatDate(selectedDiscussion?.createdAt)}
                  </p>
                  {(selectedDiscussion?.jobRole || selectedDiscussion?.experience) && (
                    <div className='mt-2 flex flex-wrap gap-2 text-[10px] md:text-xs font-medium text-indigo-600'>
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

                {/* Tabs */}
                <div className='mt-3 grid grid-cols-2 gap-2 md:gap-3'>
                  <button
                    type='button'
                    aria-pressed={activeTab === 'conversation'}
                    onClick={() => setActiveTab('conversation')}
                    className={`w-full rounded-full px-3 py-2 text-sm md:text-base font-semibold transition
                      ${activeTab === 'conversation'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Conversations
                  </button>
                  <button
                    type='button'
                    aria-pressed={activeTab === 'feedback'}
                    onClick={() => setActiveTab('feedback')}
                    className={`w-full rounded-full px-3 py-2 text-sm md:text-base font-semibold transition
                      ${activeTab === 'feedback'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Feedback
                  </button>
                </div>
              </div>

              <div className='flex-1 min-h-0 overflow-y-auto p-5 md:p-6 overscroll-contain'>
                {activeTab === 'conversation' && (
                  <section>
                    {/* <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-500'>
                      <span className='text-lg'>🗨️</span> Conversation
                    </h3> */}
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
                )}

                {activeTab === 'feedback' && (
                  <section>
                    <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-500'>
                      <span className='text-lg'>💡</span> AI Feedback
                    </h3>
                    <div className='space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-b from-yellow-50/60 to-white p-4 shadow-inner'>
                      {selectedDiscussion?.feedback?.length ? (
                        selectedDiscussion.feedback.map((fb, index) => (
                          <div
                            key={index}
                            className={`rounded-xl border p-4 transition ${
                              fb.strength ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className='mb-2 flex items-center gap-2'>
                              <span
                                className={`text-sm font-semibold ${
                                  fb.strength ? 'text-green-700' : 'text-red-700'
                                }`}
                              >
                                {fb.strength ? '✅ Strength' : '⚠️ Area for Improvement'}
                              </span>
                            </div>
                            <div className='mb-2 text-sm text-slate-700'>
                              <strong className='text-slate-900'>Point:</strong> {fb.point}
                            </div>
                            <div className='text-sm text-slate-700'>
                              <strong className='text-slate-900'>Feedback:</strong> {fb.feedback}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className='rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center text-sm text-indigo-600'>
                          Feedback will be available once analysis completes.
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </section>
  )
};

export default History