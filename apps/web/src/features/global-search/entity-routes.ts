import type { GsEntityType } from '@titan/shared';

/** Maps global-search entity hits to staff app routes (null when no detail route exists). */
export function resolveGlobalSearchEntityHref(
  entityType: GsEntityType,
  sourceEntityId: string,
): string | null {
  switch (entityType) {
    case 'customer':
    case 'contact':
    case 'property':
      return `/crm/${sourceEntityId}`;
    case 'lead':
      return `/leads/${sourceEntityId}`;
    case 'job':
      return `/jobs/${sourceEntityId}`;
    case 'quote':
      return `/finance/quotes/${sourceEntityId}`;
    case 'invoice':
      return `/finance/invoices/${sourceEntityId}`;
    case 'payment':
      return `/finance/payments/${sourceEntityId}`;
    case 'purchase_order':
      return `/procurement/purchase-orders/${sourceEntityId}`;
    case 'supplier':
      return `/procurement/suppliers/${sourceEntityId}`;
    case 'inventory':
      return `/inventory/products/${sourceEntityId}`;
    case 'vehicle':
      return `/fleet/vehicles/${sourceEntityId}`;
    case 'document':
    case 'ocr_content':
      return `/documents/${sourceEntityId}`;
    case 'communication':
    case 'email':
    case 'whatsapp':
      return `/communications/messages`;
    case 'knowledge_article':
      return `/knowledge-base`;
    case 'automation':
      return `/automation`;
    default:
      return null;
  }
}
