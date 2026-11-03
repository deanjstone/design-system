import { createRoot } from "react-dom/client"
import type { ColumnDef } from "@tanstack/react-table"

import "./index.css"
import { createLazyChart } from "@/components/ui/chart-lazy"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"

const RevenueChart = createLazyChart<{ className?: string }>(() => import("./revenue-chart"))

type Invoice = { customer: string; plan: string; amount: number }

const invoices: Invoice[] = [
  { customer: "Amy", plan: "Team", amount: 120 },
  { customer: "Bob", plan: "Solo", amount: 20 },
  { customer: "Zed", plan: "Team", amount: 300 },
  { customer: "Kim", plan: "Solo", amount: 20 },
  { customer: "Lee", plan: "Team", amount: 90 },
]

const columns: ColumnDef<Invoice>[] = [
  { accessorKey: "customer", header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" /> },
  { accessorKey: "plan", header: "Plan" },
  {
    accessorKey: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    cell: ({ row }) => `$${row.original.amount}`,
  },
]

function Panel({ mode }: { mode: "light" | "dark" }) {
  return (
    <div className={mode === "dark" ? "panel dark" : "panel"} data-mode={mode}>
      <section aria-labelledby={`${mode}-chart-heading`}>
        <h2 id={`${mode}-chart-heading`}>Chart ({mode})</h2>
        <RevenueChart className="h-56 w-full" />
      </section>
      <section aria-labelledby={`${mode}-table-heading`}>
        <h2 id={`${mode}-table-heading`}>Data table ({mode})</h2>
        <DataTable
          columns={columns}
          data={invoices}
          caption={`Invoices (${mode})`}
          filterColumn="customer"
          filterPlaceholder="Filter customers"
          pageSize={3}
        />
      </section>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <main>
    <Panel mode="light" />
    <Panel mode="dark" />
  </main>,
)
