/** Exact saved-text excerpts. No model calls, inferred claims, or artifact writes. */
export interface SolutionHeading { level: number; text: string; index: number; line: number }
export function solutionOutline(markdown: string): SolutionHeading[] {
  const headings: SolutionHeading[] = []
  let fence: string | null = null
  markdown.split('\n').forEach((line, lineNumber) => {
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (delimiter !== undefined) {
      if (fence === null) fence = delimiter
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = null
      return
    }
    if (fence !== null) return
    const match = /^(#{1,3})\s+(.+)$/.exec(line)
    if (match !== null) headings.push({ level: match[1]!.length, text: match[2]!.trim(), index: headings.length, line: lineNumber })
  })
  return headings
}
export function solutionSummary(markdown: string): string | null {
  const headings = solutionOutline(markdown)
  const heading = headings.find(h => /摘要|概述|executive summary|overview|summary/i.test(h.text))
  if (heading === undefined) return null
  const next = headings.find(h => h.line > heading.line && h.level <= heading.level)
  return markdown.split('\n').slice(heading.line + 1, next?.line).join('\n').trim() || null
}
export function savedSolutionRoute(markdown: string): string | null {
  // Only an explicit route line from the saved summary can label its version.
  const summary = solutionSummary(markdown)
  if (summary === null) return null
  return /^\s*(?:[-*]\s*)?(?:\*\*)?(?:选定路线|主要技术路线|技术路线|selected route)\s*(?:\*\*)?[：:]\s*(.+)$/im.exec(summary)?.[1]?.trim() ?? null
}
