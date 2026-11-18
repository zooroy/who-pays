import { describe, expect, it } from 'vitest'
import { backTarget } from './backTarget'

const trip = '/t/Ab3dEf6hIj9kLm2nOp5qRs'
const id = '6f1c2b8e-1d2a-4b3c-8d4e-5f6a7b8c9d0e'
const home = { to: '/', label: '我的旅程', titleHidden: false }
const list = { to: trip, label: '台南之旅', titleHidden: true }

describe('backTarget', () => {
  // @scenario 回到上一層 › 從旅程回到首頁
  // @scenario 回到上一層 › 從結算回到首頁
  it('goes from the expense list and settlement to 我的旅程', () => {
    expect(backTarget(trip, '台南之旅', null)).toEqual(home)
    expect(backTarget(`${trip}/settle`, '台南之旅', null)).toEqual(home)
  })
  // @scenario 回到上一層 › 從支出明細回到列表
  // @scenario 回到上一層 › 從分享連結直接進入後返回
  it('goes from expense detail, new expense and 拍收據 to the expense list', () => {
    expect(backTarget(`${trip}/expenses/${id}`, '台南之旅', null)).toEqual(list)
    expect(backTarget(`${trip}/expenses/new`, '台南之旅', null)).toEqual(list)
  })
  // @scenario 回到上一層 › 從編輯支出回到明細
  it('goes from editing an expense to its detail', () => {
    expect(backTarget(`${trip}/expenses/${id}/edit`, '台南之旅', null)).toEqual({
      to: `${trip}/expenses/${id}`,
      label: '支出明細',
      titleHidden: true,
    })
  })
  // @scenario 回到上一層 › 從成員面板返回
  it('closes the member panel back to the list', () => {
    expect(backTarget(trip, '台南之旅', 'members')).toEqual({
      panel: null,
      label: '台南之旅',
      titleHidden: true,
    })
  })
  // @scenario 回到上一層 › 從編輯成員返回
  it('goes from each member sub-panel back to the member panel', () => {
    const members = { panel: 'members', label: '成員', titleHidden: true }
    for (const panel of ['add', 'switch', 'settings', { edit: id }] as const)
      expect(backTarget(trip, '台南之旅', panel)).toEqual(members)
  })
  it('lets an open panel win over the URL', () => {
    expect(backTarget(`${trip}/settle`, '台南之旅', 'switch')).toEqual({
      panel: 'members',
      label: '成員',
      titleHidden: true,
    })
  })
})
