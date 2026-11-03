import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"

function Demo() {
  return (
    <main>
      <section aria-labelledby="accordion-heading">
        <h2 id="accordion-heading">Accordion</h2>
        <Accordion>
          <AccordionItem value="billing">
            <AccordionTrigger>Billing</AccordionTrigger>
            <AccordionContent>Invoices are issued monthly.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="security">
            <AccordionTrigger>Security</AccordionTrigger>
            <AccordionContent>Passkeys are preferred over passwords.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section aria-labelledby="alert-heading">
        <h2 id="alert-heading">Alert</h2>
        <Alert>
          <AlertTitle>Backup complete</AlertTitle>
          <AlertDescription>The nightly backup finished at 02:14.</AlertDescription>
        </Alert>
      </section>

      <section aria-labelledby="aspect-heading">
        <h2 id="aspect-heading">Aspect ratio</h2>
        <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg border bg-muted">
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">16:9 preview</div>
        </AspectRatio>
      </section>

      <section aria-labelledby="kbd-heading">
        <h2 id="kbd-heading">Keyboard keys</h2>
        <p>
          Press <KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup> to open search.
        </p>
      </section>

      <section aria-labelledby="resizable-heading">
        <h2 id="resizable-heading">Resizable</h2>
        <ResizablePanelGroup orientation="horizontal" className="h-40 rounded-lg border">
          <ResizablePanel defaultSize={30}>
            <div className="p-3 text-sm">Sidebar</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={70}>
            <div className="p-3 text-sm">Main</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </section>

      <section aria-labelledby="carousel-heading">
        <h2 id="carousel-heading">Carousel</h2>
        <Carousel className="mx-12">
          <CarouselContent>
            <CarouselItem>Slide one</CarouselItem>
            <CarouselItem>Slide two</CarouselItem>
            <CarouselItem>Slide three</CarouselItem>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </section>

      <section aria-labelledby="pagination-heading">
        <h2 id="pagination-heading">Pagination</h2>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#page-1" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#page-1">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#page-2" isActive>2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#page-3" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
)
