import { describe, it, expect } from 'vitest'
import { parseTodoInput } from '../extension/input-parser.js'

describe('parseTodoInput', () => {
  it('text only', () => {
    expect(parseTodoInput('催小李合同')).toEqual({ text: '催小李合同', projectName: null, reminders: [] })
  })
  it('text + # at end', () => {
    expect(parseTodoInput('催小李合同 #合同流程')).toEqual({ text: '催小李合同', projectName: '合同流程', reminders: [] })
  })
  it('# in middle uses last as project', () => {
    expect(parseTodoInput('开会 #XX 项目')).toEqual({ text: '开会', projectName: 'XX 项目', reminders: [] })
  })
  it('# at start', () => {
    expect(parseTodoInput('#项目 任务文本')).toEqual({ text: '任务文本', projectName: '项目', reminders: [] })
  })
  it('multiple # — last wins', () => {
    expect(parseTodoInput('do #a then #b')).toEqual({ text: 'do then', projectName: 'b', reminders: [] })
  })
  it('empty text after parsing returns empty', () => {
    expect(parseTodoInput('#proj')).toEqual({ text: '', projectName: 'proj', reminders: [] })
  })
})

describe('parseTodoInput — 加 @reminder + ~repeat', () => {
  const REM_NOW = new Date(2026, 4, 21, 10, 0, 0).getTime()
  const remAt = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).getTime()

  it('文本 + #项目 + @时间', () => {
    const r = parseTodoInput('回邮件 #work @14:30', REM_NOW)
    expect(r.text).toBe('回邮件')
    expect(r.projectName).toBe('work')
    expect(r.reminders[0].firstAt).toBe(remAt(2026, 5, 21, 14, 30))
    expect(r.reminders[0].rule).toBe('once')
  })

  it('文本 + @时间 + ~重复 + #项目', () => {
    const r = parseTodoInput('喝水 @9:00 ~每天 #health', REM_NOW)
    expect(r.text).toBe('喝水')
    expect(r.projectName).toBe('health')
    expect(r.reminders[0].rule).toBe('daily')
  })

  it('无 @/~ → reminders 空（向后兼容）', () => {
    const r = parseTodoInput('做事 #work', REM_NOW)
    expect(r.reminders).toEqual([])
  })
})
