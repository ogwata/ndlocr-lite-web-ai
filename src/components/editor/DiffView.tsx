import { useMemo, useState, useCallback, useEffect } from 'react'
import DiffMatchPatch from 'diff-match-patch'
import type { Language } from '../../i18n'

export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

interface DiffViewProps {
  originalText: string
  correctedText: string
  onAcceptAll: () => void
  onRejectAll: () => void
  onApplySelective: (text: string) => void
  lang: Language
}

export function computeDiff(original: string, corrected: string): DiffSegment[] {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(original, corrected)
  dmp.diff_cleanupSemantic(diffs)
  return diffs.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }))
}

/** 変更をグループ化: delete+insertのペアや単独の変更をまとめる */
type ChangeGroup = {
  id: number
  segments: DiffSegment[]
}

function groupChanges(segments: DiffSegment[]): Array<ChangeGroup | DiffSegment> {
  const result: Array<ChangeGroup | DiffSegment> = []
  let changeId = 0

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'equal') {
      result.push(seg)
    } else {
      // delete の次に insert が来る場合をグループ化
      const group: DiffSegment[] = [seg]
      if (seg.type === 'delete' && i + 1 < segments.length && segments[i + 1].type === 'insert') {
        group.push(segments[i + 1])
        i++
      }
      result.push({ id: changeId++, segments: group })
    }
  }
  return result
}

export function DiffView({
  originalText,
  correctedText,
  onAcceptAll,
  onRejectAll,
  onApplySelective,
  lang,
}: DiffViewProps) {
  const segments = useMemo(
    () => computeDiff(originalText, correctedText),
    [originalText, correctedText],
  )

  const grouped = useMemo(() => groupChanges(segments), [segments])
  const totalChanges = grouped.filter((g): g is ChangeGroup => 'id' in g).length

  // 各変更の accept/reject 状態: undefined=未決定, true=accept, false=reject
  const [decisions, setDecisions] = useState<Record<number, boolean>>({})
  const [, setHistory] = useState<Array<Record<number, boolean>>>([])

  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev, { ...decisions }])
  }, [decisions])

  const handleAccept = useCallback((id: number) => {
    pushHistory()
    setDecisions((prev) => ({ ...prev, [id]: true }))
  }, [pushHistory])

  const handleReject = useCallback((id: number) => {
    pushHistory()
    setDecisions((prev) => ({ ...prev, [id]: false }))
  }, [pushHistory])

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const last = next.pop()!
      setDecisions(last)
      return next
    })
  }, [])

  // Ctrl+Z / Cmd+Z でアンドゥ
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  // 個別決定を適用してテキストを構築
  const handleApplyDecisions = useCallback(() => {
    let result = ''
    for (const item of grouped) {
      if (!('id' in item)) {
        // equal segment
        result += item.text
      } else {
        const accepted = decisions[item.id]
        if (accepted === true) {
          // accept: insert を使う（delete を除外）
          for (const seg of item.segments) {
            if (seg.type === 'insert') result += seg.text
          }
        } else if (accepted === false) {
          // reject: delete を使う（insert を除外）
          for (const seg of item.segments) {
            if (seg.type === 'delete') result += seg.text
          }
        } else {
          // 未決定: 元のまま（delete を使う）
          for (const seg of item.segments) {
            if (seg.type === 'delete') result += seg.text
          }
        }
      }
    }
    onApplySelective(result)
  }, [grouped, decisions, onApplySelective])

  const decidedCount = Object.keys(decisions).length

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <span className="diff-view-stats">
          {lang === 'ja'
            ? `${totalChanges} 件の修正`
            : `${totalChanges} changes`}
          {decidedCount > 0 && (
            <span className="diff-decided-count">
              {' '}({decidedCount}/{totalChanges})
            </span>
          )}
        </span>
        <div className="diff-view-actions">
          <button className="btn btn-primary btn-sm" onClick={onAcceptAll}>
            {lang === 'ja' ? '全て適用' : 'Accept All'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onRejectAll}>
            {lang === 'ja' ? '全て却下' : 'Reject All'}
          </button>
          {decidedCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={handleApplyDecisions}>
              {lang === 'ja' ? '選択を適用' : 'Apply Selected'}
            </button>
          )}
        </div>
        <p className="diff-view-hint">
          {lang === 'ja'
            ? '各修正の ✓ で適用、✗ で却下、「ctrl+z」で1つ前に戻る。選んだ後「選択を適用」をクリック。'
            : 'Click ✓ to accept, ✗ to reject, ctrl+z to undo. Then click "Apply Selected".'}
        </p>
      </div>
      <div className="diff-view-body">
        {grouped.map((item, i) => {
          if (!('id' in item)) {
            return <span key={`eq-${i}`} className="diff-equal">{item.text}</span>
          }

          const decision = decisions[item.id]
          const accepted = decision === true
          const rejected = decision === false

          return (
            <span key={`ch-${item.id}`} className={`diff-change-group ${accepted ? 'accepted' : ''} ${rejected ? 'rejected' : ''}`}>
              {item.segments.map((seg, j) => {
                if (seg.type === 'delete') {
                  return (
                    <span
                      key={j}
                      className={`diff-delete ${accepted ? 'diff-decided-hide' : ''}`}
                    >
                      {seg.text}
                    </span>
                  )
                }
                return (
                  <span
                    key={j}
                    className={`diff-insert ${rejected ? 'diff-decided-hide' : ''}`}
                  >
                    {seg.text}
                  </span>
                )
              })}
              {decision === undefined && (
                <span className="diff-change-buttons">
                  <button
                    className="diff-btn-accept"
                    onClick={() => handleAccept(item.id)}
                    title={lang === 'ja' ? '適用' : 'Accept'}
                  >
                    ✓
                  </button>
                  <button
                    className="diff-btn-reject"
                    onClick={() => handleReject(item.id)}
                    title={lang === 'ja' ? '却下' : 'Reject'}
                  >
                    ✗
                  </button>
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
