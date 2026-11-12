import { ListIcon, PackageIcon, PackageMinusIcon, PlusIcon, ShoppingCartIcon } from "lucide-react"

import { Shell, type ShellTab } from "./shell"

// The empty state: one centred message that says what to do next, with a link to the list that fills it.

const TABS: ShellTab[] = [
  { label: "Items", icon: ListIcon },
  { label: "Products", icon: PackageIcon },
  { label: "Low stock", icon: PackageMinusIcon },
  { label: "Shopping", icon: ShoppingCartIcon, current: true },
]

export function Empty() {
  return (
    <Shell title="Shopping list" tabs={TABS} action={{ label: "Add an item", icon: PlusIcon }}>
      <section className="pu-empty">
        <ShoppingCartIcon className="pu-icon-lg" aria-hidden="true" />
        <h2 className="pu-heading">Nothing to buy</h2>
        <p className="pu-empty-text">Items that run low show up here. Add one yourself, or check Low stock.</p>
        <a className="pu-link" href="#low-stock">
          Open Low stock
        </a>
      </section>
    </Shell>
  )
}
