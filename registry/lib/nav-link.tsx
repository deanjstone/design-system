import * as React from "react"

// How the layout blocks draw a link. The default is a plain anchor; an app on a
// client-side router passes its own `renderLink` so navigation stays in-app.

export type NavLinkProps = Omit<React.ComponentProps<"a">, "href"> & { href: string }

export type RenderLink = (props: NavLinkProps) => React.ReactElement

export const renderAnchor: RenderLink = (props) => <a {...props} />
