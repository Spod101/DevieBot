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
      .order('cohort', { ascending: false })   // cohort4 before cohort3
      .order('name',   { ascending: true })
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

  async function createMember(payload: {
    name: string
    telegram_username?: string
    telegram_id?: string
    cohort: string
  }) {
    const { data, error } = await supabase
      .from('members')
      .insert({
        name:              payload.name.trim(),
        telegram_id:       payload.telegram_id?.trim()       || null,
        telegram_username: payload.telegram_username?.trim() || null,
        cohort:            payload.cohort,
      })
      .select()
      .single()
    if (error) {
      toast.error('Failed to add member')
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
    setMembers(prev => prev.filter(m => String(m.id) !== String(id)))
  }

  return { members, loading, fetchMembers, createMember, deleteMember }
}
