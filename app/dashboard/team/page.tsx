'use client'

import { useState } from 'react'
import { useMembers } from '@/hooks/use-members'
import { memberColor, memberLabel } from '@/lib/member-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Trash2, UserCircle2, MessageCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function TeamPage() {
  const { members, loading, deleteMember } = useMembers()
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(Number(id))
    await deleteMember(id)
    setDeletingId(null)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Team Members</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Members are auto-registered when they send a message in your Telegram group.
          They can then be assigned to tasks on the board.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center gap-3 border-2 border-dashed border-border rounded-xl">
          <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No members yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Anyone who sends a message in your Telegram group will appear here automatically.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Make sure the webhook is registered in Settings first.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(member => {
            const color = memberColor(member)
            const label = memberLabel(member)
            return (
              <Card key={member.id} className="border-border/60">
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  {/* Avatar circle */}
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {(member.telegram_username?.[0] ?? member.telegram_id?.[0] ?? '?').toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{label}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {member.telegram_id && (
                        <span>ID: {member.telegram_id}</span>
                      )}
                      {member.created_at && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span>Joined {format(new Date(member.created_at), 'MMM d, yyyy')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Telegram badge */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium shrink-0">
                    Telegram
                  </span>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(String(member.id))}
                    disabled={deletingId === member.id}
                  >
                    {deletingId === member.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
