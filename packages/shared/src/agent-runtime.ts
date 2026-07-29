import type { AgentKey } from './agents.js';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentTaskStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

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
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executed', label: 'Executed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const AGENT_TASK_TYPE_OPTIONS: Array<{ value: AgentTaskType; label: string }> = [
  { value: 'create_customer_note', label: 'Create customer note' },
  { value: 'update_job_status', label: 'Update job status' },
  { value: 'send_whatsapp_draft', label: 'Send WhatsApp draft' },
  { value: 'create_candidate', label: 'Create candidate' },
  { value: 'update_candidate_status', label: 'Update candidate status' },
  { value: 'draft_job_ad', label: 'Draft job advert' },
  { value: 'draft_interview_questions', label: 'Draft interview questions' },
  { value: 'store_memory', label: 'Store company memory' },
  { value: 'draft_hiring_recommendation', label: 'Draft hiring recommendation' },
  { value: 'draft_sales_follow_up', label: 'Draft sales follow-up' },
  { value: 'draft_quote_recommendation', label: 'Draft quote recommendation' },
  { value: 'draft_marketing_campaign', label: 'Draft marketing campaign' },
  { value: 'draft_marketing_content', label: 'Draft marketing content' },
  { value: 'draft_lead_follow_up', label: 'Draft lead follow-up' },
  { value: 'draft_lead_handoff', label: 'Draft sales handoff' },
  { value: 'draft_follow_up_from_call', label: 'Draft follow-up from call' },
  { value: 'draft_appointment_request_from_call', label: 'Draft appointment request from call' },
  { value: 'draft_lead_from_call', label: 'Draft lead from call' },
  { value: 'draft_customer_note_from_call', label: 'Draft customer note from call' },
  { value: 'draft_customer_response', label: 'Draft customer response' },
  { value: 'draft_appointment_update', label: 'Draft appointment update' },
  { value: 'draft_invoice_explanation', label: 'Draft invoice explanation' },
  { value: 'draft_service_information_response', label: 'Draft service information response' },
  { value: 'draft_recruitment_action', label: 'Draft recruitment action' },
  { value: 'draft_candidate_communication', label: 'Draft candidate communication' },
  { value: 'draft_interview_request', label: 'Draft interview request' },
  { value: 'draft_training_plan', label: 'Draft training plan' },
  { value: 'draft_purchase_order', label: 'Draft purchase order' },
  { value: 'draft_executive_action', label: 'Draft executive action' },
  { value: 'draft_finance_action', label: 'Draft finance action' },
  { value: 'draft_knowledge_article', label: 'Draft knowledge article' },
  { value: 'draft_business_report', label: 'Draft business report' },
  { value: 'draft_workflow', label: 'Draft workflow' },
  { value: 'draft_integration_action', label: 'Draft integration action' },
  { value: 'draft_customer_request', label: 'Draft customer request' },
  { value: 'draft_mobile_request', label: 'Draft mobile workforce request' },
  { value: 'draft_quality_action', label: 'Draft quality action' },
  { value: 'draft_quality_review', label: 'Draft quality review' },
  { value: 'draft_payroll_recommendation', label: 'Draft payroll recommendation' },
  { value: 'draft_customer_reply', label: 'Draft customer reply' },
  { value: 'draft_follow_up', label: 'Draft follow-up' },
  { value: 'draft_maintenance_action', label: 'Draft maintenance action' },
  { value: 'draft_asset_replacement', label: 'Draft asset replacement' },
  { value: 'draft_prompt_update', label: 'Draft prompt update' },
  { value: 'draft_provider_configuration', label: 'Draft provider configuration' },
  { value: 'draft_dispatch_action', label: 'Draft dispatch action' },
  { value: 'draft_callback_action', label: 'Draft callback action' },
  { value: 'draft_fleet_action', label: 'Draft fleet action' },
  { value: 'draft_vehicle_replacement', label: 'Draft vehicle replacement' },
  { value: 'draft_business_action', label: 'Draft business action' },
  { value: 'draft_security_action', label: 'Draft security action' },
  { value: 'draft_integration_repair', label: 'Draft integration repair' },
  { value: 'draft_strategic_report', label: 'Draft strategic report' },
  { value: 'draft_workflow_improvement', label: 'Draft workflow improvement' },
  { value: 'draft_decision_report', label: 'Draft decision report' },
  { value: 'draft_knowledge_report', label: 'Draft knowledge report' },
  { value: 'draft_executive_briefing', label: 'Draft executive briefing' },
  { value: 'draft_evolution_report', label: 'Draft evolution report' },
  { value: 'draft_optimization_plan', label: 'Draft optimization plan' },
  { value: 'draft_developer_guide', label: 'Draft developer guide' },
  { value: 'draft_integration_guide', label: 'Draft integration guide' },
  { value: 'draft_saas_onboarding_guide', label: 'Draft SaaS onboarding guide' },
  { value: 'draft_tenant_report', label: 'Draft tenant report' },
  { value: 'draft_plan_recommendation', label: 'Draft plan recommendation' },
  { value: 'draft_recovery_plan', label: 'Draft recovery plan' },
  { value: 'draft_maintenance_plan', label: 'Draft maintenance plan' },
  { value: 'draft_operational_report', label: 'Draft operational report' },
  { value: 'draft_incident_summary', label: 'Draft incident summary' },
  { value: 'draft_scaling_recommendation', label: 'Draft scaling recommendation' },
  { value: 'draft_mobile_report', label: 'Draft mobile report' },
  { value: 'draft_mobile_quotation', label: 'Draft mobile quotation' },
  { value: 'draft_mobile_maintenance_note', label: 'Draft mobile maintenance note' },
  { value: 'draft_mobile_troubleshooting_guide', label: 'Draft mobile troubleshooting guide' },
  { value: 'draft_communications_reply', label: 'Draft communications reply' },
  { value: 'draft_communications_sms', label: 'Draft SMS message' },
  { value: 'draft_communications_whatsapp', label: 'Draft WhatsApp message' },
  { value: 'draft_communications_email', label: 'Draft email' },
  { value: 'draft_call_summary', label: 'Draft call summary' },
  { value: 'draft_follow_up_task', label: 'Draft follow-up task' },
  { value: 'draft_appointment_confirmation', label: 'Draft appointment confirmation' },
  { value: 'draft_customer_update', label: 'Draft customer update' },
  { value: 'draft_cx_support_request', label: 'Draft CX support request' },
  { value: 'draft_cx_appointment_request', label: 'Draft CX appointment request' },
  { value: 'draft_cx_document_request', label: 'Draft CX document request' },
  { value: 'draft_asset_maintenance_plan', label: 'Draft asset maintenance plan' },
  { value: 'draft_asset_report', label: 'Draft asset report' },
  { value: 'draft_asset_customer_explanation', label: 'Draft asset customer explanation' },
  { value: 'draft_asset_work_order', label: 'Draft asset work order' },
  { value: 'draft_asset_disposal_request', label: 'Draft asset disposal request' },
  { value: 'draft_workforce_onboarding_plan', label: 'Draft workforce onboarding plan' },
  { value: 'draft_workforce_development_plan', label: 'Draft workforce development plan' },
  { value: 'draft_workforce_performance_report', label: 'Draft workforce performance report' },
  { value: 'draft_workforce_hr_communication', label: 'Draft HR communication' },
  { value: 'draft_workforce_payroll_exception_summary', label: 'Draft payroll exception summary' },
  { value: 'draft_workforce_offboarding_checklist', label: 'Draft offboarding checklist' },
  { value: 'draft_workforce_training_recommendation', label: 'Draft training recommendation' },
  { value: 'draft_workforce_technician_match', label: 'Draft technician match recommendation' },
  { value: 'draft_legal_contract_summary', label: 'Draft legal contract summary' },
  { value: 'draft_legal_policy_document', label: 'Draft legal policy document' },
  { value: 'draft_legal_compliance_report', label: 'Draft legal compliance report' },
  { value: 'draft_legal_risk_report', label: 'Draft legal risk report' },
  { value: 'draft_legal_matter_summary', label: 'Draft legal matter summary' },
  { value: 'draft_legal_customer_notice', label: 'Draft legal customer notice' },
  { value: 'draft_legal_supplier_notice', label: 'Draft legal supplier notice' },
  { value: 'draft_legal_internal_communication', label: 'Draft legal internal communication' },
  { value: 'draft_fp_cash_flow_report', label: 'Draft cash flow report' },
  { value: 'draft_fp_budget_commentary', label: 'Draft budget commentary' },
  { value: 'draft_fp_forecast_commentary', label: 'Draft forecast commentary' },
  { value: 'draft_fp_profitability_report', label: 'Draft profitability report' },
  { value: 'draft_fp_payment_plan_proposal', label: 'Draft payment plan proposal' },
  { value: 'draft_fp_supplier_payment_recommendation', label: 'Draft supplier payment recommendation' },
  { value: 'draft_fp_executive_financial_summary', label: 'Draft executive financial summary' },
  { value: 'draft_fp_variance_analysis', label: 'Draft variance analysis' },
  { value: 'draft_si_lead_reply', label: 'Draft lead reply' },
  { value: 'draft_si_follow_up', label: 'Draft sales follow-up' },
  { value: 'draft_si_proposal', label: 'Draft sales proposal' },
  { value: 'draft_si_quote_commentary', label: 'Draft quote commentary' },
  { value: 'draft_si_renewal_message', label: 'Draft renewal message' },
  { value: 'draft_si_account_plan', label: 'Draft account plan' },
  { value: 'draft_si_sales_report', label: 'Draft sales report' },
  { value: 'draft_si_tender_response', label: 'Draft tender response' },
  { value: 'draft_si_executive_revenue_summary', label: 'Draft executive revenue summary' },
  { value: 'draft_mi_strategy', label: 'Draft marketing strategy' },
  { value: 'draft_mi_campaign_plan', label: 'Draft campaign plan' },
  { value: 'draft_mi_social_post', label: 'Draft social post' },
  { value: 'draft_mi_email_campaign', label: 'Draft email campaign' },
  { value: 'draft_mi_sms_campaign', label: 'Draft SMS campaign' },
  { value: 'draft_mi_whatsapp_campaign', label: 'Draft WhatsApp campaign' },
  { value: 'draft_mi_ad_copy', label: 'Draft ad copy' },
  { value: 'draft_mi_video_script', label: 'Draft video script' },
  { value: 'draft_mi_landing_page', label: 'Draft landing page copy' },
  { value: 'draft_mi_blog_content', label: 'Draft blog content' },
  { value: 'draft_mi_review_response', label: 'Draft review response' },
  { value: 'draft_mi_campaign_report', label: 'Draft campaign report' },
  { value: 'draft_mi_executive_marketing_summary', label: 'Draft executive marketing summary' },
  { value: 'draft_sd_quality_report', label: 'Draft quality report' },
  { value: 'draft_sd_corrective_action', label: 'Draft corrective action' },
  { value: 'draft_sd_customer_summary', label: 'Draft customer summary' },
  { value: 'draft_sd_sla_report', label: 'Draft SLA report' },
  { value: 'draft_sd_inspection_summary', label: 'Draft inspection summary' },
  { value: 'draft_sd_warranty_report', label: 'Draft warranty report' },
  { value: 'draft_sd_callback_analysis', label: 'Draft callback analysis' },
  { value: 'draft_sd_continuous_improvement_plan', label: 'Draft continuous improvement plan' },
  { value: 'draft_sd_executive_service_summary', label: 'Draft executive service summary' },
  { value: 'draft_ito_fix', label: 'Draft IT fix plan' },
  { value: 'draft_ito_postmortem', label: 'Draft postmortem' },
  { value: 'draft_ito_release_notes', label: 'Draft release notes' },
  { value: 'draft_ito_infrastructure_report', label: 'Draft infrastructure report' },
  { value: 'draft_ito_health_summary', label: 'Draft health summary' },
  { value: 'draft_ito_incident_report', label: 'Draft incident report' },
  { value: 'draft_ito_change_plan', label: 'Draft change plan' },
  { value: 'draft_ito_runbook', label: 'Draft runbook' },
  { value: 'draft_ito_rca_report', label: 'Draft RCA report' },
  { value: 'draft_bev_experiment_plan', label: 'Draft experiment plan' },
  { value: 'draft_bev_improvement_plan', label: 'Draft improvement plan' },
  { value: 'draft_bev_maturity_assessment', label: 'Draft maturity assessment' },
  { value: 'draft_bev_benefit_report', label: 'Draft benefit report' },
  { value: 'draft_bev_lessons_learned', label: 'Draft lessons learned' },
  { value: 'draft_bev_executive_summary', label: 'Draft executive evolution summary' },
  { value: 'draft_bev_hypothesis', label: 'Draft business hypothesis' },
  { value: 'draft_bev_process_report', label: 'Draft process report' },
  { value: 'draft_bev_agent_improvement', label: 'Draft agent improvement plan' },
  { value: 'draft_ab_implementation_plan', label: 'Draft implementation plan' },
  { value: 'draft_ab_requirements_spec', label: 'Draft requirements specification' },
  { value: 'draft_ab_architecture_impact_report', label: 'Draft architecture impact report' },
  { value: 'draft_ab_code_generation_plan', label: 'Draft code generation plan' },
  { value: 'draft_ab_test_plan', label: 'Draft test plan' },
  { value: 'draft_ab_deployment_plan', label: 'Draft deployment plan' },
  { value: 'draft_ab_documentation_update', label: 'Draft documentation update' },
  { value: 'draft_ab_feature_changelog', label: 'Draft feature changelog' },
  { value: 'draft_ab_rollback_plan', label: 'Draft rollback plan' },
  { value: 'draft_ip_job_template', label: 'Draft job template' },
  { value: 'draft_ip_compliance_document', label: 'Draft compliance document' },
  { value: 'draft_ip_industry_report', label: 'Draft industry report' },
  { value: 'draft_ip_workflow', label: 'Draft industry workflow' },
  { value: 'draft_ip_checklist', label: 'Draft checklist' },
  { value: 'draft_ip_certificate_template', label: 'Draft certificate template' },
  { value: 'draft_ip_quote_template', label: 'Draft quote template' },
  { value: 'draft_ip_knowledge_article', label: 'Draft knowledge article' },
  { value: 'draft_ip_improvement_plan', label: 'Draft improvement plan' },
  { value: 'draft_pdp_integration_guide', label: 'Draft integration guide' },
  { value: 'draft_pdp_webhook_config', label: 'Draft webhook config' },
  { value: 'draft_pdp_api_example', label: 'Draft API example' },
  { value: 'draft_pdp_sdk_example', label: 'Draft SDK example' },
  { value: 'draft_pdp_diagnostic_report', label: 'Draft diagnostic report' },
  { value: 'draft_sm_subscription_report', label: 'Draft subscription report' },
  { value: 'draft_sm_billing_summary', label: 'Draft billing summary' },
  { value: 'draft_sm_usage_report', label: 'Draft usage report' },
  { value: 'draft_sm_renewal_forecast', label: 'Draft renewal forecast' },
  { value: 'draft_sm_plan_recommendation', label: 'Draft plan recommendation' },
  { value: 'draft_vr_call_summary', label: 'Draft call summary' },
  { value: 'draft_vr_follow_up_tasks', label: 'Draft follow-up tasks' },
  { value: 'draft_vr_crm_note', label: 'Draft CRM note' },
  { value: 'draft_vr_job_note', label: 'Draft job note' },
  { value: 'draft_vr_callback_request', label: 'Draft callback request' },
  { value: 'draft_vr_lead_creation', label: 'Draft lead creation' },
  { value: 'draft_vr_appointment_booking', label: 'Draft appointment booking' },
  { value: 'draft_vr_routing_recommendation', label: 'Draft routing recommendation' },
  { value: 'draft_dip_extraction_correction', label: 'Draft extraction correction' },
  { value: 'draft_dip_document_summary', label: 'Draft document summary' },
  { value: 'draft_dip_workflow_action', label: 'Draft workflow action' },
  { value: 'draft_dip_compliance_suggestion', label: 'Draft compliance suggestion' },
  { value: 'draft_dip_supplier_invoice', label: 'Draft supplier invoice' },
  { value: 'draft_dip_inventory_receipt', label: 'Draft inventory receipt' },
  { value: 'draft_dip_compliance_record', label: 'Draft compliance record' },
  { value: 'draft_dip_asset_update', label: 'Draft asset update' },
  { value: 'draft_dip_warranty_registration', label: 'Draft warranty registration' },
  { value: 'draft_dip_follow_up_task', label: 'Draft follow-up task' },
  { value: 'draft_bc_recovery_plan', label: 'Draft recovery plan' },
  { value: 'draft_bc_verification_report', label: 'Draft verification report' },
  { value: 'draft_bc_continuity_improvement', label: 'Draft continuity improvement' },
  { value: 'draft_bc_recovery_test_schedule', label: 'Draft recovery test schedule' },
  { value: 'draft_bc_restore_request', label: 'Draft restore request' },
  { value: 'draft_gs_search_report', label: 'Draft search report' },
  { value: 'draft_gs_activity_summary', label: 'Draft activity summary' },
  { value: 'draft_gs_related_record_recommendation', label: 'Draft related record recommendation' },
  { value: 'draft_dm_mapping_suggestion', label: 'Draft mapping suggestion' },
  { value: 'draft_dm_validation_correction', label: 'Draft validation correction' },
  { value: 'draft_dm_migration_report', label: 'Draft migration report' },
  { value: 'draft_dm_cleanup_recommendation', label: 'Draft cleanup recommendation' },
  { value: 'draft_nc_template', label: 'Draft notification template' },
  { value: 'draft_nc_escalation_rule', label: 'Draft escalation rule' },
  { value: 'draft_nc_delivery_report', label: 'Draft delivery report' },
  { value: 'draft_nc_improvement_recommendation', label: 'Draft improvement recommendation' },
  { value: 'draft_ph_incident_report', label: 'Draft incident report' },
  { value: 'draft_ph_optimization_recommendation', label: 'Draft optimization recommendation' },
  { value: 'draft_ph_capacity_forecast', label: 'Draft capacity forecast' },
  { value: 'draft_ph_diagnostic_summary', label: 'Draft diagnostic summary' },
  { value: 'draft_lnc_readiness_report', label: 'Draft readiness report' },
  { value: 'draft_lnc_deployment_plan', label: 'Draft deployment plan' },
  { value: 'draft_lnc_rollout_checklist', label: 'Draft rollout checklist' },
  { value: 'draft_lnc_rollback_recommendation', label: 'Draft rollback recommendation' },
  { value: 'draft_rc_release_notes', label: 'Draft release notes' },
  { value: 'draft_rc_optimization_plan', label: 'Draft optimization plan' },
  { value: 'draft_rc_deployment_recommendation', label: 'Draft deployment recommendation' },
  { value: 'draft_pl_deployment_plan', label: 'Draft deployment plan' },
  { value: 'draft_pl_launch_report', label: 'Draft launch report' },
  { value: 'draft_pl_post_launch_checklist', label: 'Draft post-launch checklist' },
  { value: 'draft_rlm_release_notes', label: 'Draft release notes' },
  { value: 'draft_rlm_user_documentation', label: 'Draft user documentation' },
  { value: 'draft_rlm_admin_documentation', label: 'Draft administrator documentation' },
  { value: 'draft_rlm_post_launch_recommendations', label: 'Draft post-launch recommendations' },
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
