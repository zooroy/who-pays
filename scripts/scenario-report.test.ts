import { describe, expect, it } from 'vitest'
import {
  evaluate,
  parseE2E,
  parsePgTap,
  parseSpecs,
  parseVitest,
  readE2EResults,
  readPgTapResults,
  readVitestResults,
  renderMarkdown,
  validateKeys,
  type Results,
} from './scenario-report.ts'

const SPEC = [
  '## Requirements',
  '',
  '### Requirement: 標記已付',
  '系統 SHALL …',
  '',
  '#### Scenario: 標記已付',
  '- **WHEN** …',
  '',
  '#### Scenario: 取消標記',
  '',
  '### Requirement: 依幣別計算淨額',
  '',
  '#### Scenario: 單一幣別淨額',
].join('\n')

const { scenarios } = parseSpecs([{ capability: 'settlement', file: 'spec.md', text: SPEC }])

const lines = (...l: string[]) => l.join('\n')

describe('parseSpecs', () => {
  it('reads every Scenario under its Requirement', () => {
    expect(scenarios.map((s) => s.key)).toEqual([
      '標記已付 › 標記已付',
      '標記已付 › 取消標記',
      '依幣別計算淨額 › 單一幣別淨額',
    ])
    expect(scenarios[0].capability).toBe('settlement')
  })

  it('reports duplicate keys across capabilities and orphan Scenarios', () => {
    const { problems } = parseSpecs([
      { capability: 'a', file: 'a.md', text: SPEC },
      {
        capability: 'b',
        file: 'b.md',
        text: lines('#### Scenario: 孤兒', '### Requirement: 標記已付', '#### Scenario: 取消標記'),
      },
    ])
    expect(problems.map((p) => [p.file, p.line])).toEqual([
      ['b.md', 1],
      ['b.md', 3],
    ])
    expect(problems[1].message).toContain('重複')
  })
})

describe('parseE2E', () => {
  it('uses each test title as its Scenario key and ignores describe and .test()', () => {
    const { tests, problems } = parseE2E([
      {
        file: 'e2e/settlement.spec.ts',
        text: lines(
          "test.describe('settlement', () => {",
          "  test('標記已付 › 標記已付', async ({ page }) => {",
          '    if (/x/.test(url)) return',
          '  })',
        ),
      },
    ])
    expect(problems).toEqual([])
    expect(tests).toMatchObject([{ kind: 'e2e', line: 2, keys: ['標記已付 › 標記已付'] }])
  })

  it('rejects titles that are not a string on the same line', () => {
    const { problems } = parseE2E([
      { file: 'e.spec.ts', text: lines('test(', "  '標記已付 › 標記已付',") },
    ])
    expect(problems).toMatchObject([{ file: 'e.spec.ts', line: 1 }])
  })
})

describe('parseVitest', () => {
  it('attaches consecutive annotations to the next it/test call', () => {
    const { tests, problems } = parseVitest([
      {
        file: 'src/lib/settle.test.ts',
        text: lines(
          "describe('settle', () => {",
          '  // @scenario 標記已付 › 標記已付',
          '  // keeps the order stable',
          '',
          '  // @scenario 依幣別計算淨額 › 單一幣別淨額',
          "  it('nets one currency', () => {})",
          '  test.skip("has \\"quotes\\"", () => {})',
          '})',
        ),
      },
    ])
    expect(problems).toEqual([])
    expect(tests).toEqual([
      {
        kind: 'vitest',
        file: 'src/lib/settle.test.ts',
        line: 6,
        title: 'nets one currency',
        keys: ['標記已付 › 標記已付', '依幣別計算淨額 › 單一幣別淨額'],
      },
    ])
  })

  it('reports annotations without a following test, bad format and duplicate titles', () => {
    const { tests, problems } = parseVitest([
      {
        file: 'a.test.ts',
        text: lines(
          '// @scenario 標記已付 › 標記已付',
          "describe('x', () => {",
          '  // @scenario 沒有分隔符號',
          "  it('dup', () => {})",
          '  // @scenario 標記已付 › 標記已付',
          "  it('dup', () => {})",
          '  // @scenario 標記已付 › 取消標記',
        ),
      },
    ])
    expect(tests).toEqual([])
    expect(problems.map((p) => p.line)).toEqual([1, 3, 6, 7])
    expect(problems[0].message).toContain('緊接 it(')
    expect(problems[1].message).toContain('格式')
    expect(problems[2].message).toContain('多個測試')
    expect(problems[3].message).toContain('後面沒有測試')
  })
})

describe('parsePgTap', () => {
  it('maps the whole file to every distinct annotation', () => {
    const { tests } = parsePgTap([
      {
        file: 'supabase/tests/rls.test.sql',
        text: lines(
          'begin;',
          '-- @scenario 標記已付 › 標記已付',
          'select ok(true);',
          '-- @scenario 標記已付 › 標記已付',
        ),
      },
      { file: 'supabase/tests/none.test.sql', text: 'select ok(true);' },
    ])
    expect(tests).toEqual([
      {
        kind: 'pgtap',
        file: 'supabase/tests/rls.test.sql',
        line: 2,
        title: 'rls.test.sql',
        keys: ['標記已付 › 標記已付'],
      },
    ])
  })
})

describe('validateKeys', () => {
  it('reports unknown keys with the closest Scenario', () => {
    const problems = validateKeys(
      [
        {
          kind: 'e2e',
          file: 'e.spec.ts',
          line: 3,
          title: '標記已付 › 標記己付',
          keys: ['標記已付 › 標記己付'],
        },
      ],
      scenarios,
    )
    expect(problems).toEqual([
      {
        file: 'e.spec.ts',
        line: 3,
        message: '找不到 Scenario「標記已付 › 標記己付」；最接近的是「標記已付 › 標記已付」',
      },
    ])
  })
})

describe('results and evaluation', () => {
  const tests = [
    ...parseE2E([{ file: 'e2e/s.spec.ts', text: "test('標記已付 › 標記已付', () => {})" }]).tests,
    ...parseVitest([
      {
        file: 'src/lib/settle.test.ts',
        text: lines(
          '// @scenario 標記已付 › 標記已付',
          "it('a', () => {})",
          '// @scenario 標記已付 › 取消標記',
          "it('b', () => {})",
        ),
      },
    ]).tests,
    ...parsePgTap([
      { file: 'supabase/tests/rls.test.sql', text: '-- @scenario 依幣別計算淨額 › 單一幣別淨額' },
    ]).tests,
  ]

  it('reads Vitest, Playwright and pg_prove output', () => {
    const results: Results = new Map()
    readVitestResults(
      {
        testResults: [
          {
            name: '/home/runner/work/x/src/lib/settle.test.ts',
            assertionResults: [
              { title: 'a', status: 'passed' },
              { title: 'b', status: 'failed' },
            ],
          },
          { name: '/other.test.ts', assertionResults: [{ title: 'a', status: 'failed' }] },
        ],
      },
      ['src/lib/settle.test.ts'],
      results,
    )
    readE2EResults(
      {
        suites: [
          {
            title: 's.spec.ts',
            specs: [],
            suites: [
              {
                title: 'settlement',
                specs: [
                  { title: '標記已付 › 標記已付', ok: true, tests: [{ status: 'expected' }] },
                ],
              },
            ],
          },
        ],
      },
      results,
    )
    readPgTapResults(
      lines(
        '/x/supabase/tests/rls.test.sql ............ ok',
        '/x/supabase/tests/rpc.test.sql .. ',
        '# Failed test 11: "forced failure"',
        'Failed 1/11 subtests ',
        'Test Summary Report',
        '/x/supabase/tests/rpc.test.sql (Wstat: 0 Tests: 11 Failed: 1)',
      ),
      results,
    )
    expect(Object.fromEntries(results)).toEqual({
      'vitest:src/lib/settle.test.ts:a': ['passed'],
      'vitest:src/lib/settle.test.ts:b': ['failed'],
      'e2e::標記已付 › 標記已付': ['passed'],
      'pgtap:rls.test.sql:': ['passed'],
      'pgtap:rpc.test.sql:': ['failed'],
    })

    const rows = evaluate(scenarios, tests, results)
    expect(rows.map((r) => r.status)).toEqual(['通過', '失敗', '通過'])
  })

  it('marks mapped tests without results as not run, and unmapped Scenarios as uncovered', () => {
    const rows = evaluate(scenarios, tests.slice(0, 1), new Map())
    expect(rows.map((r) => r.status)).toEqual(['未執行', '未覆蓋', '未覆蓋'])

    const md = renderMarkdown(rows, [{ file: 'a.test.ts', line: 1, message: '錯誤' }])
    expect(md).toContain('已覆蓋 **1 / 3** 個 Scenario')
    expect(md).toContain('對應錯誤（1）')
    expect(md).toContain('| settlement | 3 | 1 | 0 | 0 | 1 |')
    expect(md).toContain('<details><summary>未覆蓋的 Scenario（2）</summary>')
  })
})
