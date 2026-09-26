export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgRole = "owner" | "admin" | "member"
export type AccessRole = "owner" | "admin" | "editor" | "analyst" | "viewer" | "member"
export type ScorecardStatus = "draft" | "published" | "paused" | "archived"
export type ScorecardLanguage = "fr" | "en"

export type Organization = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  report_settings: Json
  website: string
  country: string
  timezone: string
  default_language: string
  use_case: string
  footer_text: string
  favicon_url: string | null
  font_preference: string
  trial_used_at: string | null
  onboarding_completed_at: string | null
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
  undo_document: Json | null
  report_config: Json
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
  access_role: AccessRole
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
      scorecard_releases: Table<{
        scorecard_id: string
        organization_id: string
        document: Json
        published_at: string
      }>
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
        archived_at: string | null
      }>
      question_options: Table<{
        id: string
        question_id: string
        label: string
        value: string | null
        score: number
        position: number
        archived_at: string | null
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
        high_message: string
        medium_message: string
        low_message: string
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
        consent_third_party: boolean
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
        matched_range_id: string | null
        triggered_rules: Json
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
      integrations: Table<{
        id: string
        organization_id: string
        provider: "webhook" | "brevo" | "hubspot" | "whatsapp" | "zapier" | "make" | "n8n" | "custom"
        name: string
        status: "active" | "disabled"
        config: Json
        encrypted_credentials: string | null
        created_at: string
        updated_at: string
      }>
      integration_events: Table<{
        id: string
        organization_id: string
        event_type: string
        payload: Json
        created_at: string
      }>
      webhook_deliveries: Table<{
        id: string
        organization_id: string
        integration_id: string
        event_type: string
        event_id: string
        payload: Json
        attempt: number
        status: "pending" | "processing" | "delivered" | "failed" | "dead"
        http_status: number | null
        response_excerpt: string | null
        next_retry_at: string | null
        created_at: string
        delivered_at: string | null
      }>
      integration_jobs: Table<{
        id: string
        organization_id: string
        delivery_id: string | null
        kind: string
        payload: Json
        status: "pending" | "processing" | "completed" | "failed"
        attempts: number
        next_run_at: string
        locked_at: string | null
        last_error: string | null
        created_at: string
      }>
      automation_rules: Table<{
        id: string
        organization_id: string
        name: string
        enabled: boolean
        trigger: string
        conditions: Json
        action_type: string
        action_config: Json
        created_at: string
        updated_at: string
      }>
      automation_runs: Table<{
        id: string
        organization_id: string
        rule_id: string
        event_id: string
        status: string
        started_at: string
        completed_at: string | null
        error: string | null
      }>
      notifications: Table<{
        id: string
        organization_id: string
        user_id: string | null
        type: string
        title: string
        message: string
        metadata: Json
        dedupe_key: string | null
        read_at: string | null
        created_at: string
      }>
      conversions: Table<{
        id: string
        organization_id: string
        lead_id: string | null
        scorecard_id: string | null
        session_id: string | null
        conversion_type: "registration" | "purchase" | "booking" | "application" | "manual" | "course_registration" | "course_purchase" | "bootcamp_registration" | "exam_booking"
        conversion_value: number | null
        currency: string | null
        external_reference: string | null
        metadata: Json
        converted_at: string
        created_at: string
      }>
      api_keys: Table<{
        id: string
        organization_id: string
        name: string
        prefix: string
        key_hash: string
        scopes: string[]
        last_used_at: string | null
        expires_at: string | null
        revoked_at: string | null
        created_by: string | null
        created_at: string
      }>
      api_key_requests: Table<{
        id: number
        api_key_id: string
        created_at: string
      }>
      report_rules: Table<{
        id: string
        organization_id: string
        scorecard_id: string
        scoring_category_id: string | null
        operator: "lt" | "lte" | "gte"
        threshold: number
        message: string
        created_at: string
      }>
      assessment_reports: Table<{
        id: string
        organization_id: string
        assessment_result_id: string
        session_id: string
        lead_id: string | null
        scorecard_id: string | null
        report_type: "participant" | "admin"
        status: "pending" | "generating" | "ready" | "failed"
        version: number
        snapshot: Json
        ai_status: "not_requested" | "pending" | "completed" | "failed"
        ai_provider: string | null
        ai_model: string | null
        ai_prompt_version: string | null
        ai_output: Json | null
        storage_path: string | null
        download_count: number
        generated_at: string | null
        created_at: string
        updated_at: string
      }>
      report_shares: Table<{
        id: string
        organization_id: string
        report_id: string
        token_hash: string
        expires_at: string
        revoked_at: string | null
        created_at: string
      }>
      report_events: Table<{
        id: string
        organization_id: string
        report_id: string | null
        event_type: string
        created_at: string
      }>
      report_jobs: Table<{
        id: string
        organization_id: string
        report_id: string
        kind: "pdf" | "ai" | "email"
        status: "pending" | "processing" | "completed" | "failed" | "dead"
        attempts: number
        next_run_at: string
        locked_at: string | null
        last_error: string | null
        payload: Json
        created_at: string
      }>
      subscriptions: Table<{
        id: string
        organization_id: string
        provider: "stripe" | "internal" | "manual"
        provider_customer_id: string | null
        provider_subscription_id: string | null
        plan: string
        billing_interval: "monthly" | "yearly"
        status: string
        current_period_start: string | null
        current_period_end: string | null
        cancel_at_period_end: boolean
        trial_end: string | null
        past_due_at: string | null
        created_at: string
        updated_at: string
      }>
      usage_counters: Table<{
        organization_id: string
        metric: string
        period_start: string
        period_end: string
        value: number
        updated_at: string
      }>
      organization_entitlements: Table<{
        id: string
        organization_id: string
        feature: string
        enabled: boolean
        limit_override: number | null
        created_at: string
      }>
      organization_invitations: Table<{
        id: string
        organization_id: string
        email: string
        role: string
        token_hash: string
        expires_at: string
        invited_by: string | null
        accepted_at: string | null
        created_at: string
      }>
      custom_domains: Table<{
        id: string
        organization_id: string
        domain: string
        status: "pending" | "verified" | "failed" | "disabled"
        verification_token: string
        verified_at: string | null
        default_scorecard_id: string | null
        ssl_status: "provisioning" | "active" | "error" | null
        created_at: string
      }>
      email_jobs: Table<{
        id: string
        organization_id: string | null
        template: string
        recipient_hash: string
        recipient: string
        locale: string
        payload: Json
        idempotency_key: string
        status: "pending" | "processing" | "sent" | "failed" | "dead"
        attempts: number
        next_run_at: string
        last_error: string | null
        provider_message_id: string | null
        sent_at: string | null
        created_at: string
      }>
      rate_limits: Table<{
        bucket: string
        window_start: string
        hits: number
      }>
      platform_settings: Table<{
        id: number
        maintenance_message: string | null
        updated_at: string
      }>
      stripe_events: Table<{
        event_id: string
        event_type: string
        processed_at: string
      }>
      audit_logs: Table<{
        id: string
        organization_id: string
        actor_id: string | null
        action: string
        metadata: Json
        created_at: string
      }>
      platform_admins: Table<{
        user_id: string
        role: "super_admin" | "support" | "operations" | "finance"
        created_at: string
      }>
      support_sessions: Table<{
        id: string
        platform_admin_id: string
        organization_id: string
        reason: string
        status: "active" | "ended" | "expired"
        started_at: string
        expires_at: string
        ended_at: string | null
      }>
      system_heartbeats: Table<{
        name: string
        last_seen_at: string
        status: string
        metadata: Json
      }>
      organization_suspensions: Table<{
        id: string
        organization_id: string
        reason: string
        created_by: string
        created_at: string
        lifted_at: string | null
        lifted_by: string | null
      }>
      platform_alerts: Table<{
        id: string
        code: string
        message: string
        created_at: string
        resolved_at: string | null
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
          p_matched_range_id?: string | null
          p_triggered_rules?: Json
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
      claim_report_jobs: {
        Args: { p_limit: number }
        Returns: {
          id: string
          organization_id: string
          report_id: string
          kind: "pdf" | "ai" | "email"
          status: "pending" | "processing" | "completed" | "failed" | "dead"
          attempts: number
          next_run_at: string
          locked_at: string | null
          last_error: string | null
          payload: Json
          created_at: string
        }[]
      }
      create_organization: {
        Args: { p_name: string; p_slug: string; p_use_case: string; p_trial_days: number }
        Returns: string
      }
      accept_organization_invitation: {
        Args: { p_token_hash: string; p_member_limit: number | null }
        Returns: string
      }
      transfer_organization_ownership: {
        Args: { p_target: string }
        Returns: undefined
      }
      platform_overview: {
        Args: Record<string, never>
        Returns: Json
      }
      resolve_verified_domain: {
        Args: { p_host: string }
        Returns: Json
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_window_seconds: number; p_limit: number }
        Returns: boolean
      }
      consume_usage: {
        Args: { p_org: string; p_metric: string; p_limit: number | null; p_period_start: string; p_period_end: string }
        Returns: number
      }
      import_questionnaire: {
        Args: {
          p_scorecard_id: string
          p_mode: string
          p_source: string
          p_filename: string
          p_payload: Json
        }
        Returns: Json
      }
      claim_integration_jobs: {
        Args: { p_limit: number }
        Returns: {
          id: string
          organization_id: string
          delivery_id: string | null
          kind: string
          payload: Json
          status: "pending" | "processing" | "completed" | "failed"
          attempts: number
          next_run_at: string
          locked_at: string | null
          last_error: string | null
          created_at: string
        }[]
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
