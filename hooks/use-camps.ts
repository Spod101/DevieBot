'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp } from '@/types/database'
import { toast } from 'sonner'

export function useCamps() {
  const [camps, setCamps] = useState<CodeCamp[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchCamps() {
    setLoading(true)
    const { data, error } = await supabase
      .from('code_camps')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load camps')
    } else {
      setCamps(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchCamps() }, [])

  async function createCamp(payload: Partial<CodeCamp>) {
    const { data, error } = await supabase
      .from('code_camps')
      .insert({
        name: payload.name!,
        description: payload.description ?? null,
        status: payload.status ?? 'active',
        progress: payload.progress ?? 0,
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        resources: payload.resources ?? [],
      })
      .select()
      .single()
    if (error) { toast.error('Failed to create camp'); return null }
    toast.success('Camp created')
    await fetchCamps()
    return data
  }

  async function updateCamp(id: string, updates: Partial<CodeCamp>) {
    const { error } = await supabase.from('code_camps').update(updates).eq('id', id)
    if (error) { toast.error('Failed to update camp'); return }
    toast.success('Camp updated')
    await fetchCamps()
  }

  async function deleteCamp(id: string) {
    const { error } = await supabase.from('code_camps').delete().eq('id', id)
    if (error) { toast.error('Failed to delete camp'); return }
    toast.success('Camp deleted')
    setCamps(prev => prev.filter(c => c.id !== id))
  }

  return { camps, loading, fetchCamps, createCamp, updateCamp, deleteCamp }
}
