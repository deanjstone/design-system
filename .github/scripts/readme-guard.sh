#!/usr/bin/env bash
# README guard (argus-config#1147): fail a change that alters setup, commands, config or
# deploy but neither touches a README nor says why it needs none.
#
# Reads the changed paths on stdin, one per line. The text to search for a waiver is in
# $README_GUARD_TEXT: a pull request's body, or the commit messages of a push (a trunk
# repo has no PR). Exit 0 passes, 1 fails with the files that triggered it.
#
#   git diff --name-only --no-renames HEAD^1 HEAD \
#     | README_GUARD_TEXT="$PR_BODY" README_GUARD_BASE=HEAD^1 README_GUARD_HEAD=HEAD \
#       bash .github/scripts/readme-guard.sh
#
# A path is README-relevant when it is:
#   - package.json whose `scripts` or `bin` differ between README_GUARD_BASE and
#     README_GUARD_HEAD (a dependency bump is not); with either ref unset, or the file
#     new, deleted or unparseable, it counts;
#   - under .github/workflows/;
#   - a deploy, install or promote script (deploy*.sh, install*.sh, promote*.sh, .ps1);
#   - an env template (.env.example, .env.*.example, *.env.example, .env.template,
#     .env.sample, env.example);
#   - a CLI entry point (bin/<file>, cli.{ts,js,mjs,cjs,py}).
# A change passes when it touches any README (README.md or README.<ext>, at any depth), or
# the text has a line `README: not needed because <reason>` (optionally as a list item or
# checked box; HTML comments are ignored, and the template's `<reason>` placeholder is not
# a reason).
#
# Vendored byte-for-byte into every active repo (dependencies: bash, git, jq, perl). The
# source of truth is deanjstone/argus-config, .github/scripts/readme-guard.sh and
# .github/workflows/readme-guard.yml; change them there and re-copy.

set -euo pipefail

text="${README_GUARD_TEXT:-}"
base="${README_GUARD_BASE:-}"
head="${README_GUARD_HEAD:-}"

readme_touched=0
declare -a triggers=()

# package_json_changed <path>: 0 when scripts or bin differ (or cannot be compared).
package_json_changed() {
    local path="$1" before after
    [[ -n "$base" && -n "$head" ]] || return 0
    before=$(git show "$base:$path" 2>/dev/null | jq -cS '{scripts, bin}' 2>/dev/null) || return 0
    after=$(git show "$head:$path" 2>/dev/null | jq -cS '{scripts, bin}' 2>/dev/null) || return 0
    [[ "$before" != "$after" ]]
}

while IFS= read -r path; do
    path="${path%$'\r'}"
    [[ -n "$path" ]] || continue
    name="${path##*/}"
    shopt -s nocasematch
    if [[ "$name" =~ ^readme(\.[a-z]+)?$ ]]; then
        readme_touched=1
    fi
    shopt -u nocasematch

    relevant=0
    case "$path" in
        package.json | */package.json)
            if package_json_changed "$path"; then relevant=1; fi ;;
        .github/workflows/* | */.github/workflows/*)
            relevant=1 ;;
        bin/* | */bin/*)
            relevant=1 ;;
    esac
    # The rest match on the file name alone, so a file inside a directory that merely
    # has a deploy- or cli-like name does not count.
    case "$name" in
        deploy*.sh | install*.sh | promote*.sh | deploy*.ps1 | install*.ps1 | promote*.ps1)
            relevant=1 ;;
        .env.example | .env.*.example | *.env.example | .env.template | .env.sample | env.example)
            relevant=1 ;;
        cli.ts | cli.js | cli.mjs | cli.cjs | cli.py)
            relevant=1 ;;
    esac
    if [[ "$relevant" -eq 1 ]]; then triggers+=("$path"); fi
done

if [[ "${#triggers[@]}" -eq 0 || "$readme_touched" -eq 1 ]]; then
    exit 0
fi

# The waiver: strip HTML comments (the template hides its guidance in them), then look
# for the line. The reason must start with something other than the `<reason>` placeholder.
stripped=$(perl -0pe 's/<!--.*?-->//gs' <<<"${text//$'\r'/}")
waiver='^[[:space:]]*([-*][[:space:]]+)?(\[[ xX]\][[:space:]]+)?README:[[:space:]]*not needed because[[:space:]]+[^[:space:]<]'
if grep -qiE "$waiver" <<<"$stripped"; then
    echo "README guard: waived by a 'README: not needed because ...' line."
    exit 0
fi

{
    echo "README guard: this change touches README-relevant files but no README."
    echo
    echo "Files:"
    printf '  %s\n' "${triggers[@]}"
    echo
    echo "Either update the README in this change, or add a line to the PR body"
    echo "(for a push to a trunk repo, to a commit message):"
    echo
    echo "  README: not needed because <reason>"
} >&2
exit 1
