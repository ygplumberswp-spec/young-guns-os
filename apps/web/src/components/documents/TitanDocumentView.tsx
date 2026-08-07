import { useMemo } from 'react';
import {
  COC_NOT_ATTACHED_LABEL,
  documentPhotosByRole,
  documentPhotoSourcePath,
  documentSectionLabel,
  documentVariantLabel,
  SUPPORTED_PAYMENT_METHOD_LABELS,
  YOUNG_GUNS_BANK_DETAILS,
  YOUNG_GUNS_CONTACT,
  type CocAttachmentState,
  type DocumentLineItem,
  type DocumentPhoto,
  type DocumentSection,
  type DocumentTotals,
  type FinanceDocumentAddressSnapshot,
  type TitanDocumentType,
  type TitanReportKind,
} from '@titan/shared';
import '../../styles/titan-document.css';

export type TitanDocumentPaymentLink = {
  status: string;
  paymentUrl: string | null;
  /** Inline SVG produced from the real Yoco URL. Null when there is no link. */
  qrSvg: string | null;
  payable: boolean;
  amountCents: number;
  currency: string;
};

export type TitanDocumentViewProps = {
  documentType: TitanDocumentType;
  reportKind?: TitanReportKind | null;
  documentNumber: string;
  title: string;
  status: string;
  issuedAt?: string | null;
  dueDate?: string | null;
  sections: DocumentSection[];
  photos: DocumentPhoto[];
  customer?: {
    name: string | null;
    contactPerson?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  property?: { addressLine?: string | null; suburb?: string | null; city?: string | null } | null;
  job?: { reference?: string | null; scheduledAt?: string | null; technician?: string | null } | null;
  lineItems?: DocumentLineItem[];
  totals?: DocumentTotals | null;
  coc?: CocAttachmentState;
  paymentLink?: TitanDocumentPaymentLink | null;
  /** Google review link. Reports and invoices show a QR when it is configured. */
  reviewUrl?: string | null;
  reviewQrSvg?: string | null;
  /** Finance preview — omit the legacy title field entirely. */
  hideTitle?: boolean;
  hidePaymentOptions?: boolean;
  customerReference?: string | null;
  documentAddresses?: FinanceDocumentAddressSnapshot | null;
  vatRateLabel?: string;
};

function formatMoney(cents: number, currency = 'ZAR'): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const fraction = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = whole.toLocaleString('en-ZA');
  return `${cents < 0 ? '-' : ''}${currency} ${grouped}.${fraction}`;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="titan-doc__field-label">{label}</span>
      <span className="titan-doc__field-value">{value}</span>
    </div>
  );
}

function Panel({
  kind,
  title,
  children,
}: {
  kind: string;
  title?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className={`titan-doc__panel titan-doc__section--${kind}`}>
      <div className="titan-doc__artwork" aria-hidden="true" />
      {title ? <h2 className="titan-doc__section-title">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Renders a section's payload text without inventing content when it is empty. */
function payloadText(section: DocumentSection, key = 'text'): string | null {
  const value = (section.payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function payloadList(section: DocumentSection, key: string): Record<string, unknown>[] {
  const value = (section.payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value.filter(Boolean) as Record<string, unknown>[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Shared renderer for all five documents. Section order comes from the engine,
 * so a reordered draft renders in the Owner's order without a code change.
 */
export function TitanDocumentView(props: TitanDocumentViewProps) {
  const variantLabel = useMemo(
    () =>
      documentVariantLabel(
        props.documentType === 'report'
          ? { type: 'report', reportKind: props.reportKind ?? 'service' }
          : { type: props.documentType },
      ),
    [props.documentType, props.reportKind],
  );

  const visibleSections = useMemo(
    () => [...props.sections].filter((section) => section.visible).sort((a, b) => a.position - b.position),
    [props.sections],
  );

  const isReport = props.documentType === 'report';

  return (
    <article className="titan-doc" aria-label={`${variantLabel} ${props.documentNumber}`}>
      {visibleSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          variantLabel={variantLabel}
          isReport={isReport}
          {...props}
        />
      ))}
    </article>
  );
}

type SectionRendererProps = TitanDocumentViewProps & {
  section: DocumentSection;
  variantLabel: string;
  isReport: boolean;
};

function SectionRenderer(props: SectionRendererProps) {
  const { section, isReport } = props;
  const heading = section.title ?? documentSectionLabel(section.kind);

  switch (section.kind) {
    case 'branded_header':
      return (
        <Panel kind={section.kind}>
          <header className="titan-doc__header">
            <div>
              <h1 className="titan-doc__brand-name">{YOUNG_GUNS_CONTACT.tradingName}</h1>
              <p className="titan-doc__brand-tagline">{YOUNG_GUNS_CONTACT.tagline}</p>
            </div>
            <div className="titan-doc__doc-type">
              <p className="titan-doc__doc-type-label">{props.variantLabel}</p>
              <p className="titan-doc__doc-number">{props.documentNumber}</p>
            </div>
          </header>
        </Panel>
      );

    case 'document_meta':
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__grid">
            <Field label="Reference" value={props.documentNumber} />
            <Field label="Customer reference" value={props.customerReference} />
            {!props.hideTitle && props.title ? <Field label="Title" value={props.title} /> : null}
            <Field label="Issued" value={formatDate(props.issuedAt) ?? 'Draft — not yet issued'} />
            {!isReport ? <Field label="Due" value={formatDate(props.dueDate)} /> : null}
          </div>
        </Panel>
      );

    case 'customer_property':
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__grid">
            <Field label="Customer" value={props.customer?.name} />
            <Field label="Contact" value={props.customer?.contactPerson} />
            <Field label="Email" value={props.customer?.email} />
            <Field label="Phone" value={props.customer?.phone} />
            <Field label="Billing address" value={props.documentAddresses?.billingAddress} />
            <Field label="Site address" value={props.documentAddresses?.siteAddress} />
            <Field label="Postal address" value={props.documentAddresses?.postalAddress} />
            <Field label="Address" value={props.property?.addressLine} />
            <Field label="Suburb" value={props.property?.suburb} />
            <Field label="City" value={props.property?.city} />
          </div>
        </Panel>
      );

    case 'job_details':
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__grid">
            <Field label="Job" value={props.job?.reference} />
            <Field label="Attended" value={formatDate(props.job?.scheduledAt)} />
            <Field label="Technician" value={props.job?.technician} />
          </div>
        </Panel>
      );

    case 'status_panel': {
      const normalised = props.status.toLowerCase();
      const modifier =
        normalised === 'paid' ? ' titan-doc__status--paid' : normalised === 'overdue' ? ' titan-doc__status--overdue' : '';
      return (
        <Panel kind={section.kind} title={heading}>
          <span className={`titan-doc__status${modifier}`}>{props.status}</span>
        </Panel>
      );
    }

    case 'service_summary':
    case 'executive_summary':
    case 'work_completed':
    case 'work_performed':
    case 'scope_of_work':
    case 'terms_exclusions':
    case 'recommendations':
    case 'recommended_maintenance':
    case 'compliance':
    case 'custom': {
      const body = payloadText(section, 'summary') ?? payloadText(section, 'text');
      const bullets = payloadList(section, 'items');
      if (!body && bullets.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          {body ? <p className="titan-doc__body-text">{body}</p> : null}
          {bullets.length > 0 ? (
            <ul className="titan-doc__checklist">
              {bullets.map((item, index) => (
                <li key={index}>
                  <span className="titan-doc__check">•</span>
                  <span>{text(item.label) ?? text(item.description) ?? ''}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      );
    }

    case 'work_completed_checklist': {
      const items = payloadList(section, 'items');
      if (items.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <ul className="titan-doc__checklist">
            {items.map((item, index) => (
              <li key={index}>
                <span className="titan-doc__check">{item.done === false ? '○' : '✓'}</span>
                <span>{text(item.label) ?? ''}</span>
              </li>
            ))}
          </ul>
        </Panel>
      );
    }

    case 'inspection_findings': {
      const rows = payloadList(section, 'rows');
      if (rows.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__table-wrap">
            <table className="titan-doc__table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Finding</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{text(row.item) ?? ''}</td>
                    <td>{text(row.finding) ?? ''}</td>
                    <td>{text(row.action) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      );
    }

    case 'parts_materials': {
      const items = payloadList(section, 'items');
      if (items.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__table-wrap">
            <table className="titan-doc__table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col" className="titan-doc__num">
                    Qty
                  </th>
                  <th scope="col">Unit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>{text(item.description) ?? ''}</td>
                    <td className="titan-doc__num">
                      {typeof item.quantity === 'number' ? item.quantity : ''}
                    </td>
                    <td>{text(item.unit) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      );
    }

    case 'line_items': {
      // Reports never render pricing; the engine also refuses to store it.
      if (isReport) return null;
      const items = props.lineItems ?? [];
      if (items.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__table-wrap">
            <table className="titan-doc__table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col" className="titan-doc__num">
                    Qty
                  </th>
                  <th scope="col" className="titan-doc__num">
                    Unit Price
                  </th>
                  <th scope="col" className="titan-doc__num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className="titan-doc__num">{item.quantity}</td>
                    <td className="titan-doc__num">{formatMoney(item.unitPriceCents)}</td>
                    <td className="titan-doc__num">{formatMoney(item.lineSubtotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      );
    }

    case 'totals': {
      if (isReport || !props.totals) return null;
      const totals = props.totals;
      const vatLabel = props.vatRateLabel ?? 'VAT (15%)';
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__totals">
            <div className="titan-doc__totals-row">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotalCents, totals.currency)}</span>
            </div>
            <div className="titan-doc__totals-row">
              <span>{vatLabel}</span>
              <span>{formatMoney(totals.vatCents, totals.currency)}</span>
            </div>
            <div className="titan-doc__totals-row titan-doc__totals-row--grand">
              <span>Total</span>
              <span>{formatMoney(totals.totalCents, totals.currency)}</span>
            </div>
            {totals.depositReceivedCents > 0 ? (
              <div className="titan-doc__totals-row">
                <span>Deposit received</span>
                <span>-{formatMoney(totals.depositReceivedCents, totals.currency)}</span>
              </div>
            ) : null}
            {totals.amountPaidCents > 0 ? (
              <div className="titan-doc__totals-row">
                <span>Paid</span>
                <span>-{formatMoney(totals.amountPaidCents, totals.currency)}</span>
              </div>
            ) : null}
            <div className="titan-doc__totals-row titan-doc__totals-row--balance">
              <span>Balance Due</span>
              <span>{formatMoney(totals.outstandingCents, totals.currency)}</span>
            </div>
          </div>
        </Panel>
      );
    }

    case 'warranty': {
      const months = (section.payload as { months?: unknown }).months;
      const body = payloadText(section, 'text');
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__pay">
            <div className="titan-doc__stamp">
              <strong>Workmanship</strong>
              <span>Warranty</span>
              {typeof months === 'number' ? <span>{months} months</span> : null}
            </div>
            {body ? <p className="titan-doc__body-text">{body}</p> : null}
          </div>
        </Panel>
      );
    }

    case 'before_after_photos': {
      const before = documentPhotosByRole(props.photos, 'before');
      const after = documentPhotosByRole(props.photos, 'after');
      if (before.length === 0 && after.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          {before.length > 0 ? <PhotoGrid label="Before" photos={before} /> : null}
          {after.length > 0 ? <PhotoGrid label="After" photos={after} /> : null}
        </Panel>
      );
    }

    case 'image_gallery': {
      const additional = documentPhotosByRole(props.photos, 'additional');
      if (additional.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <PhotoGrid photos={additional} />
        </Panel>
      );
    }

    case 'coc_attachment': {
      const coc = props.coc ?? { status: 'not_attached' as const };
      return (
        <Panel kind={section.kind} title={heading}>
          {coc.status === 'attached' ? (
            <a
              className="titan-doc__attachment"
              href={coc.downloadPath}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">📄</span>
              <span>{coc.fileName}</span>
            </a>
          ) : (
            // Honest state: no dead link and no fake thumbnail.
            <span className="titan-doc__attachment titan-doc__attachment--missing">
              {COC_NOT_ATTACHED_LABEL}
            </span>
          )}
        </Panel>
      );
    }

    case 'payment_options': {
      // Reports, quotes and finance previews never show banking or a payment link.
      if (isReport || props.hidePaymentOptions) return null;
      const link = props.paymentLink;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__pay">
            {link?.payable && link.paymentUrl ? (
              <>
                {link.qrSvg ? (
                  <div
                    className="titan-doc__pay-qr"
                    // The SVG is generated server-side from the stored Yoco URL.
                    dangerouslySetInnerHTML={{ __html: link.qrSvg }}
                  />
                ) : null}
                <div>
                  <a className="titan-doc__pay-button" href={link.paymentUrl}>
                    Pay {formatMoney(link.amountCents, link.currency)} securely
                  </a>
                  <p className="titan-doc__body-text">
                    Scan the QR code or tap the button to pay by card through Yoco.
                  </p>
                </div>
              </>
            ) : link && link.status === 'paid' ? (
              <span className="titan-doc__status titan-doc__status--paid">Paid in full</span>
            ) : null}
          </div>

          <h3 className="titan-doc__section-title" style={{ marginTop: 18 }}>
            EFT / Bank Transfer
          </h3>
          <div className="titan-doc__bank">
            <Field label="Account Name" value={YOUNG_GUNS_BANK_DETAILS.accountName} />
            <Field label="Bank" value={YOUNG_GUNS_BANK_DETAILS.bank} />
            <Field label="Account Number" value={YOUNG_GUNS_BANK_DETAILS.accountNumber} />
            <Field label="Branch Code" value={YOUNG_GUNS_BANK_DETAILS.branchCode} />
            <Field label="Account Type" value={YOUNG_GUNS_BANK_DETAILS.accountType} />
            <Field label="Reference" value={props.documentNumber} />
          </div>
          <p className="titan-doc__body-text">
            {YOUNG_GUNS_BANK_DETAILS.referenceInstruction}. Accepted methods:{' '}
            {SUPPORTED_PAYMENT_METHOD_LABELS.join(' and ')}.
          </p>
        </Panel>
      );
    }

    case 'sign_off': {
      const signedBy = payloadText(section, 'signedByName');
      const signedAt = formatDate(payloadText(section, 'signedAt'));
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__signoff titan-doc__grid">
            <Field label="Signed by" value={signedBy ?? 'Awaiting client signature'} />
            <Field label="Date" value={signedAt} />
          </div>
        </Panel>
      );
    }

    case 'contact_help':
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__grid">
            <Field label="Phone" value={YOUNG_GUNS_CONTACT.phone} />
            <Field label="Email" value={YOUNG_GUNS_CONTACT.email} />
            <Field label="Website" value={YOUNG_GUNS_CONTACT.website} />
            <Field label="Location" value={YOUNG_GUNS_CONTACT.location} />
          </div>
        </Panel>
      );

    case 'review_request': {
      if (!props.reviewUrl || !props.reviewQrSvg) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__pay">
            <div
              className="titan-doc__pay-qr"
              dangerouslySetInnerHTML={{ __html: props.reviewQrSvg }}
            />
            <p className="titan-doc__body-text">
              Scan to leave us a Google review — it genuinely helps a local business like ours.
            </p>
          </div>
        </Panel>
      );
    }

    case 'attachments': {
      const files = payloadList(section, 'files');
      if (files.length === 0) return null;
      return (
        <Panel kind={section.kind} title={heading}>
          <div className="titan-doc__grid">
            {files.map((file, index) => {
              const href = text(file.downloadPath);
              const name = text(file.fileName) ?? 'Attachment';
              return href ? (
                <a key={index} className="titan-doc__attachment" href={href} target="_blank" rel="noreferrer">
                  {name}
                </a>
              ) : (
                <span key={index} className="titan-doc__attachment titan-doc__attachment--missing">
                  {name} — {COC_NOT_ATTACHED_LABEL}
                </span>
              );
            })}
          </div>
        </Panel>
      );
    }

    case 'branded_footer':
      return (
        <Panel kind={section.kind}>
          <footer className="titan-doc__footer">
            <span>
              <strong>{YOUNG_GUNS_CONTACT.tradingName}</strong> — {YOUNG_GUNS_CONTACT.tagline}
            </span>
            <span>
              {YOUNG_GUNS_CONTACT.phone} · {YOUNG_GUNS_CONTACT.email} · {YOUNG_GUNS_CONTACT.website}
            </span>
          </footer>
        </Panel>
      );

    default:
      return null;
  }
}

function PhotoGrid({ label, photos }: { label?: string; photos: DocumentPhoto[] }) {
  return (
    <>
      {label ? <span className="titan-doc__field-label">{label}</span> : null}
      <div className="titan-doc__photos">
        {photos.map((photo) => (
          <figure className="titan-doc__photo" key={photo.id}>
            <img src={documentPhotoSourcePath(photo)} alt={photo.caption ?? photo.fileName} />
            {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </>
  );
}
