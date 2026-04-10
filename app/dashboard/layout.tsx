import { Sidebar } from '@/components/layout/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Floating shell */}
      <div className="relative min-h-screen">
        {/* Ambient glow spheres */}
        <div
          className="glow-lime fixed top-[-200px] right-[-100px] w-[700px] h-[700px]"
          aria-hidden
        />
        <div
          className="glow-emerald fixed bottom-[-150px] left-[200px] w-[500px] h-[500px]"
          aria-hidden
        />

        {/* Grid pattern overlay */}
        <div className="grid-pattern fixed inset-0 pointer-events-none" aria-hidden />

        {/* Dashboard shell */}
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
