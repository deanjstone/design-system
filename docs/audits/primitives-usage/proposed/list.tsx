import { BookOpenIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, SettingsIcon, TagIcon } from "lucide-react"

import { ARTICLES, type Article } from "./data"
import { Shell, type ShellTab } from "./shell"

// The reading list: a search field over one unread group, each row a title that wraps in full and a metadata line.

const TABS: ShellTab[] = [
  { label: "Library", icon: BookOpenIcon, current: true },
  { label: "Search", icon: SearchIcon },
  { label: "Labels", icon: TagIcon },
  { label: "Settings", icon: SettingsIcon },
]

const articleMeta = (article: Article): string => {
  const parts = [article.source, `${article.readMinutes} min read`]
  if (article.saved) parts.push("Saved")
  return parts.join(" · ")
}

function Row({ article }: { article: Article }) {
  return (
    <li className="pu-row">
      <div className="pu-row-body">
        <a className="pu-row-title" href={`#${article.id}`}>
          {article.title}
        </a>
        <p className="pu-meta">{articleMeta(article)}</p>
      </div>
      <button type="button" className="pu-icon-button" aria-label={`More actions for ${article.title}`}>
        <MoreHorizontalIcon className="pu-icon" aria-hidden="true" />
      </button>
    </li>
  )
}

export function List() {
  return (
    <Shell title="Library" tabs={TABS} action={{ label: "Save article", icon: PlusIcon }}>
      <input type="search" className="pu-input" placeholder="Search saved articles" aria-label="Search saved articles" />
      <section className="pu-section">
        <h2 className="pu-heading">
          Unread <span className="pu-count">{ARTICLES.length}</span>
        </h2>
        <ul role="list" className="pu-rows">
          {ARTICLES.map((article) => (
            <Row key={article.id} article={article} />
          ))}
        </ul>
      </section>
    </Shell>
  )
}
