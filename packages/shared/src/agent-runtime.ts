import type { AgentKey } from './agents.js';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentTaskStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type AgentTaskType =
  | 'create_customer_note'
  | 'update_job_status'
  | 'send_whatsapp_draft'
  | 'create_candidate'
  | 'update_candidate_status'
  | 'draft_job_ad'
  | 'draft_interview_questions'
  | 'store_memory'
  | 'draft_hiring_recommendation'
  | 'draft_sales_follow_up'
  | 'draft_quote_recommendation'
  | 'draft_marketing_campaign'
  | 'draft_marketing_content'
  | 'draft_lead_follow_up'
  | 'draft_lead_handoff'
  | 'draft_follow_up_from_call'
  | 'draft_appointment_request_from_call'
  | 'draft_lead_from_call'
  | 'draft_customer_note_from_call'
  | 'draft_customer_response'
  | 'draft_appointment_update'
  | 'draft_invoice_explanation'
  | 'draft_service_information_response'
  | 'draft_recruitment_action'
  | 'draft_candidate_communication'
  | 'draft_interview_request'
  | 'draft_training_plan'
  | 'draft_purchase_order'
  | 'draft_executive_action'
  | 'draft_finance_action'
  | 'draft_knowledge_article'
  | 'draft_business_report'
  | 'draft_workflow'
  | 'draft_integration_action'
  | 'draft_customer_request'
  | 'draft_mobile_request'
  | 'draft_quality_action'
  | 'draft_quality_review'
  | 'draft_payroll_recommendation'
  | 'draft_customer_reply'
  | 'draft_follow_up'
  | 'draft_maintenance_action'
  | 'draft_asset_replacement'
  | 'draft_prompt_update'
  | 'draft_provider_configuration'
  | 'draft_dispatch_action'
  | 'draft_callback_action'
  | 'draft_fleet_action'
  | 'draft_vehicle_replacement'
  | 'draft_business_action'
  | 'draft_security_action'
  | 'draft_integration_repair'
  | 'draft_strategic_report'
  | 'draft_workflow_improvement'
  | 'draft_decision_report'
  | 'draft_knowledge_report'
  | 'draft_executive_briefing'
  | 'draft_evolution_report'
  | 'draft_optimization_plan'
  | 'draft_developer_guide'
  | 'draft_integration_guide'
  | 'draft_saas_onboarding_guide'
  | 'draft_tenant_report'
  | 'draft_plan_recommendation'
  | 'draft_recovery_plan'
  | 'draft_maintenance_plan'
  | 'draft_operational_report'
  | 'draft_incident_summary'
  | 'draft_scaling_recommendation'
  | 'draft_mobile_report'
  | 'draft_mobile_quotation'
  | 'draft_mobile_maintenance_note'
  | 'draft_mobile_troubleshooting_guide'
  | 'draft_communications_reply'
  | 'draft_communications_sms'
  | 'draft_communications_whatsapp'
  | 'draft_communications_email'
  | 'draft_call_summary'
  | 'draft_follow_up_task'
  | 'draft_appointment_confirmation'
  | 'draft_customer_update'
  | 'draft_cx_support_request'
  | 'draft_cx_appointment_request'
  | 'draft_cx_document_request'
  | 'draft_asset_maintenance_plan'
  | 'draft_asset_report'
  | 'draft_asset_customer_explanation'
  | 'draft_asset_work_order'
  | 'draft_asset_disposal_request'
  | 'draft_workforce_onboarding_plan'
  | 'draft_workforce_development_plan'
  | 'draft_workforce_performance_report'
  | 'draft_workforce_hr_communication'
  | 'draft_workforce_payroll_exception_summary'
  | 'draft_workforce_offboarding_checklist'
  | 'draft_workforce_training_recommendation'
  | 'draft_workforce_technician_match'
  | 'draft_legal_contract_summary'
  | 'draft_legal_policy_document'
  | 'draft_legal_compliance_report'
  | 'draft_legal_risk_report'
  | 'draft_legal_matter_summary'
  | 'draft_legal_customer_notice'
  | 'draft_legal_supplier_notice'
  | 'draft_legal_internal_communication'
  | 'draft_fp_cash_flow_report'
  | 'draft_fp_budget_commentary'
  | 'draft_fp_forecast_commentary'
  | 'draft_fp_profitability_report'
  | 'draft_fp_payment_plan_proposal'
  | 'draft_fp_supplier_payment_recommendation'
  | 'draft_fp_executive_financial_summary'
  | 'draft_fp_variance_analysis'
  | 'draft_si_lead_reply'
  | 'draft_si_follow_up'
  | 'draft_si_proposal'
  | 'draft_si_quote_commentary'
  | 'draft_si_renewal_message'
  | 'draft_si_account_plan'
  | 'draft_si_sales_report'
  | 'draft_si_tender_response'
  | 'draft_si_executive_revenue_summary'
  | 'draft_mi_strategy'
  | 'draft_mi_campaign_plan'
  | 'draft_mi_social_post'
  | 'draft_mi_email_campaign'
  | 'draft_mi_sms_campaign'
  | 'draft_mi_whatsapp_campaign'
  | 'draft_mi_ad_copy'
  | 'draft_mi_video_script'
  | 'draft_mi_landing_page'
  | 'draft_mi_blog_content'
  | 'draft_mi_review_response'
  | 'draft_mi_campaign_report'
  | 'draft_mi_executive_marketing_summary'
  | 'draft_sd_quality_report'
  | 'draft_sd_corrective_action'
  | 'draft_sd_customer_summary'
  | 'draft_sd_sla_report'
  | 'draft_sd_inspection_summary'
  | 'draft_sd_warranty_report'
  | 'draft_sd_callback_analysis'
  | 'draft_sd_continuous_improvement_plan'
  | 'draft_sd_executive_service_summary'
  | 'draft_ito_fix'
  | 'draft_ito_postmortem'
  | 'draft_ito_release_notes'
  | 'draft_ito_infrastructure_report'
  | 'draft_ito_health_summary'
  | 'draft_ito_incident_report'
  | 'draft_ito_change_plan'
  | 'draft_ito_runbook'
  | 'draft_ito_rca_report'
  | 'draft_bev_experiment_plan'
  | 'draft_bev_improvement_plan'
  | 'draft_bev_maturity_assessment'
  | 'draft_bev_benefit_report'
  | 'draft_bev_lessons_learned'
  | 'draft_bev_executive_summary'
  | 'draft_bev_hypothesis'
  | 'draft_bev_process_report'
  | 'draft_bev_agent_improvement'
  | 'draft_ab_implementation_plan'
  | 'draft_ab_requirements_spec'
  | 'draft_ab_architecture_impact_report'
  | 'draft_ab_code_generation_plan'
  | 'draft_ab_test_plan'
  | 'draft_ab_deployment_plan'
  | 'draft_ab_documentation_update'
  | 'draft_ab_feature_changelog'
  | 'draft_ab_rollback_plan'
  | 'draft_ip_job_template'
  | 'draft_ip_compliance_document'
  | 'draft_ip_industry_report'
  | 'draft_ip_workflow'
  | 'draft_ip_checklist'
  | 'draft_ip_certificate_template'
  | 'draft_ip_quote_template'
  | 'draft_ip_knowledge_article'
  | 'draft_ip_improvement_plan'
  | 'draft_pdp_integration_guide'
  | 'draft_pdp_webhook_config'
  | 'draft_pdp_api_example'
  | 'draft_pdp_sdk_example'
  | 'draft_pdp_diagnostic_report'
  | 'draft_sm_subscription_report'
  | 'draft_sm_billing_summary'
  | 'draft_sm_usage_report'
  | 'draft_sm_renewal_forecast'
  | 'draft_sm_plan_recommendation'
  | 'draft_vr_call_summary'
  | 'draft_vr_follow_up_tasks'
  | 'draft_vr_crm_note'
  | 'draft_vr_job_note'
  | 'draft_vr_callback_request'
  | 'draft_vr_lead_creation'
  | 'draft_vr_appointment_booking'
  | 'draft_vr_routing_recommendation'
  | 'draft_dip_extraction_correction'
  | 'draft_dip_document_summary'
  | 'draft_dip_workflow_action'
  | 'draft_dip_compliance_suggestion'
  | 'draft_dip_supplier_invoice'
  | 'draft_dip_inventory_receipt'
  | 'draft_dip_compliance_record'
  | 'draft_dip_asset_update'
  | 'draft_dip_warranty_registration'
  | 'draft_dip_follow_up_task'
  | 'draft_bc_recovery_plan'
  | 'draft_bc_verification_report'
  | 'draft_bc_continuity_improvement'
  | 'draft_bc_recovery_test_schedule'
  | 'draft_bc_restore_request'
  | 'draft_gs_search_report'
  | 'draft_gs_activity_summary'
  | 'draft_gs_related_record_recommendation'
  | 'draft_dm_mapping_suggestion'
  | 'draft_dm_validation_correction'
  | 'draft_dm_migration_report'
  | 'draft_dm_cleanup_recommendation'
  | 'draft_nc_template'
  | 'draft_nc_escalation_rule'
  | 'draft_nc_delivery_report'
  | 'draft_nc_improvement_recommendation'
  | 'draft_ph_incident_report'
  | 'draft_ph_optimization_recommendation'
  | 'draft_ph_capacity_forecast'
  | 'draft_ph_diagnostic_summary'
  | 'draft_lnc_readiness_report'
  | 'draft_lnc_deployment_plan'
  | 'draft_lnc_rollout_checklist'
  | 'draft_lnc_rollback_recommendation'
  | 'draft_rc_release_notes'
  | 'draft_rc_optimization_plan'
  | 'draft_rc_deployment_recommendation'
  | 'draft_pl_deployment_plan'
  | 'draft_pl_launch_report'
  | 'draft_pl_post_launch_checklist'
  | 'draft_rlm_release_notes'
  | 'draft_rlm_user_documentation'
  | 'draft_rlm_admin_documentation'
  | 'draft_rlm_post_launch_recommendations';

export const AGENT_RUN_STATUS_OPTIONS: Array<{ value: AgentRunStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export const AGENT_TASK_STATUS_OPTIONS: Array<{ value: AgentTaskStatus; label: string }> = [
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executed', label: 'Executed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const AGENT_TASK_TYPE_OPTIONS: Array<{ value: AgentTaskType; label: string }> = [
  { value: 'create_customer_note', label: 'Create Customer Note' },
  { value: 'update_job_status', label: 'Update Job Status' },
  { value: 'send_whatsapp_draft', label: 'Send WhatsApp Draft' },
  { value: 'create_candidate', label: 'Create Candidate' },
  { value: 'update_candidate_status', label: 'Update Candidate Status' },
  { value: 'draft_job_ad', label: 'Draft Job Advert' },
  { value: 'draft_interview_questions', label: 'Draft Interview Questions' },
  { value: 'store_memory', label: 'Store Company Memory' },
  { value: 'draft_hiring_recommendation', label: 'Draft Hiring Recommendation' },
  { value: 'draft_sales_follow_up', label: 'Draft Sales Follow-Up' },
  { value: 'draft_quote_recommendation', label: 'Draft Quote Recommendation' },
  { value: 'draft_marketing_campaign', label: 'Draft Marketing Campaign' },
  { value: 'draft_marketing_content', label: 'Draft Marketing Content' },
  { value: 'draft_lead_follow_up', label: 'Draft Lead Follow-Up' },
  { value: 'draft_lead_handoff', label: 'Draft Sales Handoff' },
  { value: 'draft_follow_up_from_call', label: 'Draft Follow-Up From Call' },
  { value: 'draft_appointment_request_from_call', label: 'Draft Appointment Request From Call' },
  { value: 'draft_lead_from_call', label: 'Draft Lead From Call' },
  { value: 'draft_customer_note_from_call', label: 'Draft Customer Note From Call' },
  { value: 'draft_customer_response', label: 'Draft Customer Response' },
  { value: 'draft_appointment_update', label: 'Draft Appointment Update' },
  { value: 'draft_invoice_explanation', label: 'Draft Invoice Explanation' },
  { value: 'draft_service_information_response', label: 'Draft Service Information Response' },
  { value: 'draft_recruitment_action', label: 'Draft Recruitment Action' },
  { value: 'draft_candidate_communication', label: 'Draft Candidate Communication' },
  { value: 'draft_interview_request', label: 'Draft Interview Request' },
  { value: 'draft_training_plan', label: 'Draft Training Plan' },
  { value: 'draft_purchase_order', label: 'Draft Purchase Order' },
  { value: 'draft_executive_action', label: 'Draft Executive Action' },
  { value: 'draft_finance_action', label: 'Draft Finance Action' },
  { value: 'draft_knowledge_article', label: 'Draft Knowledge Article' },
  { value: 'draft_business_report', label: 'Draft Business Report' },
  { value: 'draft_workflow', label: 'Draft Workflow' },
  { value: 'draft_integration_action', label: 'Draft Integration Action' },
  { value: 'draft_customer_request', label: 'Draft Customer Request' },
  { value: 'draft_mobile_request', label: 'Draft Mobile Workforce Request' },
  { value: 'draft_quality_action', label: 'Draft Quality Action' },
  { value: 'draft_quality_review', label: 'Draft Quality Review' },
  { value: 'draft_payroll_recommendation', label: 'Draft Payroll Recommendation' },
  { value: 'draft_customer_reply', label: 'Draft Customer Reply' },
  { value: 'draft_follow_up', label: 'Draft Follow-Up' },
  { value: 'draft_maintenance_action', label: 'Draft Maintenance Action' },
  { value: 'draft_asset_replacement', label: 'Draft Asset Replacement' },
  { value: 'draft_prompt_update', label: 'Draft Prompt Update' },
  { value: 'draft_provider_configuration', label: 'Draft Provider Configuration' },
  { value: 'draft_dispatch_action', label: 'Draft Dispatch Action' },
  { value: 'draft_callback_action', label: 'Draft Callback Action' },
  { value: 'draft_fleet_action', label: 'Draft Fleet Action' },
  { value: 'draft_vehicle_replacement', label: 'Draft Vehicle Replacement' },
  { value: 'draft_business_action', label: 'Draft Business Action' },
  { value: 'draft_security_action', label: 'Draft Security Action' },
  { value: 'draft_integration_repair', label: 'Draft Integration Repair' },
  { value: 'draft_strategic_report', label: 'Draft Strategic Report' },
  { value: 'draft_workflow_improvement', label: 'Draft Workflow Improvement' },
  { value: 'draft_decision_report', label: 'Draft Decision Report' },
  { value: 'draft_knowledge_report', label: 'Draft Knowledge Report' },
  { value: 'draft_executive_briefing', label: 'Draft Executive Briefing' },
  { value: 'draft_evolution_report', label: 'Draft Evolution Report' },
  { value: 'draft_optimization_plan', label: 'Draft Optimization Plan' },
  { value: 'draft_developer_guide', label: 'Draft Developer Guide' },
  { value: 'draft_integration_guide', label: 'Draft Integration Guide' },
  { value: 'draft_saas_onboarding_guide', label: 'Draft SaaS Onboarding Guide' },
  { value: 'draft_tenant_report', label: 'Draft Tenant Report' },
  { value: 'draft_plan_recommendation', label: 'Draft Plan Recommendation' },
  { value: 'draft_recovery_plan', label: 'Draft Recovery Plan' },
  { value: 'draft_maintenance_plan', label: 'Draft Maintenance Plan' },
  { value: 'draft_operational_report', label: 'Draft Operational Report' },
  { value: 'draft_incident_summary', label: 'Draft Incident Summary' },
  { value: 'draft_scaling_recommendation', label: 'Draft Scaling Recommendation' },
  { value: 'draft_mobile_report', label: 'Draft Mobile Report' },
  { value: 'draft_mobile_quotation', label: 'Draft Mobile Quotation' },
  { value: 'draft_mobile_maintenance_note', label: 'Draft Mobile Maintenance Note' },
  { value: 'draft_mobile_troubleshooting_guide', label: 'Draft Mobile Troubleshooting Guide' },
  { value: 'draft_communications_reply', label: 'Draft Communications Reply' },
  { value: 'draft_communications_sms', label: 'Draft SMS Message' },
  { value: 'draft_communications_whatsapp', label: 'Draft WhatsApp Message' },
  { value: 'draft_communications_email', label: 'Draft Email' },
  { value: 'draft_call_summary', label: 'Draft Call Summary' },
  { value: 'draft_follow_up_task', label: 'Draft Follow-Up Task' },
  { value: 'draft_appointment_confirmation', label: 'Draft Appointment Confirmation' },
  { value: 'draft_customer_update', label: 'Draft Customer Update' },
  { value: 'draft_cx_support_request', label: 'Draft CX Support Request' },
  { value: 'draft_cx_appointment_request', label: 'Draft CX Appointment Request' },
  { value: 'draft_cx_document_request', label: 'Draft CX Document Request' },
  { value: 'draft_asset_maintenance_plan', label: 'Draft Asset Maintenance Plan' },
  { value: 'draft_asset_report', label: 'Draft Asset Report' },
  { value: 'draft_asset_customer_explanation', label: 'Draft Asset Customer Explanation' },
  { value: 'draft_asset_work_order', label: 'Draft Asset Work Order' },
  { value: 'draft_asset_disposal_request', label: 'Draft Asset Disposal Request' },
  { value: 'draft_workforce_onboarding_plan', label: 'Draft Workforce Onboarding Plan' },
  { value: 'draft_workforce_development_plan', label: 'Draft Workforce Development Plan' },
  { value: 'draft_workforce_performance_report', label: 'Draft Workforce Performance Report' },
  { value: 'draft_workforce_hr_communication', label: 'Draft HR Communication' },
  { value: 'draft_workforce_payroll_exception_summary', label: 'Draft Payroll Exception Summary' },
  { value: 'draft_workforce_offboarding_checklist', label: 'Draft Offboarding Checklist' },
  { value: 'draft_workforce_training_recommendation', label: 'Draft Training Recommendation' },
  { value: 'draft_workforce_technician_match', label: 'Draft Technician Match Recommendation' },
  { value: 'draft_legal_contract_summary', label: 'Draft Legal Contract Summary' },
  { value: 'draft_legal_policy_document', label: 'Draft Legal Policy Document' },
  { value: 'draft_legal_compliance_report', label: 'Draft Legal Compliance Report' },
  { value: 'draft_legal_risk_report', label: 'Draft Legal Risk Report' },
  { value: 'draft_legal_matter_summary', label: 'Draft Legal Matter Summary' },
  { value: 'draft_legal_customer_notice', label: 'Draft Legal Customer Notice' },
  { value: 'draft_legal_supplier_notice', label: 'Draft Legal Supplier Notice' },
  { value: 'draft_legal_internal_communication', label: 'Draft Legal Internal Communication' },
  { value: 'draft_fp_cash_flow_report', label: 'Draft Cash Flow Report' },
  { value: 'draft_fp_budget_commentary', label: 'Draft Budget Commentary' },
  { value: 'draft_fp_forecast_commentary', label: 'Draft Forecast Commentary' },
  { value: 'draft_fp_profitability_report', label: 'Draft Profitability Report' },
  { value: 'draft_fp_payment_plan_proposal', label: 'Draft Payment Plan Proposal' },
  {
    value: 'draft_fp_supplier_payment_recommendation',
    label: 'Draft Supplier Payment Recommendation',
  },
  { value: 'draft_fp_executive_financial_summary', label: 'Draft Executive Financial Summary' },
  { value: 'draft_fp_variance_analysis', label: 'Draft Variance Analysis' },
  { value: 'draft_si_lead_reply', label: 'Draft Lead Reply' },
  { value: 'draft_si_follow_up', label: 'Draft Sales Follow-Up' },
  { value: 'draft_si_proposal', label: 'Draft Sales Proposal' },
  { value: 'draft_si_quote_commentary', label: 'Draft Quote Commentary' },
  { value: 'draft_si_renewal_message', label: 'Draft Renewal Message' },
  { value: 'draft_si_account_plan', label: 'Draft Account Plan' },
  { value: 'draft_si_sales_report', label: 'Draft Sales Report' },
  { value: 'draft_si_tender_response', label: 'Draft Tender Response' },
  { value: 'draft_si_executive_revenue_summary', label: 'Draft Executive Revenue Summary' },
  { value: 'draft_mi_strategy', label: 'Draft Marketing Strategy' },
  { value: 'draft_mi_campaign_plan', label: 'Draft Campaign Plan' },
  { value: 'draft_mi_social_post', label: 'Draft Social Post' },
  { value: 'draft_mi_email_campaign', label: 'Draft Email Campaign' },
  { value: 'draft_mi_sms_campaign', label: 'Draft SMS Campaign' },
  { value: 'draft_mi_whatsapp_campaign', label: 'Draft WhatsApp Campaign' },
  { value: 'draft_mi_ad_copy', label: 'Draft Ad Copy' },
  { value: 'draft_mi_video_script', label: 'Draft Video Script' },
  { value: 'draft_mi_landing_page', label: 'Draft Landing Page Copy' },
  { value: 'draft_mi_blog_content', label: 'Draft Blog Content' },
  { value: 'draft_mi_review_response', label: 'Draft Review Response' },
  { value: 'draft_mi_campaign_report', label: 'Draft Campaign Report' },
  { value: 'draft_mi_executive_marketing_summary', label: 'Draft Executive Marketing Summary' },
  { value: 'draft_sd_quality_report', label: 'Draft Quality Report' },
  { value: 'draft_sd_corrective_action', label: 'Draft Corrective Action' },
  { value: 'draft_sd_customer_summary', label: 'Draft Customer Summary' },
  { value: 'draft_sd_sla_report', label: 'Draft SLA Report' },
  { value: 'draft_sd_inspection_summary', label: 'Draft Inspection Summary' },
  { value: 'draft_sd_warranty_report', label: 'Draft Warranty Report' },
  { value: 'draft_sd_callback_analysis', label: 'Draft Callback Analysis' },
  { value: 'draft_sd_continuous_improvement_plan', label: 'Draft Continuous Improvement Plan' },
  { value: 'draft_sd_executive_service_summary', label: 'Draft Executive Service Summary' },
  { value: 'draft_ito_fix', label: 'Draft IT Fix Plan' },
  { value: 'draft_ito_postmortem', label: 'Draft Postmortem' },
  { value: 'draft_ito_release_notes', label: 'Draft Release Notes' },
  { value: 'draft_ito_infrastructure_report', label: 'Draft Infrastructure Report' },
  { value: 'draft_ito_health_summary', label: 'Draft Health Summary' },
  { value: 'draft_ito_incident_report', label: 'Draft Incident Report' },
  { value: 'draft_ito_change_plan', label: 'Draft Change Plan' },
  { value: 'draft_ito_runbook', label: 'Draft Runbook' },
  { value: 'draft_ito_rca_report', label: 'Draft RCA Report' },
  { value: 'draft_bev_experiment_plan', label: 'Draft Experiment Plan' },
  { value: 'draft_bev_improvement_plan', label: 'Draft Improvement Plan' },
  { value: 'draft_bev_maturity_assessment', label: 'Draft Maturity Assessment' },
  { value: 'draft_bev_benefit_report', label: 'Draft Benefit Report' },
  { value: 'draft_bev_lessons_learned', label: 'Draft Lessons Learned' },
  { value: 'draft_bev_executive_summary', label: 'Draft Executive Evolution Summary' },
  { value: 'draft_bev_hypothesis', label: 'Draft Business Hypothesis' },
  { value: 'draft_bev_process_report', label: 'Draft Process Report' },
  { value: 'draft_bev_agent_improvement', label: 'Draft Agent Improvement Plan' },
  { value: 'draft_ab_implementation_plan', label: 'Draft Implementation Plan' },
  { value: 'draft_ab_requirements_spec', label: 'Draft Requirements Specification' },
  { value: 'draft_ab_architecture_impact_report', label: 'Draft Architecture Impact Report' },
  { value: 'draft_ab_code_generation_plan', label: 'Draft Code Generation Plan' },
  { value: 'draft_ab_test_plan', label: 'Draft Test Plan' },
  { value: 'draft_ab_deployment_plan', label: 'Draft Deployment Plan' },
  { value: 'draft_ab_documentation_update', label: 'Draft Documentation Update' },
  { value: 'draft_ab_feature_changelog', label: 'Draft Feature Changelog' },
  { value: 'draft_ab_rollback_plan', label: 'Draft Rollback Plan' },
  { value: 'draft_ip_job_template', label: 'Draft Job Template' },
  { value: 'draft_ip_compliance_document', label: 'Draft Compliance Document' },
  { value: 'draft_ip_industry_report', label: 'Draft Industry Report' },
  { value: 'draft_ip_workflow', label: 'Draft Industry Workflow' },
  { value: 'draft_ip_checklist', label: 'Draft Checklist' },
  { value: 'draft_ip_certificate_template', label: 'Draft Certificate Template' },
  { value: 'draft_ip_quote_template', label: 'Draft Quote Template' },
  { value: 'draft_ip_knowledge_article', label: 'Draft Knowledge Article' },
  { value: 'draft_ip_improvement_plan', label: 'Draft Improvement Plan' },
  { value: 'draft_pdp_integration_guide', label: 'Draft Integration Guide' },
  { value: 'draft_pdp_webhook_config', label: 'Draft Webhook Config' },
  { value: 'draft_pdp_api_example', label: 'Draft API Example' },
  { value: 'draft_pdp_sdk_example', label: 'Draft SDK Example' },
  { value: 'draft_pdp_diagnostic_report', label: 'Draft Diagnostic Report' },
  { value: 'draft_sm_subscription_report', label: 'Draft Subscription Report' },
  { value: 'draft_sm_billing_summary', label: 'Draft Billing Summary' },
  { value: 'draft_sm_usage_report', label: 'Draft Usage Report' },
  { value: 'draft_sm_renewal_forecast', label: 'Draft Renewal Forecast' },
  { value: 'draft_sm_plan_recommendation', label: 'Draft Plan Recommendation' },
  { value: 'draft_vr_call_summary', label: 'Draft Call Summary' },
  { value: 'draft_vr_follow_up_tasks', label: 'Draft Follow-Up Tasks' },
  { value: 'draft_vr_crm_note', label: 'Draft CRM Note' },
  { value: 'draft_vr_job_note', label: 'Draft Job Note' },
  { value: 'draft_vr_callback_request', label: 'Draft Callback Request' },
  { value: 'draft_vr_lead_creation', label: 'Draft Lead Creation' },
  { value: 'draft_vr_appointment_booking', label: 'Draft Appointment Booking' },
  { value: 'draft_vr_routing_recommendation', label: 'Draft Routing Recommendation' },
  { value: 'draft_dip_extraction_correction', label: 'Draft Extraction Correction' },
  { value: 'draft_dip_document_summary', label: 'Draft Document Summary' },
  { value: 'draft_dip_workflow_action', label: 'Draft Workflow Action' },
  { value: 'draft_dip_compliance_suggestion', label: 'Draft Compliance Suggestion' },
  { value: 'draft_dip_supplier_invoice', label: 'Draft Supplier Invoice' },
  { value: 'draft_dip_inventory_receipt', label: 'Draft Inventory Receipt' },
  { value: 'draft_dip_compliance_record', label: 'Draft Compliance Record' },
  { value: 'draft_dip_asset_update', label: 'Draft Asset Update' },
  { value: 'draft_dip_warranty_registration', label: 'Draft Warranty Registration' },
  { value: 'draft_dip_follow_up_task', label: 'Draft Follow-Up Task' },
  { value: 'draft_bc_recovery_plan', label: 'Draft Recovery Plan' },
  { value: 'draft_bc_verification_report', label: 'Draft Verification Report' },
  { value: 'draft_bc_continuity_improvement', label: 'Draft Continuity Improvement' },
  { value: 'draft_bc_recovery_test_schedule', label: 'Draft Recovery Test Schedule' },
  { value: 'draft_bc_restore_request', label: 'Draft Restore Request' },
  { value: 'draft_gs_search_report', label: 'Draft Search Report' },
  { value: 'draft_gs_activity_summary', label: 'Draft Activity Summary' },
  { value: 'draft_gs_related_record_recommendation', label: 'Draft Related Record Recommendation' },
  { value: 'draft_dm_mapping_suggestion', label: 'Draft Mapping Suggestion' },
  { value: 'draft_dm_validation_correction', label: 'Draft Validation Correction' },
  { value: 'draft_dm_migration_report', label: 'Draft Migration Report' },
  { value: 'draft_dm_cleanup_recommendation', label: 'Draft Cleanup Recommendation' },
  { value: 'draft_nc_template', label: 'Draft Notification Template' },
  { value: 'draft_nc_escalation_rule', label: 'Draft Escalation Rule' },
  { value: 'draft_nc_delivery_report', label: 'Draft Delivery Report' },
  { value: 'draft_nc_improvement_recommendation', label: 'Draft Improvement Recommendation' },
  { value: 'draft_ph_incident_report', label: 'Draft Incident Report' },
  { value: 'draft_ph_optimization_recommendation', label: 'Draft Optimization Recommendation' },
  { value: 'draft_ph_capacity_forecast', label: 'Draft Capacity Forecast' },
  { value: 'draft_ph_diagnostic_summary', label: 'Draft Diagnostic Summary' },
  { value: 'draft_lnc_readiness_report', label: 'Draft Readiness Report' },
  { value: 'draft_lnc_deployment_plan', label: 'Draft Deployment Plan' },
  { value: 'draft_lnc_rollout_checklist', label: 'Draft Rollout Checklist' },
  { value: 'draft_lnc_rollback_recommendation', label: 'Draft Rollback Recommendation' },
  { value: 'draft_rc_release_notes', label: 'Draft Release Notes' },
  { value: 'draft_rc_optimization_plan', label: 'Draft Optimization Plan' },
  { value: 'draft_rc_deployment_recommendation', label: 'Draft Deployment Recommendation' },
  { value: 'draft_pl_deployment_plan', label: 'Draft Deployment Plan' },
  { value: 'draft_pl_launch_report', label: 'Draft Launch Report' },
  { value: 'draft_pl_post_launch_checklist', label: 'Draft Post-Launch Checklist' },
  { value: 'draft_rlm_release_notes', label: 'Draft Release Notes' },
  { value: 'draft_rlm_user_documentation', label: 'Draft User Documentation' },
  { value: 'draft_rlm_admin_documentation', label: 'Draft Administrator Documentation' },
  { value: 'draft_rlm_post_launch_recommendations', label: 'Draft Post-Launch Recommendations' },
];

export type AgentRunSummary = {
  id: string;
  agentProfileId: string | null;
  agentKey: AgentKey;
  agentName: string;
  userId: string;
  userName: string;
  request: string;
  response: string | null;
  toolsUsed: string[];
  status: AgentRunStatus;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  taskCount: number;
};

export type AgentRunDetail = AgentRunSummary & {
  tasks: AgentTaskSummary[];
};

export type AgentTaskSummary = {
  id: string;
  agentRunId: string | null;
  agentProfileId: string | null;
  agentKey: AgentKey;
  agentName: string;
  userId: string;
  userName: string;
  taskType: AgentTaskType;
  status: AgentTaskStatus;
  approvalRequired: boolean;
  preview: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunAgentRequest = {
  request: string;
  agentKey?: AgentKey;
  agentProfileId?: string;
  conversationId?: string;
  pageContext?: {
    customerId?: string;
    jobId?: string;
    vehicleId?: string;
    workflowId?: string;
    integrationProvider?: string;
    knowledgeQuery?: string;
    schedulingView?: boolean;
    contractId?: string;
    matterId?: string;
    leadId?: string;
  };
};

export type RunAgentResponse = {
  run: AgentRunDetail;
  assistantMessage: string;
  pendingTasks: AgentTaskSummary[];
};

export type UpdateAgentTaskRequest = {
  preview?: string;
  payload?: Record<string, unknown>;
};

export type AgentToolExecutionResult = {
  toolKey: string;
  success: boolean;
  summary: string;
  data?: Record<string, unknown>;
};
