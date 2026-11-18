/**
 * Scenario coverage report: maps every OpenSpec Scenario to the tests that verify it.
 *
 *   node scripts/scenario-report.ts --check            # mapping errors only (exit 1 on error)
 *   node scripts/scenario-report.ts [--summary f] [--out f] [--reports dir]
 *
 * See docs/development.md「Scenario 對照報告」.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SEP = ' › '

export type Scenario = { capability: string; requirement: string; scenario: string; key: string }
export type Problem = { file: string; line: number; message: string }
export type TestKind = 'e2e' | 'vitest' | 'pgtap'
/** One test (pgTAP: one file) and the Scenario keys it verifies. */
export type TestRef = { kind: TestKind; file: string; line: number; title: string; keys: string[] }
export type Outcome = 'passed' | 'failed' | 'skipped'
export type ScenarioStatus = '通過' | '失敗' | '未執行' | '未覆蓋'
export type SourceFile = { file: string; text: string }

// ---------- specs ----------

export function parseSpecs(specs: { capability: string; file: string; text: string }[]): {
  scenarios: Scenario[]
  problems: Problem[]
} {
  const scenarios: Scenario[] = []
  const problems: Problem[] = []
  const seen = new Map<string, string>()
  for (const { capability, file, text } of specs) {
    let requirement: string | null = null
    text.split('\n').forEach((raw, i) => {
      const req = /^###\s+Requirement:\s*(.+?)\s*$/.exec(raw)
      if (req) {
        requirement = req[1]
        return
      }
      const sc = /^####\s+Scenario:\s*(.+?)\s*$/.exec(raw)
      if (!sc) return
      if (requirement === null) {
        problems.push({
          file,
          line: i + 1,
          message: `Scenario「${sc[1]}」不在任何 Requirement 底下`,
        })
        return
      }
      const key = `${requirement}${SEP}${sc[1]}`
      const where = `${file}:${i + 1}`
      const previous = seen.get(key)
      if (previous) {
        problems.push({
          file,
          line: i + 1,
          message: `「${key}」重複（也在 ${previous}），請改名讓它唯一`,
        })
        return
      }
      seen.set(key, where)
      scenarios.push({ capability, requirement, scenario: sc[1], key })
    })
  }
  return { scenarios, problems }
}

// ---------- tests ----------

const TEST_CALL = /(?<![\w.$])(it|test)(?:\.(?:only|skip|todo|fixme|fails|concurrent))?\(/
const TITLE_AFTER_CALL = /^\s*(['"])((?:\\.|(?!\1).)*)\1\s*,/
const ANNOTATION = /^\s*(?:\/\/|--)\s*@scenario\b(.*)$/

function unescape(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

/** Finds `it(` / `test(` on a line and its string-literal title, if any. */
function testCallOnLine(line: string): { found: boolean; title: string | null } {
  const m = TEST_CALL.exec(line)
  if (!m) return { found: false, title: null }
  const rest = line.slice(m.index + m[0].length)
  const t = TITLE_AFTER_CALL.exec(rest)
  return { found: true, title: t ? unescape(t[2]) : null }
}

function annotationKey(
  raw: string,
  file: string,
  line: number,
  problems: Problem[],
): string | null {
  const key = raw.trim()
  if (!key.includes(SEP)) {
    problems.push({
      file,
      line,
      message: `@scenario 格式應為「Requirement${SEP}Scenario」：「${key}」`,
    })
    return null
  }
  return key
}

/** E2E: every `test(` title must itself be a Scenario key. */
export function parseE2E(sources: SourceFile[]): { tests: TestRef[]; problems: Problem[] } {
  const tests: TestRef[] = []
  const problems: Problem[] = []
  for (const { file, text } of sources) {
    text.split('\n').forEach((line, i) => {
      const call = testCallOnLine(line)
      if (!call.found) return
      if (call.title === null) {
        problems.push({
          file,
          line: i + 1,
          message: 'E2E 測試標題必須是同一行的字串（Requirement › Scenario）',
        })
        return
      }
      tests.push({ kind: 'e2e', file, line: i + 1, title: call.title, keys: [call.title] })
    })
  }
  return { tests, problems }
}

/** Vitest: `// @scenario` lines directly above an `it(` / `test(` call. */
export function parseVitest(sources: SourceFile[]): { tests: TestRef[]; problems: Problem[] } {
  const tests: TestRef[] = []
  const problems: Problem[] = []
  for (const { file, text } of sources) {
    const lines = text.split('\n')
    const titleCount = new Map<string, number>()
    for (const line of lines) {
      const call = testCallOnLine(line)
      if (call.title !== null) titleCount.set(call.title, (titleCount.get(call.title) ?? 0) + 1)
    }
    let pending: { key: string; line: number }[] = []
    let firstLine = 0
    lines.forEach((line, i) => {
      const ann = ANNOTATION.exec(line)
      if (ann) {
        if (pending.length === 0) firstLine = i + 1
        const key = annotationKey(ann[1], file, i + 1, problems)
        if (key) pending.push({ key, line: i + 1 })
        return
      }
      if (pending.length === 0) return
      if (/^\s*(\/\/.*)?$/.test(line)) return // blank lines and other comments may sit in between
      const call = testCallOnLine(line)
      if (!call.found || call.title === null) {
        problems.push({
          file,
          line: firstLine,
          message: '@scenario 後面必須緊接 it( 或 test(，且標題是同一行的字串',
        })
      } else if ((titleCount.get(call.title) ?? 0) > 1) {
        problems.push({
          file,
          line: i + 1,
          message: `同一個檔案有多個測試叫「${call.title}」，無法對應結果`,
        })
      } else {
        tests.push({
          kind: 'vitest',
          file,
          line: i + 1,
          title: call.title,
          keys: pending.map((p) => p.key),
        })
      }
      pending = []
    })
    if (pending.length > 0) {
      problems.push({ file, line: firstLine, message: '@scenario 後面沒有測試' })
    }
  }
  return { tests, problems }
}

/** pgTAP: every `-- @scenario` in a file maps the whole file. */
export function parsePgTap(sources: SourceFile[]): { tests: TestRef[]; problems: Problem[] } {
  const tests: TestRef[] = []
  const problems: Problem[] = []
  for (const { file, text } of sources) {
    const keys: string[] = []
    let first = 0
    text.split('\n').forEach((line, i) => {
      const ann = ANNOTATION.exec(line)
      if (!ann) return
      const key = annotationKey(ann[1], file, i + 1, problems)
      if (!key) return
      if (first === 0) first = i + 1
      if (!keys.includes(key)) keys.push(key)
    })
    if (keys.length > 0)
      tests.push({ kind: 'pgtap', file, line: first, title: basename(file), keys })
  }
  return { tests, problems }
}

// ---------- validation ----------

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

export function closestKey(key: string, keys: string[]): string | null {
  let best: string | null = null
  let bestScore = Infinity
  for (const k of keys) {
    const d = distance(key, k)
    if (d < bestScore) {
      bestScore = d
      best = k
    }
  }
  return best
}

/** Reports every test key that is not a Scenario in the specs. */
export function validateKeys(tests: TestRef[], scenarios: Scenario[]): Problem[] {
  const known = new Set(scenarios.map((s) => s.key))
  const all = [...known]
  const problems: Problem[] = []
  for (const t of tests) {
    for (const key of t.keys) {
      if (known.has(key)) continue
      const near = closestKey(key, all)
      problems.push({
        file: t.file,
        line: t.line,
        message: `找不到 Scenario「${key}」${near ? `；最接近的是「${near}」` : ''}`,
      })
    }
  }
  return problems
}

// ---------- results ----------

/** Results keyed by `${kind}:${file}:${title}` (vitest), `e2e::${title}`, `pgtap:${basename}:`. */
export type Results = Map<string, Outcome[]>

export function resultKey(t: Pick<TestRef, 'kind' | 'file' | 'title'>): string {
  if (t.kind === 'e2e') return `e2e::${t.title}`
  if (t.kind === 'pgtap') return `pgtap:${basename(t.file)}:`
  return `vitest:${t.file}:${t.title}`
}

function add(results: Results, key: string, outcome: Outcome): void {
  const list = results.get(key) ?? []
  list.push(outcome)
  results.set(key, list)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** Vitest JSON reporter output; `files` are repo-relative paths of the annotated test files. */
export function readVitestResults(json: unknown, files: string[], results: Results): void {
  if (!isRecord(json)) return
  for (const fileResult of arrayOf(json.testResults)) {
    if (!isRecord(fileResult) || typeof fileResult.name !== 'string') continue
    const name = fileResult.name.replace(/\\/g, '/')
    const file = files.find((f) => name === f || name.endsWith(`/${f}`))
    if (!file) continue
    for (const a of arrayOf(fileResult.assertionResults)) {
      if (!isRecord(a) || typeof a.title !== 'string') continue
      const outcome: Outcome =
        a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped'
      add(results, `vitest:${file}:${a.title}`, outcome)
    }
  }
}

/** Playwright JSON reporter output. */
export function readE2EResults(json: unknown, results: Results): void {
  const walk = (suite: unknown): void => {
    if (!isRecord(suite)) return
    for (const spec of arrayOf(suite.specs)) {
      if (!isRecord(spec) || typeof spec.title !== 'string') continue
      const statuses = arrayOf(spec.tests).map((t) => (isRecord(t) ? t.status : undefined))
      const outcome: Outcome =
        statuses.length > 0 && statuses.every((s) => s === 'skipped')
          ? 'skipped'
          : spec.ok === true
            ? 'passed'
            : 'failed'
      add(results, `e2e::${spec.title}`, outcome)
    }
    for (const child of arrayOf(suite.suites)) walk(child)
  }
  if (isRecord(json)) for (const s of arrayOf(json.suites)) walk(s)
}

/**
 * `supabase test db` (pg_prove) output. A passing file prints `file.sql .. ok`; a failing one
 * prints `file.sql .. ` followed by `# Failed test …` / `Failed 1/11 subtests`, and is listed
 * again in the `Test Summary Report` as `file.sql (Wstat: … Failed: 1)`.
 */
export function readPgTapResults(text: string, results: Results): void {
  const outcome = new Map<string, Outcome>()
  let current: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const summary = /([\w.-]+\.sql)\s+\(Wstat:/.exec(line)
    if (summary) {
      outcome.set(summary[1], 'failed')
      continue
    }
    const m = /([\w.-]+\.sql)\s+\.+\s*(.*)$/.exec(line)
    if (m) {
      const status = m[2].trim()
      if (/^ok\b/.test(status)) {
        outcome.set(m[1], 'passed')
        current = null
      } else if (status === '' || /^\d+\/\?$/.test(status)) {
        current = m[1] // the verdict follows on a later line
      } else {
        outcome.set(m[1], 'failed')
        current = null
      }
      continue
    }
    if (current && /^(Failed|Dubious|Parse errors|No subtests)/.test(line)) {
      outcome.set(current, 'failed')
      current = null
    }
  }
  for (const [file, o] of outcome) add(results, `pgtap:${file}:`, o)
}

// ---------- report ----------

export type Row = Scenario & { status: ScenarioStatus; tests: { ref: TestRef; outcome: string }[] }

export function evaluate(scenarios: Scenario[], tests: TestRef[], results: Results): Row[] {
  return scenarios.map((s) => {
    const refs = tests.filter((t) => t.keys.includes(s.key))
    const outcomes = refs.map((ref) => {
      const list = results.get(resultKey(ref)) ?? []
      const outcome = list.includes('failed')
        ? 'failed'
        : list.includes('passed')
          ? 'passed'
          : list.length > 0
            ? 'skipped'
            : 'missing'
      return { ref, outcome }
    })
    let status: ScenarioStatus
    if (refs.length === 0) status = '未覆蓋'
    else if (outcomes.some((o) => o.outcome === 'failed')) status = '失敗'
    else if (outcomes.some((o) => o.outcome === 'passed')) status = '通過'
    else status = '未執行'
    return { ...s, status, tests: outcomes }
  })
}

const ICON: Record<ScenarioStatus, string> = { 通過: '✅', 失敗: '❌', 未執行: '⏸️', 未覆蓋: '⬜' }
const KIND_LABEL: Record<TestKind, string> = { e2e: 'E2E', vitest: 'Vitest', pgtap: 'pgTAP' }

function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function testLabel(ref: TestRef, outcome: string): string {
  const mark = outcome === 'failed' ? ' ❌' : outcome === 'missing' ? ' ⏸️' : ''
  const name = ref.kind === 'pgtap' ? `\`${ref.file}\`` : `\`${ref.file}\` ${cell(ref.title)}`
  return `${KIND_LABEL[ref.kind]} ${name}${mark}`
}

export function renderMarkdown(rows: Row[], problems: Problem[]): string {
  const out: string[] = ['## Scenario 對照報告', '']
  const count = (list: Row[], st: ScenarioStatus) => list.filter((r) => r.status === st).length
  const covered = (list: Row[]) => list.length - count(list, '未覆蓋')
  out.push(
    `已覆蓋 **${covered(rows)} / ${rows.length}** 個 Scenario：通過 ${count(rows, '通過')}、失敗 ${count(rows, '失敗')}、未執行 ${count(rows, '未執行')}；未覆蓋 ${count(rows, '未覆蓋')}。`,
    '',
  )
  if (problems.length > 0) {
    out.push(`### ❗ 對應錯誤（${problems.length}）`, '')
    for (const p of problems) out.push(`- \`${p.file}:${p.line}\` ${p.message}`)
    out.push('')
  }
  const capabilities = [...new Set(rows.map((r) => r.capability))]
  out.push(
    '| Capability | Scenario | 已覆蓋 | ✅ 通過 | ❌ 失敗 | ⏸️ 未執行 |',
    '|---|---:|---:|---:|---:|---:|',
  )
  for (const c of capabilities) {
    const list = rows.filter((r) => r.capability === c)
    out.push(
      `| ${c} | ${list.length} | ${covered(list)} | ${count(list, '通過')} | ${count(list, '失敗')} | ${count(list, '未執行')} |`,
    )
  }
  out.push(
    `| **合計** | **${rows.length}** | **${covered(rows)}** | **${count(rows, '通過')}** | **${count(rows, '失敗')}** | **${count(rows, '未執行')}** |`,
    '',
    '⏸️ 未執行：有對應的測試，但這次沒有它的結果。',
    '',
  )
  for (const c of capabilities) {
    const list = rows.filter((r) => r.capability === c)
    out.push(
      `<details><summary>${c}（已覆蓋 ${covered(list)} / ${list.length}）</summary>`,
      '',
      '| Requirement | Scenario | 結果 | 測試 |',
      '|---|---|---|---|',
    )
    for (const r of list) {
      const tests = r.tests.map((t) => testLabel(t.ref, t.outcome)).join('<br>') || '—'
      out.push(
        `| ${cell(r.requirement)} | ${cell(r.scenario)} | ${ICON[r.status]} ${r.status} | ${tests} |`,
      )
    }
    out.push('', '</details>', '')
  }
  const uncovered = rows.filter((r) => r.status === '未覆蓋')
  if (uncovered.length > 0) {
    out.push(`<details><summary>未覆蓋的 Scenario（${uncovered.length}）</summary>`, '')
    for (const r of uncovered) out.push(`- **${r.capability}** ${r.key}`)
    out.push('', '</details>', '')
  }
  return out.join('\n')
}

// ---------- CLI ----------

function listFiles(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') found.push(...listFiles(path, match))
    } else if (match(entry.name)) found.push(path)
  }
  return found.sort()
}

function sources(root: string, paths: string[]): SourceFile[] {
  return paths.map((p) => ({
    file: relative(root, p).replace(/\\/g, '/'),
    text: readFileSync(p, 'utf8'),
  }))
}

export function collect(root: string): {
  scenarios: Scenario[]
  tests: TestRef[]
  problems: Problem[]
} {
  const specDir = join(root, 'openspec/specs')
  const specs = readdirSync(specDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(specDir, d.name, 'spec.md')))
    .map((d) => d.name)
    .sort()
    .map((capability) => {
      const path = join(specDir, capability, 'spec.md')
      return { capability, file: relative(root, path), text: readFileSync(path, 'utf8') }
    })
  const spec = parseSpecs(specs)
  const e2e = parseE2E(
    sources(
      root,
      listFiles(join(root, 'e2e'), (n) => n.endsWith('.spec.ts')),
    ),
  )
  const isTest = (n: string) => n.endsWith('.test.ts')
  const vitest = parseVitest(
    sources(root, [
      ...listFiles(join(root, 'src'), isTest),
      ...listFiles(join(root, 'supabase/functions'), isTest),
    ]),
  )
  const pgtap = parsePgTap(
    sources(
      root,
      listFiles(join(root, 'supabase/tests'), (n) => n.endsWith('.sql')),
    ),
  )
  const tests = [...e2e.tests, ...vitest.tests, ...pgtap.tests]
  const problems = [
    ...spec.problems,
    ...e2e.problems,
    ...vitest.problems,
    ...pgtap.problems,
    ...validateKeys(tests, spec.scenarios),
  ]
  return { scenarios: spec.scenarios, tests, problems }
}

export function loadResults(reportsDir: string, tests: TestRef[]): Results {
  const results: Results = new Map()
  const read = (name: string): string | null => {
    const path = join(reportsDir, name)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }
  const vitest = read('vitest.json')
  if (vitest) {
    const files = [...new Set(tests.filter((t) => t.kind === 'vitest').map((t) => t.file))]
    readVitestResults(JSON.parse(vitest), files, results)
  }
  const e2e = read('e2e.json')
  if (e2e) readE2EResults(JSON.parse(e2e), results)
  const pgtap = read('pgtap.txt')
  if (pgtap) readPgTapResults(pgtap, results)
  return results
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function main(args: string[]): number {
  const root = process.cwd()
  const { scenarios, tests, problems } = collect(root)
  const inActions = process.env.GITHUB_ACTIONS === 'true'

  if (args.includes('--check')) {
    for (const p of problems) {
      console.error(
        inActions
          ? `::error file=${p.file},line=${p.line}::${p.message}`
          : `${p.file}:${p.line}  ${p.message}`,
      )
    }
    const mapped = new Set(tests.flatMap((t) => t.keys)).size
    console.log(
      `${scenarios.length} 個 Scenario，${tests.length} 個測試對應到 ${mapped} 個；${problems.length} 個對應錯誤`,
    )
    return problems.length > 0 ? 1 : 0
  }

  const rows = evaluate(
    scenarios,
    tests,
    loadResults(option(args, '--reports') ?? 'reports', tests),
  )
  const markdown = renderMarkdown(rows, problems)
  const out = option(args, '--out')
  if (out) writeFileSync(out, `${markdown}\n`)
  const summary = option(args, '--summary')
  if (summary) appendFileSync(summary, `${markdown}\n`)
  if (!out && !summary) console.log(markdown)
  else
    console.log(
      `已覆蓋 ${rows.filter((r) => r.status !== '未覆蓋').length} / ${rows.length} 個 Scenario`,
    )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
