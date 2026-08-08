import {
  QUOTE_SCENARIO_OPTIONS,
  type QuoteScenarioCode,
  type QuoteScenarioMetadata,
} from '@titan/shared';

export type QuoteScenarioEditorState = {
  scenario: QuoteScenarioCode;
  metadata: QuoteScenarioMetadata;
};

export const DEFAULT_QUOTE_SCENARIO_STATE: QuoteScenarioEditorState = {
  scenario: 'STANDARD',
  metadata: {},
};

type Props = {
  value: QuoteScenarioEditorState;
  onChange: (next: QuoteScenarioEditorState) => void;
  disabled?: boolean;
};

function updateMeta(
  value: QuoteScenarioEditorState,
  patch: QuoteScenarioMetadata,
): QuoteScenarioEditorState {
  return { ...value, metadata: { ...value.metadata, ...patch } };
}

export function QuoteScenarioFields({ value, onChange, disabled }: Props) {
  const scenario = value.scenario;
  const meta = value.metadata;

  return (
    <div className="finance-editor-card__section">
      <h3 className="finance-editor-card__section-title">Quote type / scenario</h3>
      <p className="page-muted" style={{ marginBottom: '0.75rem' }}>
        Explicit quote type only — never inferred from line descriptions. Changing type in a draft
        keeps lines, quote ID, and prices; metadata is validated server-side.
      </p>
      <label className="field">
        <span>Quote type</span>
        <select
          value={scenario}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value as QuoteScenarioCode;
            onChange({
              scenario: next,
              // Preserve compatible metadata; server validates incompatibilities.
              metadata: meta,
            });
          }}
        >
          {QUOTE_SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {scenario === 'EMERGENCY' ? (
        <label className="field" style={{ marginTop: '0.75rem' }}>
          <span>Urgency note</span>
          <input
            value={meta.urgencyNote ?? ''}
            disabled={disabled}
            onChange={(event) => onChange(updateMeta(value, { urgencyNote: event.target.value }))}
            placeholder="e.g. Burst pipe — after hours"
          />
        </label>
      ) : null}

      {scenario === 'GEYSER_COMPLIANCE' ? (
        <label className="field" style={{ marginTop: '0.75rem' }}>
          <span>Geyser notes (no automatic COC claim)</span>
          <input
            value={meta.geyserNotes ?? ''}
            disabled={disabled}
            onChange={(event) => onChange(updateMeta(value, { geyserNotes: event.target.value }))}
          />
        </label>
      ) : null}

      {scenario === 'DRAINS_CAMERA' ? (
        <label className="field" style={{ marginTop: '0.75rem' }}>
          <span>Drains / camera notes</span>
          <input
            value={meta.drainsNotes ?? ''}
            disabled={disabled}
            onChange={(event) => onChange(updateMeta(value, { drainsNotes: event.target.value }))}
          />
        </label>
      ) : null}

      {scenario === 'BATHROOM' ? (
        <label className="field" style={{ marginTop: '0.75rem' }}>
          <span>Bathroom scope notes</span>
          <input
            value={meta.bathroomScopeNotes ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange(updateMeta(value, { bathroomScopeNotes: event.target.value }))
            }
          />
        </label>
      ) : null}

      {scenario === 'CONSTRUCTION' ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Site name</span>
            <input
              value={meta.siteName ?? ''}
              disabled={disabled}
              onChange={(event) => onChange(updateMeta(value, { siteName: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Site reference</span>
            <input
              value={meta.siteReference ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { siteReference: event.target.value }))
              }
            />
          </label>
        </div>
      ) : null}

      {scenario === 'COMMERCIAL_MANAGING_AGENT' ? (
        <label className="field" style={{ marginTop: '0.75rem' }}>
          <span>Commercial / managing-agent reference</span>
          <input
            value={meta.commercialReference ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange(updateMeta(value, { commercialReference: event.target.value }))
            }
          />
        </label>
      ) : null}

      {scenario === 'MAINTENANCE_AGREEMENT' ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Maintenance scope</span>
            <input
              value={meta.maintenanceScope ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { maintenanceScope: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Frequency</span>
            <input
              value={meta.frequencyLabel ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { frequencyLabel: event.target.value }))
              }
              placeholder="e.g. Quarterly"
            />
          </label>
        </div>
      ) : null}

      {scenario === 'PLAN_ESTIMATE' ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Plan estimate ID (Row 94)</span>
            <input
              value={meta.planEstimateId ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { planEstimateId: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Estimate version</span>
            <input
              type="number"
              min={1}
              value={meta.planEstimateVersion ?? 1}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  updateMeta(value, {
                    planEstimateVersion: Number(event.target.value) || 1,
                  }),
                )
              }
            />
          </label>
        </div>
      ) : null}

      {scenario === 'BOQ_TENDER' ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Tender reference</span>
            <input
              value={meta.tenderReference ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { tenderReference: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>BOQ attachment / document ref</span>
            <input
              value={meta.boqAttachmentRef ?? meta.boqDocumentId ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { boqAttachmentRef: event.target.value }))
              }
            />
          </label>
        </div>
      ) : null}

      {scenario === 'VARIATION' ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Parent quote ID</span>
            <input
              value={meta.parentQuoteId ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { parentQuoteId: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Variation label</span>
            <input
              value={meta.variationLabel ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateMeta(value, { variationLabel: event.target.value }))
              }
            />
          </label>
        </div>
      ) : null}

      {scenario === 'MULTI_PHASE_PROJECT' ? (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Define phases and line→phase mapping via scenario metadata (validated so phase totals
          equal the quote total). Phase status is separate from quote lifecycle.
        </p>
      ) : null}

      {scenario === 'DEPOSIT_PROGRESS_FINAL' ? (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Commercial milestone definitions only — milestones are not payments and do not create
          invoices or mark amounts paid.
        </p>
      ) : null}
    </div>
  );
}
