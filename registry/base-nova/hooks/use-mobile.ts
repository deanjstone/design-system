import * as React from "react"

const MOBILE_BREAKPOINT = 768
// A phone turned sideways is wider than the breakpoint but is still a finger on a
// screen too short for a persistent sidebar. Phones top out near 440px tall; the
// shortest iPad is 744px, so a coarse pointer under this height is a phone.
const LANDSCAPE_PHONE_MAX_HEIGHT = 500

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse) and (max-height: ${LANDSCAPE_PHONE_MAX_HEIGHT}px)`

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
