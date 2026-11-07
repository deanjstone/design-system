"use client"

import * as React from "react"

import { parseFilters, serializeFilters, type Filter, type FilterField } from "@/lib/filter-core"
import { useUrlParam } from "@/lib/url-state"

type UseFilterStateOptions = {
  /** The search param that carries the filters. Default `filter`. */
  param?: string
  /** `replace` (default) rewrites the current history entry; `push` adds one per change. */
  history?: "replace" | "push"
}

/**
 * The filter list as state in the page's own URL: `const [filters, setFilters] = useFilterState(fields)`.
 * The URL is the only store, so reload, back and forward, and a copied link all agree. Pass the pair to
 * `FilterBuilder`. A router that owns the search params can skip this hook and call `parseFilters` and
 * `serializeFilters` itself.
 */
export function useFilterState(fields: readonly FilterField[], { param = "filter", history = "replace" }: UseFilterStateOptions = {}) {
  const [raw, setRaw] = useUrlParam(param, { history })

  // `fields` is often written inline and is a new array every render; its ids and types decide how a
  // link parses, so key the parse on those and keep the same list while the URL is unchanged.
  const shape = fields.map((field) => `${field.id}:${field.type}`).join("|")
  const filters = React.useMemo(() => parseFilters(raw, fields), [raw, shape]) // eslint-disable-line react-hooks/exhaustive-deps

  const setFilters = React.useCallback((next: Filter[]) => setRaw(serializeFilters(next) || null), [setRaw])

  return [filters, setFilters] as const
}
