// supabase/migrations 와 같은 모양의 DB 타입.
// 실제 Supabase 프로젝트를 연결하면 `npx supabase gen types typescript --project-id <id> > shared/types/database.ts` 로 바꿉니다.
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
