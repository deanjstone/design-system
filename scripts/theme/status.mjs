// The status colours: what a health or state badge says, as opposed to the chart
// series colours. T3 Code has no such tokens, so they are not read from its sheet
// (extract-t3.mjs) and do not vary by theme: a status colour has to mean the same
// thing in every palette. build.mjs writes them into the bare :root and .dark rules,
// which every theme inherits.
//
// Four roles, success to critical. "unreachable" is the orange tier between warning
// and critical: the thing is not reporting, which is not the same as reporting a fault.
//
// Each colour is text on the page ground and on its own wash (a badge's tint), so it
// is held to 4.5:1 against both, in every theme (test/theme-tokens.test.ts). The
// -foreground token is text on a solid fill of the role.

export const STATUS_ROLES = ["success", "warning", "unreachable", "critical"]

export const STATUS_TOKENS = {
  light: {
    success: "#137333",
    "success-foreground": "#fffaff",
    warning: "#8a5300",
    "warning-foreground": "#fffaff",
    unreachable: "#b04400",
    "unreachable-foreground": "#fffaff",
    critical: "#c10007",
    "critical-foreground": "#fffaff",
  },
  dark: {
    success: "#4ade80",
    "success-foreground": "#241523",
    warning: "#fbbf24",
    "warning-foreground": "#241523",
    unreachable: "#fb923c",
    "unreachable-foreground": "#241523",
    critical: "#ff7a7e",
    "critical-foreground": "#241523",
  },
}

// Opacity of a badge's tint in each mode; registry/base-nova/ui/badge.tsx uses the same.
export const STATUS_WASH = { light: 0.1, dark: 0.15 }
