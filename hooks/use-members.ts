'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/types/database'
import { toast } from 'sonner'

export function useMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('name', { ascending: true })
    if (error) {
      toast.error('Failed to load members')
    } else {
      setMembers(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  async function createMember(payload: { name: string; color?: string; avatar_url?: string }) {
    const { data, error } = await supabase
      .from('members')
      .insert({
        name: payload.name,
        color: payload.color ?? '#6366f1',
        avatar_url: payload.avatar_url ?? null,
      })
      .select()
      .single()
    if (error) {
      toast.error('Failed to create member')
      return null
    }
    toast.success('Member added')
    await fetchMembers()
    return data
  }

  async function deleteMember(id: string) {
    const { error } = await supabase.from('members').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete member')
      return
    }
    toast.success('Member removed')
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  return { members, loading, fetchMembers, createMember, deleteMember }
}
