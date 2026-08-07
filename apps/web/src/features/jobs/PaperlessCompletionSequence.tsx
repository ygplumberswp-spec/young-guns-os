import { PAPERLESS_COMPLETION_STEPS, type PaperlessCompletionStepKey } from '@titan/shared';

type Props = {
  currentStep: PaperlessCompletionStepKey | 'done';
  stepComplete: Partial<Record<PaperlessCompletionStepKey, boolean>>;
};

/** Controlled STEP 1–6 indicator for paperless field completion. */
export function PaperlessCompletionSequence({ currentStep, stepComplete }: Props) {
  return (
    <ol className="paperless-sequence" aria-label="Paperless completion sequence">
      {PAPERLESS_COMPLETION_STEPS.map((step) => {
        const done = Boolean(stepComplete[step.key]) || currentStep === 'done';
        const active = currentStep === step.key;
        return (
          <li
            key={step.key}
            className={`paperless-sequence__item${done ? ' paperless-sequence__item--done' : ''}${
              active ? ' paperless-sequence__item--active' : ''
            }`}
          >
            <span className="paperless-sequence__num">{step.id}</span>
            <span className="paperless-sequence__label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
