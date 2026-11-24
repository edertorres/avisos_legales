import { createTableBlockRegex } from './tableMarkup';

/** Replace whole ##table blocks (settings line included) with placeholders. */
function protectTableBlocks(text: string, store: string[]): string {
  return text.replace(createTableBlockRegex(), (block: string) => {
    store.push(block);
    return `___TABLE_BLOCK_${store.length - 1}___`;
  });
}

/**
 * Put the original blocks back on their own lines. A single line break is enough: tables
 * render as blocks, so blank lines around them would show up as extra space in the notice.
 */
function restoreTableBlocks(text: string, store: string[]): string {
  return text
    .replace(/\s*___TABLE_BLOCK_(\d+)___\s*/g, (_match, idx: string) => `\n${store[parseInt(idx, 10)]}\n`)
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Strips all rich text formatting, HTML tags, and removes hard line breaks (\r\n, \n, \r),
 * un-hyphenates words broken at line ends, replaces tabs/extra spaces with a single space,
 * and trims leading/trailing whitespace.
 *
 * Preserves ##table ... ##/table blocks (table data with newlines intact).
 */
export function cleanPastedText(rawText: string): string {
  if (!rawText) return '';

  // Normalize line endings first
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Set ##table blocks aside before cleaning to preserve their lines and settings
  const tableBlocks: string[] = [];
  let processed = protectTableBlocks(normalized, tableBlocks);

  // Clean the text (outside table blocks)
  processed = processed
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Join words broken by hyphens at end of line
    .replace(/(\b\w+)-\s*[\n]+\s*(\w+\b)/g, '$1$2')
    // Convert hard line breaks into a single space (outside tables)
    .replace(/[\n]+/g, ' ')
    // Replace tabs with spaces (outside table blocks — table tabs already extracted)
    .replace(/\t+/g, ' ')
    // Collapse multiple consecutive spaces into a single space
    .replace(/ {2,}/g, ' ')
    .trim();

  // Restore table blocks
  processed = restoreTableBlocks(processed, tableBlocks);

  return processed
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strips rich text formatting and normalizes spaces while preserving manual line breaks.
 *
 * Use this for body text imports/paste so Enter-created lines survive. The regular
 * cleanPastedText function remains available for the explicit "Sin Retornos" action.
 */
export function cleanPastedTextPreservingReturns(rawText: string): string {
  if (!rawText) return '';

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const tableBlocks: string[] = [];
  let processed = protectTableBlocks(normalized, tableBlocks);

  processed = processed
    .replace(/<[^>]*>/g, '')
    .replace(/(\b\w+)-\s*[\n]+\s*(\w+\b)/g, '$1$2')
    .split('\n')
    .map((line) => line.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return restoreTableBlocks(processed, tableBlocks)
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
