import { Link } from 'wouter';
import { Button } from '@titan/ui';
import {
  FACEBOOK_CONNECTION_ACTION_LABELS,
  facebookConnectionActionAllowed,
  normalizeFacebookConnectionUiStatus,
  resolveFacebookConnectionActionPlan,
  type FacebookConnectionState,
  type FacebookConnectionUiAction,
  type SocialConnectionFoundationStatus,
} from '@titan/shared';

export type FacebookConnectionActionsProps = {
  foundationStatus?: SocialConnectionFoundationStatus;
  connectionState?: FacebookConnectionState;
  busy: boolean;
  canManage: boolean;
  needsConfiguration?: boolean;
  confirmDisconnect: boolean;
  choosePageHref?: string | null;
  showViewSetup?: boolean;
  onConnect: () => void;
  onChoosePage: () => void;
  onCheckHealth: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRequestDisconnect: () => void;
  onCancelDisconnect: () => void;
  onViewSetup?: () => void;
};

function actionVariant(
  action: FacebookConnectionUiAction,
  plan: ReturnType<typeof resolveFacebookConnectionActionPlan>,
): 'primary' | 'secondary' | 'destructive' | 'ghost' {
  if (action === plan.primary) return 'primary';
  if (action === 'disconnect') return 'secondary';
  if (plan.secondary.includes(action)) return 'secondary';
  return 'ghost';
}

function renderActionButton(
  action: FacebookConnectionUiAction,
  plan: ReturnType<typeof resolveFacebookConnectionActionPlan>,
  props: FacebookConnectionActionsProps,
) {
  const { busy, canManage, needsConfiguration, confirmDisconnect, choosePageHref } = props;
  if (!facebookConnectionActionAllowed(plan, action)) return null;
  if (!canManage && action !== 'view_setup') return null;

  const variant = actionVariant(action, plan);
  const label = FACEBOOK_CONNECTION_ACTION_LABELS[action];
  const disabled = busy || (needsConfiguration && action !== 'view_setup');

  if (action === 'disconnect') {
    if (confirmDisconnect) {
      return (
        <Button
          key="confirm-disconnect"
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={props.onDisconnect}
        >
          Confirm disconnect
        </Button>
      );
    }
    return (
      <Button
        key="disconnect"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={props.onRequestDisconnect}
      >
        {label}
      </Button>
    );
  }

  if (action === 'choose_page' && choosePageHref) {
    return (
      <Link key="choose-page" href={choosePageHref}>
        <Button size="sm" variant={variant} disabled={disabled}>
          {label}
        </Button>
      </Link>
    );
  }

  const handlers: Record<FacebookConnectionUiAction, () => void> = {
    connect: props.onConnect,
    choose_page: props.onChoosePage,
    check_health: props.onCheckHealth,
    reconnect: props.onReconnect,
    disconnect: props.onRequestDisconnect,
    view_setup: props.onViewSetup ?? (() => undefined),
  };

  return (
    <Button
      key={action}
      size="sm"
      variant={variant}
      disabled={disabled}
      onClick={() => handlers[action]()}
    >
      {label}
    </Button>
  );
}

export function FacebookConnectionActions(props: FacebookConnectionActionsProps) {
  const uiStatus = normalizeFacebookConnectionUiStatus({
    foundationStatus: props.foundationStatus,
    connectionState: props.connectionState,
  });
  const plan = resolveFacebookConnectionActionPlan(uiStatus);

  const actions: FacebookConnectionUiAction[] = [];
  if (plan.primary) actions.push(plan.primary);
  for (const action of plan.secondary) {
    if (!actions.includes(action)) actions.push(action);
  }
  if (props.showViewSetup && plan.tertiary.includes('view_setup')) {
    actions.push('view_setup');
  }

  if (!props.canManage && !props.showViewSetup) {
    return null;
  }

  return (
    <div className="social-connection-card__actions facebook-connection-actions flex flex-wrap gap-2">
      {actions.map((action) => renderActionButton(action, plan, props))}
      {props.confirmDisconnect ? (
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onCancelDisconnect}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
