import { Sidebar } from '@/components/layout/sidebar'
import Image from 'next/image'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative min-h-screen">

        {/* ── Ambient glow spheres ─────────────────────────────────── */}
        <div
          className="glow-lime fixed top-[-200px] right-[-100px] w-[700px] h-[700px]"
          aria-hidden
        />
        <div
          className="glow-emerald fixed bottom-[-150px] left-[200px] w-[500px] h-[500px]"
          aria-hidden
        />

        {/* ── Dot grid overlay ─────────────────────────────────────── */}
        <div className="grid-pattern fixed inset-0 pointer-events-none" aria-hidden />

        {/* ── DEVCON 16 decorative assets — scattered ───────────────
            Sidebar is 256px wide; assets in the "left" half of main
            content use left offsets >= 280px so they stay visible.
        ─────────────────────────────────────────────────────────── */}

        {/* Cloud — top-right corner (large) */}
        <div
          className="fixed top-[-55px] right-[-55px] w-[270px] h-[270px] pointer-events-none select-none z-0"
          aria-hidden
        >
          <Image
            src="/icons/cloud.png"
            alt=""
            width={270}
            height={270}
            className="w-full h-full object-contain float-anim deco-cloud"
            style={{ animationDuration: '7s' }}
          />
        </div>

        {/* Cloud — bottom of main content area, left-center (past sidebar) */}
        <div
          className="fixed bottom-[-40px] pointer-events-none select-none z-0"
          style={{ left: 'calc(256px + 6%)', width: '210px', height: '210px' }}
          aria-hidden
        >
          <Image
            src="/icons/cloud.png"
            alt=""
            width={210}
            height={210}
            className="w-full h-full object-contain float-anim deco-cloud-sm"
            style={{ animationDuration: '9s', animationDelay: '2.5s', transform: 'scaleX(-1)' }}
          />
        </div>

        {/* Cloud — small, top-left of main content area */}
        <div
          className="fixed top-[8%] pointer-events-none select-none z-0"
          style={{ left: 'calc(256px + 3%)', width: '130px', height: '130px' }}
          aria-hidden
        >
          <Image
            src="/icons/cloud.png"
            alt=""
            width={130}
            height={130}
            className="w-full h-full object-contain float-anim deco-cloud-sm"
            style={{ animationDuration: '11s', animationDelay: '4s' }}
          />
        </div>

        {/* Plane — lower-right, clearly separated from top-right cloud */}
        <div
          className="fixed bottom-[12%] right-[5%] w-[160px] h-[160px] pointer-events-none select-none z-0"
          aria-hidden
        >
          <Image
            src="/icons/plane.png"
            alt=""
            width={160}
            height={160}
            className="w-full h-full object-contain float-anim deco-plane"
            style={{ animationDuration: '6s', animationDelay: '1.5s' }}
          />
        </div>

        {/* ── Dashboard shell ───────────────────────────────────────── */}
        <div className="relative flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto styled-scroll">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
