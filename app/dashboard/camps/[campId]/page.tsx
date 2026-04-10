'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp } from '@/types/database'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { CampFormDialog } from '@/components/camps/camp-form-dialog'
import { useCamps } from '@/hooks/use-camps'
import { Button } from '@/components/ui/button'
import { CalendarDays, ExternalLink, Pencil, ArrowLeft, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

function campDot(status: string): string {
  if (status === 'active')    return 'var(--primary)'
  if (status === 'paused')    return '#eab308'
  if (status === 'completed') return '#10b981'
  return 'var(--muted-foreground)'
}

export default function CampBoardPage() {
  const { campId } = useParams<{ campId: string }>()
  const router     = useRouter()
  const supabase   = createClient()
  const { updateCamp, deleteCamp } = useCamps()

  const [camp, setCamp]       = useState<CodeCamp | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => { fetchCamp() }, [campId])

  async function fetchCamp() {
    const { data } = await supabase.from('code_camps').select('*').eq('id', campId).single()
    setCamp(data)
    setLoading(false)
  }

  async function handleSave(payload: Partial<CodeCamp>) {
    if (!payload.id) return
    await updateCamp(payload.id, payload)
    await fetchCamp()
  }

  async function handleDelete(id: string) {
    await deleteCamp(id)
    router.push('/dashboard/camps')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  if (!camp) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Camp not found.</p>
        <Button variant="ghost" onClick={() => router.push('/dashboard/camps')} className="mt-2">
          Go back
        </Button>
      </div>
    )
  }

  const dot = campDot(camp.status)

  return (
    <div className="p-6 h-full flex flex-col">

      {/* ── Camp header ────────────────────────────────────────── */}
      <div className="mb-5 shrink-0">
        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard/camps')}
          className="flex items-center gap-1.5 text-sm mb-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Camps
        </button>

        {/* Camp info panel */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'var(--card)',
            border: `1px solid color-mix(in srgb, ${dot} 28%, var(--border))`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">

              {/* Name + status pill */}
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{camp.name}</h1>
                </div>
                <span
                  className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${dot} 14%, transparent)`,
                    color: dot,
                    fontFamily: 'var(--font-jetbrains-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {camp.status}
                </span>
              </div>

              {camp.description && (
                <p className="text-sm mb-3 text-muted-foreground">{camp.description}</p>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-5 flex-wrap">
                {/* Progress */}
                <div className="flex items-center gap-2 min-w-48">
                  <span className="text-xs shrink-0 text-muted-foreground">Progress</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden bg-border">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${camp.progress}%`, background: dot }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold shrink-0 tabular-nums"
                    style={{ color: dot, fontFamily: 'var(--font-jetbrains-mono)' }}
                  >
                    {camp.progress}%
                  </span>
                </div>

                {/* Dates */}
                {(camp.start_date || camp.end_date) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {camp.start_date && format(new Date(camp.start_date), 'MMM d, yyyy')}
                    {camp.start_date && camp.end_date && ' → '}
                    {camp.end_date && format(new Date(camp.end_date), 'MMM d, yyyy')}
                  </div>
                )}

                {/* Resources */}
                {camp.resources && camp.resources.length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {camp.resources.map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                        style={{ color: 'var(--primary)' }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {r.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 bg-secondary text-muted-foreground border border-border hover:text-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban board ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <KanbanBoard campId={campId} />
      </div>

      <CampFormDialog
        camp={camp}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
