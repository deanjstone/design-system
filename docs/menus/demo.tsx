import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

function Demo() {
  return (
    <main>
      <section aria-labelledby="menubar-heading">
        <h2 id="menubar-heading">Menubar</h2>
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>New tab</MenubarItem>
              <MenubarItem>Open</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Undo</MenubarItem>
              <MenubarItem>Redo</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </section>

      <section aria-labelledby="context-heading">
        <h2 id="context-heading">Context menu</h2>
        <ContextMenu>
          <ContextMenuTrigger render={<div tabIndex={0} className="rounded-lg border p-6" />}>
            Right-click or press the context-menu key on this area
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Copy</ContextMenuItem>
            <ContextMenuItem>Paste</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </section>

      <section aria-labelledby="navigation-heading">
        <h2 id="navigation-heading">Navigation menu</h2>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Products</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuLink href="#argus">Argus</NavigationMenuLink>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#about">About</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </section>

      <section aria-labelledby="hover-heading">
        <h2 id="hover-heading">Hover card</h2>
        <HoverCard>
          <HoverCardTrigger render={<Button variant="link" />}>@design-system</HoverCardTrigger>
          <HoverCardContent>Shared registry for the homelab apps.</HoverCardContent>
        </HoverCard>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
)
