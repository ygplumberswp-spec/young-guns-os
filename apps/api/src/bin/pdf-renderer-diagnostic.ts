#!/usr/bin/env node
/**
 * Read-only diagnostic for finance PDF renderer (Chromium) availability.
 * Does not launch a browser or render a PDF.
 */
import { probeFinancePdfRendererAvailability } from '../services/finance-document-pdf.service.js';

const probe = await probeFinancePdfRendererAvailability();
console.log(
  JSON.stringify(
    {
      phase: 'pdf-renderer-diagnostic',
      available: probe.available,
      source: probe.source,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);
process.exit(probe.available ? 0 : 1);
