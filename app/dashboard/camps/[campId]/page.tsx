'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp } from '@/types/database'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { CampFormDialog } from '@/components/camps/camp-form-dialog'
import { useCamps } from '@/hooks/use-camps'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  CalendarDays, ExternalLink, Pencil, ArrowLeft, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default function CampBoardPage() {
  const { campId } = useParams<{ campId: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { updateCamp, deleteCamp } = useCamps()

  const [camp, setCamp] = useState<CodeCamp | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    fetchCamp()
  }, [campId])

  async function fetchCamp() {
    const { data } = await supabase
      .from('code_camps')
      .select('*')
      .eq('id', campId)
      .single()
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Camp header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/camps')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Camps
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{camp.name}</h1>
              <Badge className={cn('text-xs', statusStyles[camp.status])}>{camp.status}</Badge>
            </div>
            {camp.description && (
              <p className="text-muted-foreground text-sm mt-1">{camp.description}</p>
            )}

            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {/* Progress */}
              <div className="flex items-center gap-2 min-w-40">
                <span className="text-xs text-muted-foreground shrink-0">Progress</span>
                <Progress value={camp.progress} className="h-1.5 flex-1" />
                <span className="text-xs font-medium">{camp.progress}%</span>
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
                <div className="flex items-center gap-2 flex-wrap">
                  {camp.resources.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {r.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit Camp
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Kanban board for this camp */}
      <KanbanBoard campId={campId} />

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
