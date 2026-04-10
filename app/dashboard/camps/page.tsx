'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamps } from '@/hooks/use-camps'
import { CampFormDialog } from '@/components/camps/camp-form-dialog'
import type { CodeCamp } from '@/types/database'
import {
  Plus, Loader2, Tent, CalendarDays, ExternalLink, Pencil, ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'

function campDot(status: string): string {
  if (status === 'active')    return 'var(--primary)'
  if (status === 'paused')    return '#eab308'
  if (status === 'completed') return '#10b981'
  return 'var(--muted-foreground)'
}

const campStatusLabel: Record<string, string> = {
  active:    'Active',
  paused:    'Paused',
  completed: 'Completed',
  archived:  'Archived',
}

export default function CampsPage() {
  const router = useRouter()
  const { camps, loading, createCamp, updateCamp, deleteCamp } = useCamps()
  const [dialogOpen, setDialogOpen]     = useState(false)
  const [selectedCamp, setSelectedCamp] = useState<Partial<CodeCamp> | null>(null)

  function openNew() { setSelectedCamp({}); setDialogOpen(true) }

  function openEdit(camp: CodeCamp, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedCamp(camp)
    setDialogOpen(true)
  }

  async function handleSave(payload: Partial<CodeCamp>) {
    if (payload.id) {
      await updateCamp(payload.id, payload)
    } else {
      const camp = await createCamp(payload)
      if (camp) router.push(`/dashboard/camps/${camp.id}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div className="p-6">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="mono-tag mb-2">
            <span className="lime-dot" />
            <span>Programs</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Code Camps</h1>
          <p className="text-sm mt-1 text-muted-foreground">
            {camps.length} camp{camps.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={openNew}
          className="btn-lime flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New Camp
        </button>
      </div>

      {/* ── Empty state ───────────────────────────────────────── */}
      {camps.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-64 rounded-2xl cursor-pointer transition-all"
          style={{
            border: '2px dashed color-mix(in srgb, var(--primary) 25%, transparent)',
            background: 'color-mix(in srgb, var(--primary) 3%, transparent)',
          }}
          onClick={openNew}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 45%, transparent)'
            ;(e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--primary) 6%, transparent)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 25%, transparent)'
            ;(e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--primary) 3%, transparent)'
          }}
        >
          <Tent className="h-10 w-10 mb-3 opacity-30" style={{ color: 'var(--primary)' }} />
          <p className="font-semibold text-muted-foreground">No Code Camps yet</p>
          <p className="text-sm mt-1 text-muted-foreground/60">Click to create your first camp</p>
        </div>
      ) : (
        /* ── Camp grid ──────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {camps.map(camp => {
            const dot   = campDot(camp.status)
            const label = campStatusLabel[camp.status] ?? camp.status
            return (
              <div
                key={camp.id}
                className="rounded-2xl p-5 cursor-pointer group transition-all"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                onClick={() => router.push(`/dashboard/camps/${camp.id}`)}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${dot} 35%, transparent)`
                  ;(e.currentTarget as HTMLElement).style.background  = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                  ;(e.currentTarget as HTMLElement).style.background  = 'var(--card)'
                }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
                    <h3 className="font-semibold text-foreground truncate">{camp.name}</h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={e => openEdit(camp, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        background: `color-mix(in srgb, ${dot} 14%, transparent)`,
                        color: dot,
                        fontFamily: 'var(--font-jetbrains-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {camp.description && (
                  <p className="text-xs mb-3 line-clamp-2 text-muted-foreground">
                    {camp.description}
                  </p>
                )}

                {/* Progress */}
                <div className="mb-3">
                  <div
                    className="flex justify-between text-[10px] mb-1.5 text-muted-foreground/60"
                    style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                  >
                    <span>Progress</span>
                    <span>{camp.progress}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden bg-border">
                    <div className="h-full rounded-full transition-all" style={{ width: `${camp.progress}%`, background: dot }} />
                  </div>
                </div>

                {/* Dates */}
                {(camp.start_date || camp.end_date) && (
                  <div className="flex items-center gap-1.5 text-xs mb-2 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {camp.start_date && format(new Date(camp.start_date), 'MMM d')}
                    {camp.start_date && camp.end_date && ' → '}
                    {camp.end_date && format(new Date(camp.end_date), 'MMM d, yyyy')}
                  </div>
                )}

                {/* Resources */}
                {camp.resources && camp.resources.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {camp.resources.slice(0, 2).map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-70"
                        style={{ color: 'var(--primary)' }}
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {r.title}
                      </a>
                    ))}
                    {camp.resources.length > 2 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        +{camp.resources.length - 2} more
                      </span>
                    )}
                  </div>
                )}

                {/* Open board */}
                <div
                  className="flex items-center gap-1 text-xs opacity-40 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--primary)' }}
                >
                  Open board <ArrowRight className="h-3 w-3 ml-0.5" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CampFormDialog
        camp={selectedCamp}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={deleteCamp}
      />
    </div>
  )
}
