import { Button, Input } from '@titan/ui';
import { FinanceEditorCard } from './FinanceEditorCard';
import type { FinanceDocumentSectionsEditorState } from './finance-document-sections-state';

type Props = {
  kind: 'quote' | 'invoice';
  state: FinanceDocumentSectionsEditorState;
  onChange: (next: FinanceDocumentSectionsEditorState) => void;
  disabled?: boolean;
};

function updateField<K extends keyof FinanceDocumentSectionsEditorState>(
  state: FinanceDocumentSectionsEditorState,
  key: K,
  value: FinanceDocumentSectionsEditorState[K],
): FinanceDocumentSectionsEditorState {
  return { ...state, [key]: value };
}

export function FinanceDocumentSectionsFields({ kind, state, onChange, disabled }: Props) {
  return (
    <>
      {kind === 'quote' ? (
        <FinanceEditorCard title="Scope of Work" className="finance-editor-card--full">
          <label className="titan-input-group finance-editor-field-group">
            <span className="titan-input-label">Scope of work</span>
            <textarea
              id="finance-scope-of-work"
              className="titan-input finance-editor-field finance-textarea"
              rows={4}
              value={state.scopeOfWork}
              disabled={disabled}
              onChange={(event) => onChange(updateField(state, 'scopeOfWork', event.target.value))}
              placeholder="Describe the work included in this quote"
            />
          </label>
        </FinanceEditorCard>
      ) : (
        <FinanceEditorCard title="Work Completed" className="finance-editor-card--full">
          <label className="titan-input-group finance-editor-field-group">
            <span className="titan-input-label">Work completed</span>
            <textarea
              id="finance-work-completed"
              className="titan-input finance-editor-field finance-textarea"
              rows={4}
              value={state.workCompleted}
              disabled={disabled}
              onChange={(event) => onChange(updateField(state, 'workCompleted', event.target.value))}
              placeholder="Summarise completed work for the customer invoice"
            />
          </label>
        </FinanceEditorCard>
      )}

      <FinanceEditorCard title="Terms & Exclusions" className="finance-editor-card--full">
        {kind === 'quote' ? (
          <label className="titan-input-group finance-editor-field-group">
            <span className="titan-input-label">Exclusions</span>
            <textarea
              id="finance-exclusions"
              className="titan-input finance-editor-field finance-textarea"
              rows={3}
              value={state.exclusions}
              disabled={disabled}
              onChange={(event) => onChange(updateField(state, 'exclusions', event.target.value))}
              placeholder="Work or materials not included"
            />
          </label>
        ) : null}
        <label className="titan-input-group finance-editor-field-group">
          <span className="titan-input-label">Payment terms</span>
          <textarea
            id="finance-payment-terms"
            className="titan-input finance-editor-field finance-textarea"
            rows={3}
            value={state.paymentTerms}
            disabled={disabled}
            onChange={(event) => onChange(updateField(state, 'paymentTerms', event.target.value))}
            placeholder="Deposit, due dates or other payment terms"
          />
        </label>
      </FinanceEditorCard>

      <FinanceEditorCard title="Warranty" className="finance-editor-card--full">
        <label className="titan-input-group finance-editor-field-group">
          <span className="titan-input-label">Warranty wording</span>
          <textarea
            id="finance-warranty-text"
            className="titan-input finance-editor-field finance-textarea"
            rows={3}
            value={state.warrantyText}
            disabled={disabled}
            onChange={(event) => onChange(updateField(state, 'warrantyText', event.target.value))}
            placeholder="Optional — only when a genuine warranty applies"
          />
        </label>
        <Input
          id="finance-warranty-months"
          label="Warranty period (months, optional)"
          type="number"
          min={1}
          value={state.warrantyMonths}
          disabled={disabled}
          onChange={(event) => onChange(updateField(state, 'warrantyMonths', event.target.value))}
        />
      </FinanceEditorCard>

      <FinanceEditorCard title="Recommended Maintenance" className="finance-editor-card--full">
        <label className="titan-input-group finance-editor-field-group">
          <span className="titan-input-label">Maintenance notes</span>
          <textarea
            id="finance-maintenance-text"
            className="titan-input finance-editor-field finance-textarea"
            rows={3}
            value={state.maintenanceText}
            disabled={disabled}
            onChange={(event) => onChange(updateField(state, 'maintenanceText', event.target.value))}
            placeholder="Optional recommendations — not automatic recurring jobs"
          />
        </label>
        <div className="finance-editor-field-group">
          <span className="titan-input-label">Recommendation items</span>
          {state.maintenanceItems.map((item, index) => (
            <Input
              key={`maintenance-item-${index}`}
              label={`Item ${index + 1}`}
              value={item}
              disabled={disabled}
              onChange={(event) => {
                const next = [...state.maintenanceItems];
                next[index] = event.target.value;
                onChange(updateField(state, 'maintenanceItems', next));
              }}
            />
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(updateField(state, 'maintenanceItems', [...state.maintenanceItems, '']))}
          >
            Add recommendation
          </Button>
        </div>
      </FinanceEditorCard>
    </>
  );
}
