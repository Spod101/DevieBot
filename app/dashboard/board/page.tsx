import { KanbanBoard } from '@/components/kanban/kanban-board'

export default function GeneralBoardPage() {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 shrink-0">
        <div className="mono-tag mb-2">
          <span className="lime-dot" />
          <span>Task Management</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">General Board</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          All tasks not tied to a specific Code Camp
        </p>
      </div>
      <KanbanBoard campId={null} />
    </div>
  )
}
