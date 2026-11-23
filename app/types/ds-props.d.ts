/** build/ds-props-plugin.ts 가 빌드 때 만들어 주는 디자인 시스템 컴포넌트 속성 목록 */
declare module 'virtual:iris-ds-props' {
  export type DsPropKind = 'enum' | 'boolean' | 'string' | 'number' | 'other'
  export interface DsPropMeta {
    name: string
    kind: DsPropKind
    /** enum 선택지 — 숫자 리터럴 유니온이면 숫자 그대로 */
    options?: (string | number)[]
    default?: unknown
    /** JSDoc 첫 줄 */
    doc?: string
    /** true 면 속성이 아니라 default 슬롯(글자로 채움) */
    slot?: boolean
  }
  const meta: Record<string, DsPropMeta[]>
  export default meta
}
