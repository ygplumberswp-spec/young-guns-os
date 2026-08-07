import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FinanceCatalogueItemSearchResult } from '@titan/shared';
import {
  collectUsedCatalogueSourceKeys,
  duplicateCatalogueSelectionWarning,
  formatCatalogueSellPrice,
  formatFinanceCatalogueSourceLabel,
} from '@titan/shared';
import { searchFinanceCatalogue } from '../../lib/finance-api';
import type { FinanceDocumentPriceMode, FinanceDocumentVatMode, FinanceEditorLine } from './finance-editor-utils';
import { applyCatalogueItemToEditorLine, applyManualLineDescription } from './finance-editor-utils';

type FinanceCatalogueItemSearchFieldProps = {
  accessToken: string;
  line: FinanceEditorLine;
  allLines: FinanceEditorLine[];
  lineIndex: number;
  disabled?: boolean;
  currency?: string;
  priceMode: FinanceDocumentPriceMode;
  vatMode: FinanceDocumentVatMode;
  inputRef?: (el: HTMLInputElement | null) => void;
  onLineChange: (line: FinanceEditorLine) => void;
  onCatalogueSelected: (lineKey: string) => void;
};

const MANUAL_OPTION_ID = '__manual_line__';

export function FinanceCatalogueItemSearchField({
  accessToken,
  line,
  allLines,
  lineIndex,
  disabled,
  currency = 'ZAR',
  priceMode,
  vatMode,
  inputRef,
  onLineChange,
  onCatalogueSelected,
}: FinanceCatalogueItemSearchFieldProps) {
  const listboxId = useId();
  const [query, setQuery] = useState(line.description);
  const [results, setResults] = useState<FinanceCatalogueItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const skipSearchRef = useRef(false);

  const usedSourceKeys = collectUsedCatalogueSourceKeys(
    allLines.filter((row) => row.key !== line.key),
  );

  useEffect(() => {
    if (line.catalogueSourceKey && line.description) {
      setQuery(line.description);
    }
  }, [line.catalogueSourceKey, line.description]);

  const runSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 1) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      setError(null);
      try {
        const items = await searchFinanceCatalogue(accessToken, trimmed);
        setResults(items);
        setHighlightIndex(items.length > 0 ? 0 : trimmed.length > 0 ? 0 : -1);
      } catch {
        setError('Catalogue search unavailable — continue with a manual line');
        setResults([]);
        setHighlightIndex(trimmed.length > 0 ? 0 : -1);
      } finally {
        setIsSearching(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (line.catalogueSourceKey && query === line.description) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch, line.catalogueSourceKey, line.description]);

  const showManualOption = query.trim().length > 0;
  const optionCount = results.length + (showManualOption ? 1 : 0);
  const dropdownOpen = optionCount > 0 && !disabled;

  function closeDropdown() {
    setResults([]);
    setHighlightIndex(-1);
    setDuplicateMessage(null);
  }

  function selectCatalogueItem(item: FinanceCatalogueItemSearchResult) {
    skipSearchRef.current = true;
    const nextLine = applyCatalogueItemToEditorLine(line, item, { priceMode, vatMode });
    onLineChange(nextLine);
    setQuery(nextLine.description);
    setDuplicateMessage(duplicateCatalogueSelectionWarning(item.sourceKey, usedSourceKeys, item.name));
    setResults([]);
    setHighlightIndex(-1);
    onCatalogueSelected(line.key);
  }

  function selectManualLine() {
    skipSearchRef.current = true;
    const nextLine = applyManualLineDescription(line, query);
    onLineChange(nextLine);
    closeDropdown();
    onCatalogueSelected(line.key);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen && event.key === 'Enter') {
      return;
    }
    if (event.key === 'ArrowDown') {
      if (!dropdownOpen) return;
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, optionCount - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!dropdownOpen) return;
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (!dropdownOpen) return;
      event.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        selectCatalogueItem(results[highlightIndex]!);
      } else if (showManualOption && highlightIndex === results.length) {
        selectManualLine();
      } else if (results.length === 1) {
        selectCatalogueItem(results[0]!);
      } else if (showManualOption) {
        selectManualLine();
      }
      return;
    }
    if (event.key === 'Escape') {
      closeDropdown();
    }
  }

  return (
    <div className="finance-catalogue-search">
      <input
        ref={inputRef}
        className="titan-input finance-editor-field finance-editor-field--description"
        value={query}
        disabled={disabled}
        aria-label={`Line ${lineIndex + 1} item search`}
        placeholder="Search item code, name or type manually…"
        autoComplete="off"
        role="combobox"
        aria-expanded={dropdownOpen}
        aria-controls={dropdownOpen ? listboxId : undefined}
        aria-activedescendant={
          dropdownOpen && highlightIndex >= 0 ? `${listboxId}-opt-${highlightIndex}` : undefined
        }
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setDuplicateMessage(null);
          onLineChange({
            ...line,
            description: value,
            catalogueSourceKey: null,
            isManualLine: true,
          });
        }}
      />

      {isSearching ? <span className="finance-editor-muted finance-catalogue-search__status">Searching…</span> : null}
      {error ? <span className="finance-editor-muted finance-catalogue-search__status">{error}</span> : null}
      {duplicateMessage ? (
        <span className="finance-catalogue-search__status finance-catalogue-search__status--warning">{duplicateMessage}</span>
      ) : null}

      {dropdownOpen ? (
        <ul id={listboxId} className="finance-catalogue-search__results" role="listbox">
          {results.map((item, index) => (
            <li key={item.sourceKey} id={`${listboxId}-opt-${index}`} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={`finance-catalogue-search__option${index === highlightIndex ? ' finance-catalogue-search__option--active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCatalogueItem(item)}
              >
                <span className="finance-catalogue-search__option-head">
                  <strong>{item.itemCode}</strong>
                  <span>{item.name}</span>
                  <span className="finance-catalogue-search__option-source">
                    {formatFinanceCatalogueSourceLabel(item.sourceType)}
                  </span>
                </span>
                {item.shortDescription ? (
                  <span className="finance-catalogue-search__option-desc">{item.shortDescription}</span>
                ) : null}
                <span className="finance-catalogue-search__option-meta">
                  {formatCatalogueSellPrice(item.sellPriceCents, currency)} · {item.unit}
                </span>
              </button>
            </li>
          ))}
          {showManualOption ? (
            <li
              id={`${listboxId}-opt-${results.length}`}
              role="option"
              aria-selected={highlightIndex === results.length}
            >
              <button
                type="button"
                className={`finance-catalogue-search__manual${highlightIndex === results.length ? ' finance-catalogue-search__manual--active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectManualLine()}
              >
                Use as a custom/manual line
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export { MANUAL_OPTION_ID };
