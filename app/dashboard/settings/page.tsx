'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TelegramConfig } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, Bot, Send, Sun, Moon, Monitor, Webhook, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()

  const [config, setConfig] = useState<TelegramConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [logs, setLogs] = useState<{ time: string; status: 'ok' | 'error' | 'info'; msg: string }[]>([])
  const [webhookInfo, setWebhookInfo] = useState<{ url?: string; last_error?: string; pending_count?: number } | null>(null)
  const [checkingWebhook, setCheckingWebhook] = useState(false)
  const [registeringWebhook, setRegisteringWebhook] = useState(false)

  function addLog(status: 'ok' | 'error' | 'info', msg: string) {
    const time = new Date().toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setLogs(prev => [{ time, status, msg }, ...prev].slice(0, 20))
  }

  async function checkWebhook() {
    setCheckingWebhook(true)
    try {
      const res = await fetch('/api/telegram/webhook')
      const data = await res.json()
      if (data.ok) {
        setWebhookInfo(data.result)
        if (!data.result?.url) addLog('error', 'Webhook not registered — bot cannot receive messages')
        else addLog('ok', `Webhook active: ${data.result.url}`)
      } else {
        addLog('error', data.error || 'Failed to check webhook')
      }
    } catch {
      addLog('error', 'Could not reach Telegram API')
    }
    setCheckingWebhook(false)
  }

  async function registerWebhook() {
    if (!config?.bot_token) { toast.error('Save your bot token first'); return }
    setRegisteringWebhook(true)
    const webhookUrl = `${window.location.origin}/api/telegram/webhook`
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${config.bot_token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      )
      const data = await res.json()
      if (data.ok) {
        toast.success('Webhook registered!')
        addLog('ok', `Webhook registered → ${webhookUrl}`)
        await checkWebhook()
      } else {
        toast.error(data.description || 'Failed to register')
        addLog('error', data.description || 'Webhook registration failed')
      }
    } catch {
      addLog('error', 'Could not reach Telegram API')
    }
    setRegisteringWebhook(false)
  }

  useEffect(() => {
    fetchConfig()
    checkWebhook()
  }, [])

  async function fetchConfig() {
    const { data } = await supabase.from('telegram_config').select('*').limit(1).single()
    if (data) setConfig(data)
    setLoading(false)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    const { error } = await supabase
      .from('telegram_config')
      .update({
        chat_id: config.chat_id,
        bot_token: config.bot_token,
        standup_time: config.standup_time,
        standup_enabled: config.standup_enabled,
      })
      .eq('id', config.id)
    if (error) {
      toast.error('Failed to save settings')
      addLog('error', 'Settings save failed')
    } else {
      toast.success('Settings saved')
      addLog('ok', 'Settings saved successfully')
    }
    setSaving(false)
  }

  async function handleTestStandup() {
    setTesting(true)
    addLog('info', 'Sending DSU to Telegram...')
    const res = await fetch('/api/standup', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast.success('Standup sent to Telegram!')
      addLog('ok', 'DSU delivered to Telegram group')
    } else {
      toast.error(data.error || 'Failed to send standup')
      addLog('error', data.error || 'Delivery failed')
    }
    setTesting(false)
  }

  async function handlePreview() {
    setPreviewing(true)
    addLog('info', 'Generating DSU preview...')
    const res = await fetch('/api/standup')
    const data = await res.json()
    if (data.ok) {
      setPreviewMsg(data.message)
      addLog('ok', 'Preview generated')
    } else {
      toast.error(data.error || 'Failed to generate preview')
      addLog('error', data.error || 'Preview generation failed')
    }
    setPreviewing(false)
  }

  const configured = !!(config?.bot_token && config?.chat_id)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Appearance and Telegram configuration</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Appearance</CardTitle>
          </div>
          <CardDescription>Choose your preferred color theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {([
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark',  label: 'Dark',  icon: Moon },
              { value: 'system',label: 'System',icon: Monitor },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 rounded-xl border-2 py-4 transition-all',
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-foreground/30'
                )}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bot Credentials */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Telegram Bot</CardTitle>
            {configured
              ? <Badge className="ml-auto bg-green-500/20 text-green-600 border-green-500/30">Connected</Badge>
              : <Badge variant="outline" className="ml-auto text-muted-foreground">Not configured</Badge>
            }
          </div>
          <CardDescription>Bot token and group to send messages to</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bot Token</Label>
            <Input
              type="password"
              value={config.bot_token ?? ''}
              onChange={e => setConfig({ ...config, bot_token: e.target.value })}
              placeholder="123456789:ABCdef..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Group Chat ID</Label>
            <Input
              value={config.chat_id ?? ''}
              onChange={e => setConfig({ ...config, chat_id: e.target.value })}
              placeholder="-1001234567890"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Webhook Connection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Bot Connection</CardTitle>
            {webhookInfo && (
              webhookInfo.url
                ? <Badge className="ml-auto bg-green-500/20 text-green-600 border-green-500/30 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
                : <Badge variant="outline" className="ml-auto text-destructive border-destructive/30 flex items-center gap-1"><XCircle className="h-3 w-3" />Not registered</Badge>
            )}
          </div>
          <CardDescription>
            The webhook lets Telegram deliver messages to this app — required for auto-member sync and bot commands
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhookInfo && (
            <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1 text-xs font-mono">
              <p className="text-muted-foreground">URL: <span className="text-foreground">{webhookInfo.url || '— not set'}</span></p>
              {webhookInfo.pending_count !== undefined && (
                <p className="text-muted-foreground">Pending updates: <span className="text-foreground">{webhookInfo.pending_count}</span></p>
              )}
              {webhookInfo.last_error && (
                <p className="text-destructive">Last error: {webhookInfo.last_error}</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={checkWebhook} disabled={checkingWebhook} className="flex-1">
              {checkingWebhook ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Check Status
            </Button>
            <Button onClick={registerWebhook} disabled={registeringWebhook || !configured} className="flex-1">
              {registeringWebhook ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Webhook className="h-4 w-4 mr-1.5" />}
              Register Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Standup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Daily Standup (DSU)</CardTitle>
          </div>
          <CardDescription>Automated daily report sent to your Telegram group</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Auto-standup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Triggers via your external cron job</p>
            </div>
            <Switch
              checked={config.standup_enabled}
              onCheckedChange={v => setConfig({ ...config, standup_enabled: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Standup Time (Manila)</Label>
            <Input
              type="time"
              value={config.standup_time}
              onChange={e => setConfig({ ...config, standup_time: e.target.value })}
              className="w-32"
            />
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePreview} disabled={previewing} className="flex-1">
              {previewing
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <Bot className="h-4 w-4 mr-1.5" />}
              Preview DSU
            </Button>
            <Button onClick={handleTestStandup} disabled={testing || !configured} className="flex-1">
              {testing
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <Send className="h-4 w-4 mr-1.5" />}
              Send Now
            </Button>
          </div>

          {previewMsg && (
            <div className="rounded-lg bg-muted/60 border border-border/50 p-3">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-widest">Preview</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{previewMsg}</pre>
            </div>
          )}

          {/* Activity Log */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Activity Log</p>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="font-mono text-xs p-3 space-y-1.5 min-h-[56px] max-h-40 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-muted-foreground/50 text-[11px]">Waiting for activity...</p>
              ) : (
                logs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 shrink-0">{entry.time}</span>
                    <span className={cn(
                      'shrink-0',
                      entry.status === 'ok'    && 'text-green-500',
                      entry.status === 'error' && 'text-destructive',
                      entry.status === 'info'  && 'text-blue-400',
                    )}>
                      {entry.status === 'ok' ? '✓' : entry.status === 'error' ? '✗' : '·'}
                    </span>
                    <span className="text-foreground/80">{entry.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
