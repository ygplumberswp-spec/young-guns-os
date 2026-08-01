import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
};

type DialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'destructive' | 'default';
  mode: 'confirm' | 'alert';
  resolve: (value: boolean) => void;
};

export function useConfirmDialog() {
  const [state, setState] = useState<DialogState | null>(null);
  const [pending, setPending] = useState(false);
  const resolvingRef = useRef(false);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        title: options.title ?? 'Confirm action',
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        variant: options.variant ?? 'destructive',
        mode: 'confirm',
        resolve,
      });
    });
  }, []);

  const alert = useCallback((message: string, title = 'Notice'): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        title,
        message,
        confirmLabel: 'OK',
        cancelLabel: 'Cancel',
        variant: 'default',
        mode: 'alert',
        resolve: () => resolve(),
      });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      if (resolvingRef.current || !state) return;
      resolvingRef.current = true;
      setPending(true);
      try {
        state.resolve(value);
        setState(null);
      } finally {
        resolvingRef.current = false;
        setPending(false);
      }
    },
    [state],
  );

  const dialog: ReactNode = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      mode={state.mode}
      pending={pending}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirm, alert, dialog };
}
