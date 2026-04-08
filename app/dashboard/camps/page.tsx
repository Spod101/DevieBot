'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamps } from '@/hooks/use-camps'
import { CampFormDialog } from '@/components/camps/camp-form-dialog'
import type { CodeCamp } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Plus, Loader2, Tent, CalendarDays, ExternalLink, Pencil, ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const statusStyles: Record<string, { badge: string; dot: string }> = {
  active: { badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', dot: 'bg-green-500' },
  paused: { badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', dot: 'bg-yellow-500' },
  completed: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', dot: 'bg-blue-500' },
  archived: { badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-500' },
}

export default function CampsPage() {
  const router = useRouter()
  const { camps, loading, createCamp, updateCamp, deleteCamp } = useCamps()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCamp, setSelectedCamp] = useState<Partial<CodeCamp> | null>(null)

  function openNew() {
    setSelectedCamp({})
    setDialogOpen(true)
  }

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Code Camps</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {camps.length} camp{camps.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          New Camp
        </Button>
      </div>

      {camps.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-primary transition-colors"
          onClick={openNew}
        >
          <Tent className="h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium">No Code Camps yet</p>
          <p className="text-sm">Click to create your first camp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {camps.map(camp => {
            const style = statusStyles[camp.status]
            return (
              <Card
                key={camp.id}
                className="cursor-pointer hover:shadow-md transition-all hover:border-primary/40 group"
                onClick={() => router.push(`/dashboard/camps/${camp.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <CardTitle className="text-base truncate">{camp.name}</CardTitle>
                      {camp.description && (
                        <CardDescription className="mt-1 text-xs line-clamp-2">
                          {camp.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={e => openEdit(camp, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <Badge className={cn('text-[10px] px-2', style.badge)}>
                        {camp.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{camp.progress}%</span>
                    </div>
                    <Progress value={camp.progress} className="h-1.5" />
                  </div>

                  {(camp.start_date || camp.end_date) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {camp.start_date && format(new Date(camp.start_date), 'MMM d')}
                      {camp.start_date && camp.end_date && ' → '}
                      {camp.end_date && format(new Date(camp.end_date), 'MMM d, yyyy')}
                    </div>
                  )}

                  {camp.resources && camp.resources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {camp.resources.slice(0, 2).map((r, i) => (
                        <a
                          key={i}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {r.title}
                        </a>
                      ))}
                      {camp.resources.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{camp.resources.length - 2} more</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    Open board <ArrowRight className="h-3 w-3 ml-1" />
                  </div>
                </CardContent>
              </Card>
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
