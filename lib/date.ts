const DEFAULT_APP_TIME_ZONE = 'Asia/Manila'

export function getAppTimeZone(): string {
  return process.env.APP_TIME_ZONE || DEFAULT_APP_TIME_ZONE
}

function toLocalISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toUTCISODate(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayInAppTimeZoneISO(timeZone: string = getAppTimeZone()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return toLocalISODate(new Date())
  }

  return `${year}-${month}-${day}`
}

export function addDaysToISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return toUTCISODate(utc)
}

export function addBusinessDaysToISODate(isoDate: string, businessDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))

  let remaining = Math.max(0, businessDays)
  while (remaining > 0) {
    utc.setUTCDate(utc.getUTCDate() + 1)
    const weekday = utc.getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1
    }
  }

  return toUTCISODate(utc)
}

export function getWeekdayFromISODate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}
