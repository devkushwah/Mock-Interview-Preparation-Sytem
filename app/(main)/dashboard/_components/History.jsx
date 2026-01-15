'use client'

import React, { useContext, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserContext } from '@/app/_context/UserContext'
import { getUserDiscussions } from '@/services/firebase/discussionService'
import { ChevronRight, Lightbulb } from 'lucide-react'

const History = () => {
  const { userData } = useContext(UserContext)
  const [discussions, setDiscussions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [activeTab, setActiveTab] = useState({}) // Store tab per discussion: { discussionId: 'summary' | 'detailed' }
  const router = useRouter()
  const searchParams = useSearchParams()
  const expandParam = searchParams?.get('expand')

  useEffect(() => {
    const fetchDiscussions = async () => {
      try {
        const result = await getUserDiscussions(userData.id, 10)
        if (result.success) {
          setDiscussions(result.data.items)
        } else {
          setError(result.error)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (userData?.id) fetchDiscussions()
  }, [userData])

  useEffect(() => {
    if (expandParam && discussions.length > 0) {
      setExpandedId(expandParam)
      // Scroll to element after render
      setTimeout(() => {
        document.getElementById(`discussion-${expandParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [expandParam, discussions])

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
    if (!activeTab[id]) {
      setActiveTab({ ...activeTab, [id]: 'summary' })
    }
  }

  const switchTab = (id, tab) => {
    setActiveTab({ ...activeTab, [id]: tab })
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreLabel = (score) => {
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Average'
    return 'Not Good'
  }

  if (loading) {
    return (
      <section className='py-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
        <div className='h-60 w-full animate-pulse rounded-3xl bg-white/75' />
      </section>
    )
  }

  if (error) {
    return (
      <section className='py-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
        <div className='rounded-3xl bg-red-50 p-6 text-center text-sm text-red-600'>{error}</div>
      </section>
    )
  }

  return (
    <section id="history" className='py-12 bg-gradient-to-br from-white via-indigo-50 to-white'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6'>
        <div className='rounded-3xl bg-white/95 p-10 shadow-2xl'>
          <header className='text-center mb-10'>
            <span className='inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700'>
              Recent Activity
            </span>
            <h2 className='mt-3 text-3xl font-bold text-slate-900'>Interview History</h2>
            <p className='mt-2 text-sm text-slate-500'>Review your past sessions and track your progress</p>
          </header>

          {discussions.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-indigo-400/40 bg-indigo-50/60 p-10 text-center'>
              <h3 className='text-lg font-semibold text-indigo-700'>No sessions yet</h3>
              <p className='mt-2 text-sm text-indigo-600'>Start your first mock interview to see it here</p>
            </div>
          ) : (
            <div className='space-y-6'>
              {discussions.map((discussion) => {
                const isExpanded = expandedId === discussion.id
                const currentTab = activeTab[discussion.id] || 'summary'
                const overallScore = discussion.feedback?.find(f => f.point === 'Overall Performance')?.overall_score || 
                                   discussion.score || 
                                   40 // fallback

                return (
                  <article
                    id={`discussion-${discussion.id}`}
                    key={discussion.id}
                    className='group overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-white shadow-md transition hover:shadow-lg'
                  >
                    {/* Collapsible Header */}
                    <button
                      onClick={() => toggleExpand(discussion.id)}
                      className='w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 transition'
                    >
                      <div className='flex-1'>
                        <div className='flex items-center gap-3 mb-2'>
                          <h3 className='text-lg font-semibold text-slate-900'>{discussion.topic || 'Untitled Session'}</h3>
                          <span className='text-xs text-slate-500'>{formatDate(discussion.createdAt)}</span>
                        </div>
                        <div className='flex flex-wrap gap-2 text-xs'>
                          <span className='rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700'>
                            {discussion.practiceOption || 'Interview'}
                          </span>
                          {discussion.role && (
                            <span className='rounded-full bg-blue-100 px-2.5 py-1 text-blue-700'>
                              {discussion.role}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className='flex items-center gap-4'>
                        <div className='text-right'>
                          <div className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
                            {overallScore}%
                          </div>
                          <div className='text-xs text-slate-500'>{getScoreLabel(overallScore)}</div>
                        </div>
                        <ChevronRight
                          className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className='border-t border-slate-200 bg-slate-50/50'>
                        {/* Tabs */}
                        <div className='flex gap-1 p-4 border-b border-slate-200 bg-white'>
                          <button
                            onClick={() => switchTab(discussion.id, 'summary')}
                            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                              currentTab === 'summary'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Summary
                          </button>
                          <button
                            onClick={() => switchTab(discussion.id, 'detailed')}
                            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                              currentTab === 'detailed'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Detailed Report
                          </button>
                        </div>

                        {/* Tab Content */}
                        <div className='p-6'>
                          {currentTab === 'summary' ? (
                            <div className='space-y-6'>
                              {/* Overall Score Card */}
                              <div className='rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200'>
                                <div className='flex items-center justify-between mb-4'>
                                  <h4 className='text-lg font-semibold text-slate-900'>Overall Score</h4>
                                  <div className='flex items-center gap-2'>
                                    <span className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
                                      {overallScore}%
                                    </span>
                                    <span className='text-xs text-slate-500'>{getScoreLabel(overallScore)}</span>
                                  </div>
                                </div>
                                <div className='h-3 w-full rounded-full bg-slate-200'>
                                  <div
                                    className={`h-3 rounded-full ${
                                      overallScore >= 70 ? 'bg-green-500' : overallScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${overallScore}%` }}
                                  />
                                </div>
                              </div>

                              {/* Strengths & Improvements */}
                              <div className='grid md:grid-cols-2 gap-4'>
                                <div className='rounded-xl bg-green-50 p-5 ring-1 ring-green-200'>
                                  <h5 className='flex items-center gap-2 text-sm font-semibold text-green-800 mb-3'>
                                    👍 What Went Well
                                  </h5>
                                  <ul className='space-y-2 text-sm text-green-700'>
                                    {discussion.feedback?.filter(f => f.status === 'Strong').slice(0, 3).map((item, idx) => (
                                      <li key={idx} className='flex items-start gap-2'>
                                        <span className='mt-0.5'>•</span>
                                        <span>{item.point}</span>
                                      </li>
                                    )) || <li className='text-green-600/70'>No specific strengths recorded</li>}
                                  </ul>
                                </div>

                                <div className='rounded-xl bg-red-50 p-5 ring-1 ring-red-200'>
                                  <h5 className='flex items-center gap-2 text-sm font-semibold text-red-800 mb-3'>
                                    🔄 What Needs Improvement
                                  </h5>
                                  <ul className='space-y-2 text-sm text-red-700'>
                                    {discussion.feedback?.filter(f => f.status === 'Weak' || f.status === 'Critical').slice(0, 3).map((item, idx) => (
                                      <li key={idx} className='flex items-start gap-2'>
                                        <span className='mt-0.5'>•</span>
                                        <span>{item.point}</span>
                                      </li>
                                    )) || <li className='text-red-600/70'>No specific improvements recorded</li>}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className='space-y-4'>
                              {/* Detailed Metrics */}
                              {discussion.feedback?.length > 0 ? (
                                discussion.feedback.map((fb, index) => {
                                  const score = fb.score || 0
                                  const getBarColor = (s) => {
                                    if (s >= 70) return 'bg-green-500'
                                    if (s >= 50) return 'bg-yellow-500'
                                    return 'bg-red-500'
                                  }

                                  return (
                                    <div key={index} className='rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200'>
                                      <div className='flex items-start justify-between mb-3'>
                                        <h5 className='text-sm font-semibold text-slate-900'>{fb.point}</h5>
                                        <span className={`text-lg font-bold ${getScoreColor(score)}`}>{score}%</span>
                                      </div>
                                      
                                      {/* Progress Bar */}
                                      <div className='h-2 w-full rounded-full bg-slate-200 mb-3'>
                                        <div className={`h-2 rounded-full ${getBarColor(score)}`} style={{ width: `${score}%` }} />
                                      </div>

                                      {/* Feedback Text */}
                                      <p className='text-sm text-slate-600 mb-3'>{fb.feedback}</p>

                                      {/* Interview Tip */}
                                      {fb.interview_tip && (
                                        <div className='flex items-start gap-2 rounded-lg bg-amber-50 p-3 mt-3'>
                                          <Lightbulb className='h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5' />
                                          <p className='text-xs text-amber-800'><strong>Tip:</strong> {fb.interview_tip}</p>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                              ) : (
                                <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500'>
                                  Detailed feedback will be available once analysis completes
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default History