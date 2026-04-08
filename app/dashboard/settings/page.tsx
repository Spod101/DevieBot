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
import { Loader2, Bot, Send, RefreshCw, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const supabase = createClient()
  const [config, setConfig] = useState<TelegramConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`

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
        standup_message_template: config.standup_message_template,
      })
      .eq('id', config.id)

    if (error) {
      toast.error('Failed to save settings')
    } else {
      toast.success('Settings saved')
    }
    setSaving(false)
  }

  async function handleTestStandup() {
    setTesting(true)
    const res = await fetch('/api/standup', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast.success('Standup sent to Telegram!')
    } else {
      toast.error(data.error || 'Failed to send standup')
    }
    setTesting(false)
  }

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function registerWebhook() {
    if (!config?.bot_token) {
      toast.error('Enter your bot token first')
      return
    }
    const res = await fetch(
      `https://api.telegram.org/bot${config.bot_token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    )
    const data = await res.json()
    if (data.ok) {
      toast.success('Webhook registered with Telegram!')
    } else {
      toast.error(data.description || 'Failed to register webhook')
    }
  }

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
        <p className="text-muted-foreground text-sm mt-1">Configure Telegram bot and standup settings</p>
      </div>

      {/* Telegram Bot Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Telegram Bot</CardTitle>
          </div>
          <CardDescription>
            Connect your Telegram bot to enable commands and standup reports
          </CardDescription>
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
            <p className="text-xs text-muted-foreground">
              Get this from @BotFather on Telegram
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Group Chat ID</Label>
            <Input
              value={config.chat_id ?? ''}
              onChange={e => setConfig({ ...config, chat_id: e.target.value })}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              Add your bot to the group, send a message, then get the chat_id from the bot API
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="text-xs text-muted-foreground" />
              <Button variant="outline" size="icon" onClick={copyWebhook}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" onClick={registerWebhook}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Register
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click "Register" to set this as your bot's webhook URL automatically
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Standup Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Daily Standup</CardTitle>
          </div>
          <CardDescription>Configure automated daily standup reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Standup</Label>
              <p className="text-xs text-muted-foreground">Send daily standup to Telegram group</p>
            </div>
            <Switch
              checked={config.standup_enabled}
              onCheckedChange={v => setConfig({ ...config, standup_enabled: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Standup Time</Label>
            <Input
              type="time"
              value={config.standup_time}
              onChange={e => setConfig({ ...config, standup_time: e.target.value })}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Configure your cronjob to call POST /api/standup at this time
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Test Standup</p>
              <p className="text-xs text-muted-foreground">Send a standup report to your group now</p>
            </div>
            <Button variant="outline" onClick={handleTestStandup} disabled={testing}>
              {testing
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <Send className="h-4 w-4 mr-1.5" />}
              Send Now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
        Save Settings
      </Button>
    </div>
  )
}
