import * as React from "react"

import {
  TRAILING_JOINER,
  classify,
  describeLink,
  isAvatarUrl,
  isScriptHref,
  type Enricher,
  type Enrichment,
  type LinkInfo,
  type LinkPillVariant,
} from "@/lib/link-pill-core"

// React shell of LinkPill. A pill renders at once from the href and the link
// text; an Enricher the app provides may upgrade it afterwards. The classes it
// emits are styled by the link-pill-css item, which the consumer imports.

const EnricherContext = React.createContext<Enricher | null>(null)

function LinkPillEnricherProvider({
  enrich,
  children,
}: {
  enrich: Enricher | null
  children?: React.ReactNode
}) {
  return <EnricherContext.Provider value={enrich}>{children}</EnricherContext.Provider>
}

// One lookup per href per Enricher for the life of the page. A failure is
// logged here, once, and cached as "no Enrichment" so it is not retried.
const lookups = new WeakMap<Enricher, Map<string, Promise<Enrichment | null>>>()

function lookUp(enrich: Enricher, link: LinkInfo) {
  let byHref = lookups.get(enrich)
  if (!byHref) {
    byHref = new Map()
    lookups.set(enrich, byHref)
  }
  let pending = byHref.get(link.href)
  if (!pending) {
    pending = Promise.resolve()
      .then(() => enrich(link))
      .catch((error: unknown) => {
        console.error("LinkPill: enrichment failed for", link.href, error)
        return null
      })
    byHref.set(link.href, pending)
  }
  return pending
}

function useEnrichment(enrich: Enricher | null, link: LinkInfo, eligible: boolean) {
  const [result, setResult] = React.useState<{ href: string; enrichment: Enrichment | null } | null>(
    null,
  )
  const { href, label } = link

  React.useEffect(() => {
    if (!enrich || !eligible) return
    let cancelled = false
    void lookUp(enrich, { href, label, classification: classify(href) }).then((enrichment) => {
      if (!cancelled) setResult({ href, enrichment })
    })
    return () => {
      cancelled = true
    }
  }, [enrich, eligible, href, label])

  return result && result.href === href ? result.enrichment : null
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

type LinkPillProps = React.ComponentProps<"a"> & {
  // "inline" for prose, "chip" for chat.
  variant?: LinkPillVariant
}

function LinkPill({
  href,
  children,
  variant = "inline",
  className,
  title,
  ...props
}: LinkPillProps) {
  const enrich = React.useContext(EnricherContext)
  const classification = classify(href)
  const description = describeLink(classification)
  const label = textOf(children) || href || ""
  const enrichment = useEnrichment(
    enrich,
    { href: href ?? "", label, classification },
    classification.kind === "mention" || classification.kind === "url",
  )

  if (!description) {
    if (classification.kind === "none" && classification.pending) return <>{children}</>
    if (href && isScriptHref(href)) return <>{children}</>
    return (
      <a href={href} className={className} title={title} {...props}>
        {children}
      </a>
    )
  }

  const shownLabel = enrichment?.label ?? label
  const shownTitle = enrichment?.title ?? title ?? (variant === "chip" ? shownLabel : undefined)
  const avatarUrl = variant === "chip" ? enrichment?.avatarUrl : null

  return (
    <>
      <a
        href={href}
        title={shownTitle}
        {...props}
        className={["link-pill", ...description.modifiers, `link-pill--${variant}`, className]
          .filter(Boolean)
          .join(" ")}
      >
        {isAvatarUrl(avatarUrl) ? (
          <img className="link-pill__avatar" src={avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <svg
            className="link-pill__icon"
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {description.iconPaths.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        )}
        {description.srPrefix ? (
          <span className="link-pill__sr">{description.srPrefix}</span>
        ) : null}
        <span className="link-pill__label">{enrichment?.label ?? children}</span>
      </a>
      {variant === "chip" ? TRAILING_JOINER : null}
    </>
  )
}

export { LinkPill, LinkPillEnricherProvider }
export type { LinkPillProps }
