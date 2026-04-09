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
import { Loader2, Bot, Send, Sun, Moon, Monitor, RefreshCw, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

const SETUP_STEPS = [
  {
    label: 'Create a Telegram bot',
    detail: 'Message @BotFather on Telegram → /newbot → copy the token',
  },
  {
    label: 'Add the bot to your group',
    detail: 'Open your DEVCON group → Add Member → search your bot',
  },
  {
    label: 'Get your Group Chat ID',
    detail: 'Send a message in the group, then visit: https://api.telegram.org/bot<TOKEN>/getUpdates — look for "chat":{"id":...}',
  },
  {
    label: 'Enter Bot Token + Chat ID below and save',
    detail: 'Paste the values in the fields below, click Save Settings',
  },
  {
    label: 'Register the webhook',
    detail: 'Click "Register Webhook" so Telegram can deliver bot commands (/tasks, /addtask, etc.)',
  },
  {
    label: 'Test the standup',
    detail: 'Click "Send Now" to verify the bot posts the daily DSU to your group',
  },
]

export default function SettingsPage() {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()

  const [config, setConfig] = useState<TelegramConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    fetchConfig()
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

    if (error) toast.error('Failed to save settings')
    else toast.success('Settings saved')
    setSaving(false)
  }

  async function handleTestStandup() {
    setTesting(true)
    const res = await fetch('/api/standup', { method: 'POST' })
    const data = await res.json()
    if (data.ok) toast.success('Standup sent to Telegram!')
    else toast.error(data.error || 'Failed to send standup')
    setTesting(false)
  }

  async function handlePreview() {
    setPreviewing(true)
    const res = await fetch('/api/standup')
    const data = await res.json()
    if (data.ok) setPreviewMsg(data.message)
    else toast.error(data.error || 'Failed to generate preview')
    setPreviewing(false)
  }

  async function registerWebhook() {
    if (!config?.bot_token) {
      toast.error('Enter your bot token first and save')
      return
    }
    setRegistering(true)
    const webhookUrl = `${window.location.origin}/api/telegram/webhook`
    const res = await fetch(
      `https://api.telegram.org/bot${config.bot_token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    )
    const data = await res.json()
    if (data.ok) toast.success('Webhook registered! Bot commands are now active.')
    else toast.error(data.description || 'Failed to register webhook')
    setRegistering(false)
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
        <p className="text-muted-foreground text-sm mt-1">Telegram bot, standup, and appearance</p>
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
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
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

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Telegram Bot Setup</CardTitle>
            {configured
              ? <Badge className="ml-auto bg-green-500/20 text-green-600 border-green-500/30">Connected</Badge>
              : <Badge variant="outline" className="ml-auto text-muted-foreground">Not configured</Badge>
            }
          </div>
          <CardDescription>Follow these steps to connect your bot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SETUP_STEPS.map((step, i) => {
            const done = i < 4 ? configured : false
            return (
              <div key={i} className="flex gap-3">
                {done
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium leading-snug">{step.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Bot credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bot Credentials</CardTitle>
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
            <p className="text-xs text-muted-foreground">From @BotFather → /newbot</p>
          </div>

          <div className="space-y-1.5">
            <Label>Group Chat ID</Label>
            <Input
              value={config.chat_id ?? ''}
              onChange={e => setConfig({ ...config, chat_id: e.target.value })}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              Visit <code className="bg-muted px-1 rounded text-[11px]">api.telegram.org/bot{'<TOKEN>'}/getUpdates</code> after sending a group message
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save Settings
            </Button>
            <Button variant="outline" onClick={registerWebhook} disabled={registering || !config.bot_token}>
              {registering
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <RefreshCw className="h-4 w-4 mr-1.5" />}
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
          <CardDescription>
            Automated daily report sent to your Telegram group
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Auto-standup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Requires a cron job hitting <code className="bg-muted px-1 rounded text-[11px]">POST /api/standup</code>
              </p>
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
            <p className="text-xs text-muted-foreground">
              Schedule your cron job to run at this time (Philippine Standard Time)
            </p>
          </div>

          <Separator />

          {/* Cron setup hint */}
          <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Cron job setup (e.g. cron-job.org or Vercel Cron)</p>
            <p className="text-xs text-muted-foreground">URL: <code className="bg-background px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/api/standup</code></p>
            <p className="text-xs text-muted-foreground">Method: <code className="bg-background px-1 rounded">POST</code></p>
            <p className="text-xs text-muted-foreground">Schedule example at 9 AM PHT: <code className="bg-background px-1 rounded">0 1 * * *</code> (UTC)</p>
          </div>

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
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Message Preview</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{previewMsg}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
