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

  // Extract ##table blocks before cleaning to preserve newlines/tabs inside them
  const tableBlocks: string[] = [];
  const TABLE_RE = /##table[ \t]*\n([\s\S]*?)##\/table/g;
  let processed = normalized.replace(TABLE_RE, (_match, blockContent: string) => {
    const idx = tableBlocks.length;
    tableBlocks.push(blockContent);
    return `___TABLE_BLOCK_${idx}___`;
  });

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
  processed = processed.replace(/___TABLE_BLOCK_(\d+)___/g, (_match, idx: string) => {
    return `\n\n##table\n${tableBlocks[parseInt(idx, 10)]}##\/table\n\n`;
  });

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
  const TABLE_RE = /##table[ \t]*\n([\s\S]*?)##\/table/g;
  let processed = normalized.replace(TABLE_RE, (_match, blockContent: string) => {
    const idx = tableBlocks.length;
    tableBlocks.push(blockContent);
    return `___TABLE_BLOCK_${idx}___`;
  });

  processed = processed
    .replace(/<[^>]*>/g, '')
    .replace(/(\b\w+)-\s*[\n]+\s*(\w+\b)/g, '$1$2')
    .split('\n')
    .map((line) => line.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return processed
    .replace(/___TABLE_BLOCK_(\d+)___/g, (_match, idx: string) => {
      return `\n\n##table\n${tableBlocks[parseInt(idx, 10)]}##\/table\n\n`;
    })
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
