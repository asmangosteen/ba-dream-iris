/**
 * 저장하지 못한 화면 내용 보관(피그마 autosave 처럼 — 이 브라우저에만).
 * 자동저장이 실패하면(인터넷 끊김 · 서버 오류 · 로그인 만료) 그 화면의 레이어 내용을 localStorage 에 남기고,
 * 저장에 성공하면 지워요. 새로 고치거나 탭을 닫았다가 다시 열면 남은 내용을 '복구'할지 물어봐요.
 * - 열쇠: iris-unsaved:<projectId> → { [screenId]: { doc, at } }
 * - 다른 브라우저 · 기기에서는 보이지 않아요. 시크릿 창이나 브라우저 데이터를 지우면 함께 사라져요
 * - 저장 공간이 가득 차 보관하지 못하면 false — 부르는 쪽이 알려요
 */
export interface UnsavedEntry { doc: unknown; at: number }

export function useUnsavedBackup(projectId: string) {
  const KEY = `iris-unsaved:${projectId}`
  function read(): Record<string, UnsavedEntry> {
    if (!import.meta.client) return {}
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      return v && typeof v === 'object' ? v as Record<string, UnsavedEntry> : {}
    } catch { return {} }
  }
  function writeAll(all: Record<string, UnsavedEntry>): boolean {
    try {
      if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all))
      else localStorage.removeItem(KEY)
      return true
    } catch { return false }
  }
  /** 화면 하나 보관(실패한 저장의 내용) */
  function put(screenId: string, doc: unknown): boolean {
    const all = read()
    all[screenId] = { doc, at: Date.now() }
    return writeAll(all)
  }
  /** 저장에 성공한 화면은 지워요 */
  function drop(screenId: string) {
    const all = read()
    if (!(screenId in all)) return
    delete all[screenId]
    writeAll(all)
  }
  function clear() { writeAll({}) }
  return { read, put, drop, clear }
}
