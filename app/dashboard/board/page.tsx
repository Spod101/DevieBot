import { KanbanBoard } from '@/components/kanban/kanban-board'

export default function GeneralBoardPage() {
  return (
    <div className="p-6 h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">General Board</h1>
        <p className="text-muted-foreground text-sm mt-1">All tasks not tied to a specific Code Camp</p>
      </div>
      <KanbanBoard campId={null} />
    </div>
  )
}
