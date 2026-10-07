export type FormattedText =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: FormattedText[] }
  | { type: 'underline'; children: FormattedText[] }
  | { type: 'align'; align: 'left' | 'center' | 'right' | 'justify'; children: FormattedText[] };

/** Parse nested bold, underline and alignment together. */
export function parseFormattedText(text: string): FormattedText[] {
  let cursor = 0;
  const parse = (closing?: string): { nodes: FormattedText[]; closed: boolean } => {
    const nodes: FormattedText[] = [];
    const tokens = /\*\*|\[\/?(?:left|center|right|justify|u)\]/gi;
    while (cursor < text.length) {
      tokens.lastIndex = cursor;
      const match = tokens.exec(text);
      if (!match) {
        nodes.push({ type: 'text', value: text.slice(cursor) });
        cursor = text.length;
        break;
      }
      if (match.index > cursor) nodes.push({ type: 'text', value: text.slice(cursor, match.index) });
      const token = match[0].toLowerCase();
      cursor = match.index + match[0].length;
      if (token === closing) return { nodes, closed: true };
      if (token.startsWith('[/')) {
        nodes.push({ type: 'text', value: match[0] });
        continue;
      }
      const align = token.slice(1, -1) as 'left' | 'center' | 'right' | 'justify';
      const content = parse(token === '**' ? '**' : `[/${align}]`);
      if (!content.closed) {
        nodes.push({ type: 'text', value: text.slice(match.index, cursor) });
      } else {
        nodes.push(token === '**'
          ? { type: 'bold', children: content.nodes }
          : token === '[u]'
            ? { type: 'underline', children: content.nodes }
            : { type: 'align', align, children: content.nodes });
      }
    }
    return { nodes, closed: false };
  };
  return parse().nodes;
}
