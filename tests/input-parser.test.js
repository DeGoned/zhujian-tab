import { describe, it, expect } from 'vitest'
import { parseTodoInput } from '../extension/input-parser.js'

describe('parseTodoInput', () => {
  it('text only', () => {
    expect(parseTodoInput('催小李合同')).toEqual({ text: '催小李合同', projectName: null })
  })
  it('text + # at end', () => {
    expect(parseTodoInput('催小李合同 #合同流程')).toEqual({ text: '催小李合同', projectName: '合同流程' })
  })
  it('# in middle uses last as project', () => {
    expect(parseTodoInput('开会 #XX 项目')).toEqual({ text: '开会', projectName: 'XX 项目' })
  })
  it('# at start', () => {
    expect(parseTodoInput('#项目 任务文本')).toEqual({ text: '任务文本', projectName: '项目' })
  })
  it('multiple # — last wins', () => {
    expect(parseTodoInput('do #a then #b')).toEqual({ text: 'do then', projectName: 'b' })
  })
  it('empty text after parsing returns empty', () => {
    expect(parseTodoInput('#proj')).toEqual({ text: '', projectName: 'proj' })
  })
})
