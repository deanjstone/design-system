// shadcn does not inherit a ref across dependencies, so a pinned install
// (`add deanjstone/design-system/sidebar#v3.1.0`) fetches every dependency
// from `main` unless the dependency carries its own ref. Tagged builds
// therefore write the release ref into each in-repo registryDependencies
// entry; `main` keeps the unversioned form so it floats (design-system#65).

const IN_REPO_ADDRESS = /^(deanjstone\/design-system\/[^#]+)(?:#.*)?$/

function requireRef(ref) {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new Error("A release ref is required to pin registryDependencies")
  }
}

/** @param {string[]} entries @param {string} ref */
export function pinRegistryDependencies(entries, ref) {
  requireRef(ref)
  return entries.map((entry) => {
    const match = IN_REPO_ADDRESS.exec(entry)
    return match ? `${match[1]}#${ref}` : entry
  })
}

// A registry.json (`{ items: [...] }`) or one built item (`r/<item>.json`).
function itemsOf(registryOrItem) {
  return Array.isArray(registryOrItem.items) ? registryOrItem.items : [registryOrItem]
}

/** Returns a pinned copy; the input is left untouched. */
export function pinRegistry(registryOrItem, ref) {
  requireRef(ref)
  const pinItem = (item) =>
    item.registryDependencies
      ? { ...item, registryDependencies: pinRegistryDependencies(item.registryDependencies, ref) }
      : item
  return Array.isArray(registryOrItem.items)
    ? { ...registryOrItem, items: registryOrItem.items.map(pinItem) }
    : pinItem(registryOrItem)
}

/** In-repo dependencies that do not carry exactly `#<ref>`. */
export function findUnpinned(registryOrItem, ref) {
  requireRef(ref)
  return itemsOf(registryOrItem).flatMap((item) =>
    (item.registryDependencies ?? [])
      .filter((entry) => {
        const match = IN_REPO_ADDRESS.exec(entry)
        return match !== null && entry !== `${match[1]}#${ref}`
      })
      .map((entry) => ({ item: item.name, entry })),
  )
}
