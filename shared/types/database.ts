// supabase/migrations 와 같은 모양의 DB 타입.
// 실제 Supabase 프로젝트를 연결하면 `npx supabase gen types typescript --project-id <id> > shared/types/database.ts` 로 바꿉니다.
/** 프로젝트 역할(PRD/12): 방장 · 부방장 · 기획 편집 · 디자인 편집 · 검토자 · 보기 전용 */
export type ProjectRole = 'owner' | 'deputy' | 'planner_editor' | 'designer_editor' | 'reviewer' | 'viewer'
/** 코멘트(스레드 첫 글 = thread_id 없음, 핀 자리 x · y 는 화면 기준 — 화면 없으면 페이지 캔버스 기준) */
export type CommentRow = { id: string; project_id: string; page_id: string | null; screen_id: string | null; thread_id: string | null; no: number | null; x: number | null; y: number | null; author_id: string; body: string; mentions: string[]; /** 붙인 이미지(storage://screens/comments/…) — 20261128 마이그레이션 */ attachments?: string[]; /** 핀이 붙은 캔버스 섹션 · 프레임 레이어(x · y 는 그 기준) */ layer_id?: string | null; /** 영역 코멘트: 핀과 같은 기준 { x, y, w, h } */ area?: { x: number; y: number; w: number; h: number } | null; /** 이모지 반응 { 이모지: 멤버 id[] } */ reactions?: Record<string, string[]>; resolved_at: string | null; resolved_by: string | null; created_at: string; edited_at: string | null }
type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      workspaces: Row<{ id: string; name: string; allowed_email_domain: string; created_at: string }>
      members: Row<{ id: string; workspace_id: string; email: string; name: string; role: 'planner' | 'designer' | 'developer'; avatar_url: string | null; is_admin: boolean; created_at: string }>
      projects: Row<{ id: string; workspace_id: string; name: string; description: string | null; kind: 'app' | 'web' | 'detail_page'; status: 'planning' | 'designing' | 'developing' | 'done'; cover_screen_id: string | null; created_by: string; created_at: string; updated_at: string }>
      pages: Row<{ id: string; project_id: string; name: string; sort_order: number; viewport: { background?: string | null; pixelGrid?: boolean } | null; layers: unknown }>
      screens: Row<{ id: string; page_id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; device: string | null; layers: unknown; figma_file_key: string | null; figma_node_id: string | null; figma_url: string | null; thumbnail_path: string | null; figma_layer_summary: unknown; figma_synced_at: string | null; status: 'draft' | 'review' | 'approved'; sort_order: number; updated_by: string | null; updated_at: string }>
      documents: Row<{ id: string; project_id: string; title: string; category: 'planning' | 'dev' | 'design' | 'etc'; source_type: 'native' | 'upload' | 'link'; content_blocks: unknown; file_path: string | null; file_type: 'pdf' | 'docx' | 'md' | null; url: string | null; rendered_html: string | null; plain_text: string | null; fetched_at: string | null; fetch_status: 'ok' | 'failed' | 'manual' | null; version_label: string | null; created_by: string; updated_at: string }>
      requirements: Row<{ id: string; project_id: string; document_id: string; code: string; title: string; body: string | null; anchor: unknown; priority: 'must' | 'should' | 'could' | null; origin: 'auto_pattern' | 'manual' | 'ai'; created_by: string; created_at: string }>
      screen_requirements: Row<{ screen_id: string; requirement_id: string; status: 'reflected' | 'partial' | 'missing' | 'na'; note: string | null; layer_ids: string[] | null; updated_by: string | null; updated_at: string }>
      components: Row<{ id: string; workspace_id: string; name: string; code_name: string | null; category: string; description: string | null; thumbnail_path: string | null; figma_component_key: string | null; match_aliases: string[] | null; props_schema: unknown }>
      tokens: Row<{ id: string; workspace_id: string; type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'; name: string; value: unknown; description: string | null }>
      screen_component_usages: Row<{ id: string; screen_id: string; component_id: string | null; detected_name: string; count: number; source: 'figma' | 'native' }>
      // 1단계(20261126000000_project_roles.sql): 프로젝트 역할 · 초대 · 알림 · 기록
      project_members: Row<{ project_id: string; member_id: string; role: ProjectRole; added_by: string | null; created_at: string }>
      project_invites: Row<{ id: string; project_id: string; email: string; kind: 'invite' | 'join'; requested_by: string; status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'; role: Exclude<ProjectRole, 'owner'> | null; decided_by: string | null; decided_at: string | null; seen_at: string | null; created_at: string; expires_at: string }>
      notifications: Row<{ id: string; member_id: string; project_id: string | null; kind: string; target_type: string | null; target_id: string | null; actor_id: string | null; payload: Record<string, unknown>; group_key: string | null; count: number; read_at: string | null; created_at: string }>
      activity_log: Row<{ id: string; project_id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; before: unknown; after: unknown; created_at: string }>
      // 2단계(20261127000000_comments_realtime.sql): 코멘트 · 읽음
      comments: Row<CommentRow>
      comment_reads: Row<{ member_id: string; thread_id: string; seen_at: string }>
    }
    Views: Record<string, never>
    Functions: {
      invite_to_project: { Args: { pid: string; mail: string; r?: string | null }; Returns: string }
      request_join: { Args: { pid: string }; Returns: string }
      toggle_reaction: { Args: { cid: string; emo: string }; Returns: Record<string, string[]> }
      decide_invite: { Args: { inv: string; approve: boolean; r?: string | null }; Returns: undefined }
      cancel_invite: { Args: { inv: string }; Returns: undefined }
      set_project_role: { Args: { pid: string; mid: string; r: string }; Returns: undefined }
      remove_project_member: { Args: { pid: string; mid: string }; Returns: undefined }
      transfer_project_owner: { Args: { pid: string; mid: string }; Returns: undefined }
      mark_invites_seen: { Args: { pid: string }; Returns: undefined }
      expire_invites: { Args: Record<string, never>; Returns: number }
      resolve_comment: { Args: { cid: string; done: boolean }; Returns: undefined }
      project_role: { Args: { pid: string }; Returns: string | null }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
