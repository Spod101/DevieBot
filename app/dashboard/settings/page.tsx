'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TelegramConfig } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Bot, Send, Webhook, CheckCircle2, XCircle, RefreshCw,
  Sun, Moon, Monitor, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'

// ── Theme-adaptive primitives ────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('rounded-2xl p-5 space-y-4', className)}
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {children}
    </div>
  )
}

function CardHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType
  title: string
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
      >
        <Icon className="h-4 w-4" style={{ color: 'var(--primary)' }} />
      </div>
      <span className="font-semibold text-foreground">{title}</span>
      {badge && <div className="ml-auto">{badge}</div>}
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
      style={{
        background: ok ? 'rgba(16,185,129,0.12)' : 'color-mix(in srgb, var(--border) 60%, transparent)',
        color: ok ? '#10b981' : 'var(--muted-foreground)',
        border: ok ? '1px solid rgba(16,185,129,0.22)' : '1px solid var(--border)',
        fontFamily: 'var(--font-jetbrains-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {label}
    </span>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border)' }} />
}

function OutlineBtn({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40',
        className
      )}
      style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
    >
      {children}
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()

  const [config, setConfig]         = useState<TelegramConfig | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [testing, setTesting]       = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [logs, setLogs]             = useState<{ time: string; status: 'ok' | 'error' | 'info'; msg: string }[]>([])
  const [webhookInfo, setWebhookInfo] = useState<{
    url?: string; last_error?: string; pending_count?: number
  } | null>(null)
  const [checkingWebhook,     setCheckingWebhook]     = useState(false)
  const [registeringWebhook,  setRegisteringWebhook]  = useState(false)
  const [syncingCommands,     setSyncingCommands]     = useState(false)

  function addLog(status: 'ok' | 'error' | 'info', msg: string) {
    const time = new Date().toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setLogs(prev => [{ time, status, msg }, ...prev].slice(0, 20))
  }

  async function checkWebhook() {
    setCheckingWebhook(true)
    try {
      const res  = await fetch('/api/telegram/webhook')
      const data = await res.json()
      if (data.ok) {
        setWebhookInfo(data.result)
        if (!data.result?.url) addLog('error', 'Webhook not registered')
        else addLog('ok', `Webhook active: ${data.result.url}`)
      } else {
        addLog('error', data.error || 'Failed to check webhook')
      }
    } catch { addLog('error', 'Could not reach Telegram API') }
    setCheckingWebhook(false)
  }

  async function registerWebhook() {
    if (!config?.bot_token) { toast.error('Save your bot token first'); return }
    setRegisteringWebhook(true)
    try {
      const res  = await fetch('/api/telegram/register', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Webhook registered!')
        addLog('ok', `Registered webhook`)
        await checkWebhook()
      } else {
        toast.error(data.description || data.error || 'Failed')
        addLog('error', data.description || data.error || 'Registration failed')
      }
    } catch { addLog('error', 'Could not register webhook') }
    setRegisteringWebhook(false)
  }

  async function handleSyncCommands() {
    if (!configured) { toast.error('Save your bot token first'); return }
    setSyncingCommands(true)
    addLog('info', 'Syncing bot command list...')
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      const res  = await fetch(`${base}/api/telegram/setup`)
      const data = await res.json()
      if (data.ok) {
        toast.success('Bot commands synced!')
        addLog('ok', 'Command list updated on Telegram')
      } else {
        toast.error(data.description || 'Sync failed')
        addLog('error', data.description || 'Command sync failed')
      }
    } catch { addLog('error', 'Could not reach Telegram API') }
    setSyncingCommands(false)
  }

  useEffect(() => { fetchConfig(); checkWebhook() }, [])

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
        chat_id:         config.chat_id,
        bot_token:       config.bot_token,
        standup_time:    config.standup_time,
        standup_enabled: config.standup_enabled,
      })
      .eq('id', config.id)
    if (error) { toast.error('Failed to save'); addLog('error', 'Save failed') }
    else        { toast.success('Settings saved'); addLog('ok', 'Settings saved') }
    setSaving(false)
  }

  async function handleTestStandup() {
    setTesting(true)
    addLog('info', 'Sending DSU to Telegram...')
    const res  = await fetch('/api/standup', { method: 'POST' })
    const data = await res.json()
    if (data.ok) { toast.success('Standup sent!'); addLog('ok', 'DSU delivered') }
    else          { toast.error(data.error || 'Failed'); addLog('error', data.error || 'Delivery failed') }
    setTesting(false)
  }

  async function handlePreview() {
    setPreviewing(true)
    addLog('info', 'Generating preview...')
    const res  = await fetch('/api/standup')
    const data = await res.json()
    if (data.ok) { setPreviewMsg(data.message); addLog('ok', 'Preview generated') }
    else          { toast.error(data.error || 'Failed'); addLog('error', data.error || 'Preview failed') }
    setPreviewing(false)
  }

  const configured = !!(config?.bot_token && config?.chat_id)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }
  if (!config) return null

  const themeOptions = [
    { value: 'light',  label: 'Light',  icon: Sun     },
    { value: 'dark',   label: 'Dark',   icon: Moon    },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const

  return (
    <div className="p-6 space-y-5">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div>
        <div className="mono-tag mb-2">
          <span className="lime-dot" />
          <span>Configuration</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          Telegram integration and standup configuration
        </p>
      </div>

      {/* ── 2-column grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ════ LEFT COLUMN ════ */}
        <div className="space-y-5">

          {/* Appearance */}
          <Card>
            <CardHeader icon={Sun} title="Appearance" />
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const active = theme === value
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className="flex flex-col items-center gap-2.5 rounded-xl py-4 text-sm font-medium transition-all"
                    style={{
                      background: active
                        ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                        : 'var(--secondary)',
                      border: active
                        ? '1.5px solid color-mix(in srgb, var(--primary) 40%, transparent)'
                        : '1px solid var(--border)',
                      color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--accent)'
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Telegram Bot */}
          <Card>
            <CardHeader
              icon={Bot}
              title="Telegram Bot"
              badge={<StatusBadge ok={configured} label={configured ? 'Connected' : 'Not configured'} />}
            />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bot Token</Label>
                <Input
                  type="password"
                  value={config.bot_token ?? ''}
                  onChange={e => setConfig({ ...config, bot_token: e.target.value })}
                  placeholder="123456789:ABCdef..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Group Chat ID</Label>
                <Input
                  value={config.chat_id ?? ''}
                  onChange={e => setConfig({ ...config, chat_id: e.target.value })}
                  placeholder="-1001234567890"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-lime w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </Card>
        </div>

        {/* ════ RIGHT COLUMN ════ */}
        <div className="space-y-5">

          {/* Bot Connection */}
          <Card>
            <CardHeader
              icon={Webhook}
              title="Bot Connection"
              badge={
                webhookInfo && (
                  <div className={cn('flex items-center gap-1.5 text-xs font-medium')}>
                    {webhookInfo.url
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-500">Active</span></>
                      : <><XCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Not registered</span></>
                    }
                  </div>
                )
              }
            />

            {webhookInfo && (
              <div
                className="rounded-xl p-3 space-y-1 text-xs"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                <p className="text-muted-foreground">
                  URL:{' '}
                  <span className="text-foreground break-all">
                    {webhookInfo.url || '— not set'}
                  </span>
                </p>
                {webhookInfo.pending_count !== undefined && (
                  <p className="text-muted-foreground">
                    Pending: <span className="text-foreground">{webhookInfo.pending_count}</span>
                  </p>
                )}
                {webhookInfo.last_error && (
                  <p className="text-destructive">Error: {webhookInfo.last_error}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <OutlineBtn onClick={checkWebhook} disabled={checkingWebhook} className="flex-1">
                {checkingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Check Status
              </OutlineBtn>
              <button
                onClick={registerWebhook}
                disabled={registeringWebhook || !configured}
                className="btn-lime flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold disabled:opacity-40"
              >
                {registeringWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                Register
              </button>
            </div>

            <OutlineBtn onClick={handleSyncCommands} disabled={syncingCommands || !configured} className="w-full">
              {syncingCommands ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              Sync Bot Commands
            </OutlineBtn>
          </Card>

          {/* Daily Standup */}
          <Card>
            <CardHeader icon={Send} title="Daily Standup (DSU)" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-standup</p>
                <p className="text-xs text-muted-foreground mt-0.5">Triggers via your external cron job</p>
              </div>
              <Switch
                checked={config.standup_enabled}
                onCheckedChange={v => setConfig({ ...config, standup_enabled: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Time (Manila / PHT)</Label>
              <Input
                type="time"
                value={config.standup_time}
                onChange={e => setConfig({ ...config, standup_time: e.target.value })}
                className="w-full sm:w-36"
              />
            </div>

            <Divider />

            <div className="flex gap-2">
              <OutlineBtn onClick={handlePreview} disabled={previewing} className="flex-1">
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Preview
              </OutlineBtn>
              <button
                onClick={handleTestStandup}
                disabled={testing || !configured}
                className="btn-lime flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold disabled:opacity-40"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Now
              </button>
            </div>

            {/* Preview block */}
            {previewMsg && (
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <p
                  className="text-[10px] font-semibold mb-2"
                  style={{
                    color: 'var(--primary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2em',
                  }}
                >
                  Preview
                </p>
                <pre
                  className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/75"
                  style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {previewMsg}
                </pre>
              </div>
            )}

            {/* Activity Log */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
              >
                <p
                  className="text-[10px] font-semibold text-muted-foreground"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                  }}
                >
                  Activity Log
                </p>
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div
                className="p-3 space-y-1.5 min-h-[56px] max-h-48 overflow-y-auto styled-scroll"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {logs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50">Waiting for activity...</p>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-muted-foreground shrink-0">{entry.time}</span>
                      <span
                        className="text-[10px] shrink-0"
                        style={{
                          color: entry.status === 'ok'    ? '#10b981'
                               : entry.status === 'error' ? 'var(--destructive)'
                               : '#60a5fa',
                        }}
                      >
                        {entry.status === 'ok' ? '✓' : entry.status === 'error' ? '✗' : '·'}
                      </span>
                      <span className="text-xs text-foreground/70">{entry.msg}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
