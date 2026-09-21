export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgRole = "owner" | "admin" | "member"
export type ScorecardStatus = "draft" | "published" | "paused" | "archived"
export type ScorecardLanguage = "fr" | "en"

export type Organization = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type Scorecard = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string | null
  language: ScorecardLanguage
  category: string
  status: ScorecardStatus
  cover_image_url: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  estimated_minutes: number
  privacy_text: string | null
  seo_title: string | null
  seo_description: string | null
  og_title: string | null
  og_description: string | null
  og_image_url: string | null
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ScorecardPage = {
  id: string
  scorecard_id: string
  title: string
  subtitle: string | null
  description: string | null
  hero_image_url: string | null
  benefits: Json
  testimonial: Json
  cta_text: string
  eyebrow: string | null
  estimated_time_label: string | null
  show_estimated_time: boolean
  show_question_count: boolean
  show_privacy: boolean
}

export type Template = {
  id: string
  organization_id: string | null
  key: string
  name: string
  description: string
  category: string
  objective: string | null
  is_system: boolean
  created_at: string
}

export type ScorecardStats = {
  scorecard_id: string
  visitors: number
  participants: number
  results: number
}

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type Table<Row extends Record<string, unknown>, Rel extends Relationship[] = []> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: Rel
}

type OrgMemberRow = {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization>
      profiles: Table<Profile>
      organization_members: Table<
        OrgMemberRow,
        [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      >
      scorecards: Table<Scorecard>
      scorecard_pages: Table<
        ScorecardPage,
        [
          {
            foreignKeyName: "scorecard_pages_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: true
            referencedRelation: "scorecards"
            referencedColumns: ["id"]
          },
        ]
      >
      templates: Table<Template>
      questions: Table<{
        id: string
        scorecard_id: string
        question_category_id: string | null
        scoring_category_id: string | null
        type: string
        title: string
        description: string | null
        is_required: boolean
        is_scored: boolean
        position: number
        max_score: number | null
        settings: Json
      }>
      question_options: Table<{
        id: string
        question_id: string
        label: string
        value: string | null
        score: number
        position: number
      }>
      question_categories: Table<{
        id: string
        scorecard_id: string
        name: string
        description: string | null
        icon: string | null
        weight: number
        position: number
      }>
      scoring_categories: Table<{
        id: string
        scorecard_id: string
        name: string
        description: string | null
        weight: number
        max_score: number
        position: number
      }>
      scoring_rules: Table<{
        id: string
        scorecard_id: string
        scoring_category_id: string | null
        rule_type: string
        config: Json
        position: number
      }>
      result_ranges: Table<{
        id: string
        scorecard_id: string
        min_percent: number
        max_percent: number
        label: string
        title: string
        description: string | null
        badge: string | null
        position: number
      }>
      result_recommendations: Table<{
        id: string
        result_range_id: string
        title: string
        body: string | null
        cta_label: string | null
        cta_url: string | null
        image_url: string | null
        position: number
      }>
      scorecard_lead_forms: Table<{
        id: string
        scorecard_id: string
        timing: "before" | "during" | "before_results" | "after_results"
        consent_required: boolean
        consent_label: string
        privacy_policy_url: string | null
        fields: Json
      }>
      respondents: Table<{
        id: string
        organization_id: string
        email: string | null
        first_name: string | null
        last_name: string | null
        phone: string | null
        whatsapp: string | null
        company: string | null
        job_title: string | null
        country: string | null
        city: string | null
        consent_at: string | null
        consent_given: boolean
        consent_text: string | null
        phone_normalized: string | null
        whatsapp_normalized: string | null
        created_at: string
        updated_at: string
      }>
      assessment_sessions: Table<{
        id: string
        scorecard_id: string
        respondent_id: string | null
        anonymous_key: string
        status: "started" | "in_progress" | "completed" | "abandoned"
        current_step: number
        device_type: string | null
        referrer: string | null
        landing_path: string | null
        started_at: string
        completed_at: string | null
        last_activity_at: string
        expires_at: string
        client_hash: string | null
        created_at: string
        updated_at: string
      }>
      responses: Table<{
        id: string
        session_id: string
        question_id: string
        option_id: string | null
        value_text: string | null
        value_number: number | null
        score_awarded: number
        created_at: string
        updated_at: string
      }>
      assessment_results: Table<{
        id: string
        session_id: string
        overall_score: number
        overall_percent: number
        result_range_id: string | null
        calculated_at: string
        created_at: string
        updated_at: string
      }>
      category_scores: Table<{
        id: string
        result_id: string
        scoring_category_id: string
        score: number
        percent: number
        max_score: number
        created_at: string
        updated_at: string
      }>
      leads: Table<{
        id: string
        organization_id: string
        scorecard_id: string | null
        session_id: string | null
        respondent_id: string | null
        result_id: string | null
        source: string | null
        tags: string[]
        status: "new" | "contacted" | "qualified" | "nurturing" | "converted" | "lost"
        anonymized_at: string | null
        created_at: string
        updated_at: string
      }>
      events: Table<{
        id: string
        organization_id: string
        scorecard_id: string | null
        session_id: string | null
        event_type: string
        metadata: Json
        created_at: string
      }>
      utm_tracking: Table<{
        id: string
        session_id: string
        utm_source: string | null
        utm_medium: string | null
        utm_campaign: string | null
        utm_content: string | null
        utm_term: string | null
        created_at: string
      }>
      cta_clicks: Table<{
        id: string
        session_id: string
        recommendation_id: string | null
        url: string
        created_at: string
      }>
      lead_tags: Table<{
        id: string
        organization_id: string
        name: string
        color: string
        created_at: string
        updated_at: string
      }>
      lead_tag_assignments: Table<{
        lead_id: string
        tag_id: string
        created_at: string
      }>
      lead_notes: Table<{
        id: string
        organization_id: string
        lead_id: string
        author_id: string | null
        content: string
        created_at: string
        updated_at: string
      }>
      lead_activities: Table<{
        id: string
        organization_id: string
        lead_id: string
        author_id: string | null
        kind: string
        summary: string
        created_at: string
      }>
    }
    Views: {
      scorecard_stats: {
        Row: ScorecardStats
        Relationships: []
      }
    }
    Functions: {
      bootstrap_membership: {
        Args: Record<string, never>
        Returns: string
      }
      dashboard_overview: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      duplicate_scorecard: {
        Args: { source_id: string }
        Returns: string
      }
      add_organization_member: {
        Args: { member_email: string; member_role: OrgRole }
        Returns: string
      }
      remove_organization_member: {
        Args: { target_user: string }
        Returns: undefined
      }
      save_session_answer: {
        Args: {
          p_token_hash: string
          p_question_id: string
          p_option_ids: string[]
          p_value_text: string | null
          p_value_number: number | null
        }
        Returns: undefined
      }
      commit_assessment_result: {
        Args: {
          p_token_hash: string
          p_overall_score: number
          p_overall_percent: number
          p_range_id: string
          p_categories: Json
        }
        Returns: Json
      }
      list_org_leads: {
        Args: {
          p_query?: string | null
          p_scorecard?: string | null
          p_status?: string | null
          p_temperature?: string | null
          p_country?: string | null
          p_tag?: string | null
          p_range?: string | null
          p_score_min?: number | null
          p_score_max?: number | null
          p_from?: string | null
          p_to?: string | null
          p_utm_source?: string | null
          p_utm_campaign?: string | null
          p_cta?: string | null
          p_sort?: string | null
          p_limit?: number | null
          p_offset?: number | null
          p_ids?: string[] | null
        }
        Returns: Json
      }
      analytics_overview: {
        Args: {
          p_from: string
          p_to: string
          p_prev_from: string
          p_prev_to: string
          p_scorecard?: string | null
        }
        Returns: Json
      }
      scorecard_question_stats: {
        Args: { p_scorecard: string; p_from: string; p_to: string }
        Returns: Json
      }
    }
    Enums: {
      org_role: OrgRole
      scorecard_status: ScorecardStatus
      scorecard_language: ScorecardLanguage
    }
    CompositeTypes: Record<string, never>
  }
}
