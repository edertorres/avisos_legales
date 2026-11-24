import React, { useEffect, useState, useRef } from 'react';
import { BodyImageAlign, NoticeConfig, SizeOption } from '../types';
import { SAMPLE_SHIELD_LOGO } from '../data/samples';
import { InDesignStepper } from './InDesignStepper';
import { TableEditorModal } from './TableEditorModal';
import { getTableFontSizePt } from './NoticeCanvas';
import { readClipboard } from '../utils/clipboardTables';
import {
  createEmptyTable,
  findTableBlocks,
  parseClipboardTable,
  serializeTable,
  tableAt,
  tableFromGrid,
  type TableBlock,
  type TableModel,
} from '../utils/tableMarkup';
import { CompactStepper } from './CompactStepper';
import { ControlGroup } from './ControlGroup';
import * as ui from './ui';
import { LogoCropEditor } from './LogoCropEditor';
import { cleanPastedText, cleanPastedTextPreservingReturns } from '../utils/textCleaner';
import {
  Upload,
  Image as ImageIcon,
  Ruler,
  Type,
  AlignJustify,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sliders,
  Bold,
  Underline,
  Plus,
  Minus,
  Trash2,
  FileUp,
  Layers,
  BoxSelect,
  Grid,
  WrapText,
  X,
  Crop,
  Highlighter,
} from 'lucide-react';

interface EditorPanelProps {
  config: NoticeConfig;
  onChange: (updated: Partial<NoticeConfig>) => void;
  sizes: SizeOption[];
  onAddCustomSize: (newSize: SizeOption) => void;
  onDeleteCustomSize: (id: string) => void;
  /** Ask the panel to open the table editor for the n-th table of the body (from a canvas click). */
  tableEditRequest?: { index: number; nonce: number } | null;
}

interface TableEditorState {
  initial: TableModel;
  /** The block being edited, or null when inserting a new table at `insertAt`. */
  block: TableBlock | null;
  insertAt: number;
}

/** Insert a block on its own lines at `position`. Returns the new text and the block's end offset. */
function insertBlock(text: string, position: number, block: string): { text: string; end: number } {
  const before = text.slice(0, position);
  const after = text.slice(position);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n' : '';
  const inserted = `${prefix}${block}${suffix}`;
  return { text: before + inserted + after, end: before.length + prefix.length + block.length };
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  config,
  onChange,
  sizes,
  onAddCustomSize,
  onDeleteCustomSize,
  tableEditRequest,
}) => {
  const [tableEditor, setTableEditor] = useState<TableEditorState | null>(null);
  const [cropEditing, setCropEditing] = useState(false);
  // Custom size modal state
  const [customWidth, setCustomWidth] = useState<string>('6.3');
  const [customHeight, setCustomHeight] = useState<string>('3.5');
  const [customName, setCustomName] = useState<string>('');
  const [showAddSizeModal, setShowAddSizeModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onChange({ logoUrl: event.target?.result as string, originalLogoUrl: undefined, logoCrop: undefined });
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  // Text file import handler (.txt)
  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        onChange({ bodyText: cleanPastedTextPreservingReturns(text) });
      };
      reader.readAsText(file);
    }
  };

  // Image upload handler for body: reads file as base64 data URL and adds to bodyImages
  const handleBodyImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const existingSlots = (config.bodyImages || [])
        .map((image) => image.slot || 0)
        .filter((slot) => Number.isFinite(slot));
      const markerSlots = Array.from((config.bodyText || '').matchAll(/##imagen:(\d+)/g))
        .map((match) => parseInt(match[1], 10))
        .filter((slot) => Number.isFinite(slot));
      const nextSlot = Math.max(0, ...existingSlots, ...markerSlots) + 1;
      const newImage = {
        id: `bodyimg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        dataUrl,
        slot: nextSlot,
        align: 'center' as BodyImageAlign,
        widthMm: defaultBodyImageWidthMm,
      };
      if (!bodyTextareaRef.current) {
        const marker = `${config.bodyText && !config.bodyText.endsWith('\n') ? '\n' : ''}##imagen:${newImage.slot}`;
        onChange({
          bodyImages: [...(config.bodyImages || []), newImage],
          bodyText: `${config.bodyText}${marker}`,
        });
        return;
      }

      const textarea = bodyTextareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = config.bodyText;
      const marker = `${start > 0 && current[start - 1] !== '\n' ? '\n' : ''}##imagen:${newImage.slot}`;
      const newText = current.substring(0, start) + marker + current.substring(end);
      onChange({
        bodyImages: [...(config.bodyImages || []), newImage],
        bodyText: newText,
      });

      setTimeout(() => {
        if (bodyTextareaRef.current) {
          bodyTextareaRef.current.focus();
          const pos = start + marker.length;
          bodyTextareaRef.current.setSelectionRange(pos, pos);
        }
      }, 0);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleRemoveBodyImage = (id: string) => {
    const imageIndex = (config.bodyImages || []).findIndex((img) => img.id === id);
    const image = imageIndex >= 0 ? (config.bodyImages || [])[imageIndex] : undefined;
    const markerSlot = image?.slot || (imageIndex >= 0 ? imageIndex + 1 : null);
    const markerRe = markerSlot
      ? new RegExp(`\\n?(?:##image:${id}|##imagen:${markerSlot})\\n?`, 'g')
      : new RegExp(`\\n?##image:${id}\\n?`, 'g');
    onChange({
      bodyImages: (config.bodyImages || []).filter((img) => img.id !== id),
      bodyText: config.bodyText.replace(markerRe, '\n').replace(/\n{3,}/g, '\n\n'),
    });
  };

  const handleUpdateBodyImage = (id: string, updates: { align?: BodyImageAlign; widthMm?: number }) => {
    onChange({
      bodyImages: (config.bodyImages || []).map((img) => (
        img.id === id ? { ...img, ...updates } : img
      )),
    });
  };

  // Paste handler for body text: strips formatting while preserving manual line breaks.
  /**
   * Body paste. In order: a table in the clipboard HTML (Excel, Sheets, Word — keeps merged
   * cells, cells with several lines and text around the table), a tab-separated table in the
   * plain text, and otherwise the cleaned plain text. Inside an existing table block the raw
   * text is pasted as is, so tables are never nested.
   */
  const handleBodyPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const rawText = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    const current = config.bodyText;
    const start = bodyTextareaRef.current?.selectionStart ?? current.length;
    const end = bodyTextareaRef.current?.selectionEnd ?? start;
    const before = current.slice(0, start);
    const after = current.slice(end);

    const commit = (text: string, caret: number) => {
      onChange({ bodyText: text });
      focusBodyAt(caret);
    };

    if (!tableAt(current, start)) {
      const html = readClipboard(e.clipboardData);
      const grid = html?.kind === 'table' ? html.grid : html ? null : parseClipboardTable(rawText);
      if (grid) {
        const result = insertBlock(before + after, start, serializeTable(tableFromGrid(grid)));
        commit(result.text, result.end);
        return;
      }
      if (html?.kind === 'mixed') {
        // Table blocks must sit on their own lines.
        const prefix = before && !before.endsWith('\n') && html.text.startsWith('##table') ? '\n' : '';
        const suffix = after && !after.startsWith('\n') && html.text.endsWith('##/table') ? '\n' : '';
        const inserted = `${prefix}${html.text}${suffix}`;
        commit(before + inserted + after, before.length + inserted.length);
        return;
      }
    }

    const cleaned = cleanPastedTextPreservingReturns(rawText);
    commit(before + cleaned + after, start + cleaned.length);
  };

  // Paste handler for title inputs
  const handleTitlePaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    key: 'headerTitle' | 'subheaderTitle'
  ) => {
    e.preventDefault();
    const rawText = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    const cleaned = cleanPastedText(rawText);
    onChange({ [key]: cleaned });
  };

  // Clean all hard returns from current body text
  const handleCleanBodyReturns = () => {
    if (config.bodyText) {
      onChange({ bodyText: cleanPastedText(config.bodyText) });
    }
  };

  // Wrap the selection while keeping it selected for additional formatting.
  const applyInlineFormatToSelection = (format: 'bold' | 'underline') => {
    if (!bodyTextareaRef.current) return;
    const textarea = bodyTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = config.bodyText.substring(start, end);

    if (!selected) return;

    const before = config.bodyText.substring(0, start);
    const after = config.bodyText.substring(end);
    const opening = format === 'bold' ? '**' : '[u]';
    const closing = format === 'bold' ? '**' : '[/u]';
    const newText = `${before}${opening}${selected}${closing}${after}`;

    onChange({ bodyText: newText });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + opening.length, end + opening.length);
    }, 0);
  };

  // Apply alignment tag around selected text or word under cursor
  const applyAlignmentToSelection = (align: 'left' | 'center' | 'right' | 'justify') => {
    if (!bodyTextareaRef.current) return;
    const textarea = bodyTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const fullText = config.bodyText;

    let selected = fullText.substring(start, end);
    let selStart = start;
    let selEnd = end;

    // If nothing selected, select current word
    if (start === end) {
      const leftPart = fullText.substring(0, start);
      const rightPart = fullText.substring(start);
      const wordStartMatch = leftPart.search(/\S+$/);
      const wordEndMatch = rightPart.search(/\s/);

      selStart = wordStartMatch >= 0 ? wordStartMatch : start;
      selEnd = wordEndMatch >= 0 ? start + wordEndMatch : fullText.length;
      selected = fullText.substring(selStart, selEnd) || 'texto';
    }

    const before = fullText.substring(0, selStart);
    const after = fullText.substring(selEnd);
    const tagged = `[${align}]${selected}[/${align}]`;

    onChange({ bodyText: `${before}${tagged}${after}` });

    setTimeout(() => {
      if (bodyTextareaRef.current) {
        bodyTextareaRef.current.focus();
        bodyTextareaRef.current.setSelectionRange(selStart, selStart + tagged.length);
      }
    }, 0);
  };

  const addUniqueKeyword = (keywords: string[], value: string) => {
    const cleaned = value
      .replace(/\s+/g, ' ')
      .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
      .trim();

    if (cleaned.length < 3) return;
    const normalized = cleaned.toLocaleUpperCase('es-CO');
    if (!keywords.some((kw) => kw.toLocaleUpperCase('es-CO') === normalized)) {
      keywords.push(cleaned);
    }
  };

  // Auto-highlight names and document identifiers as bold keywords.
  const autoHighlightNamesAndDocs = () => {
    const keywords = [...(config.boldKeywords || [])];
    const text = config.bodyText || '';

    const upperPhraseRe = /\b[A-ZÁÉÍÓÚÑ]{3,}(?:[ \t]+(?:DE|DEL|DE LA|LA|LAS|LOS|Y|[A-ZÁÉÍÓÚÑ]{3,})){1,}\b/g;
    for (const match of text.matchAll(upperPhraseRe)) {
      addUniqueKeyword(keywords, match[0]);
    }

    const titledNameRe = /\b(?:señor(?:a)?|sr\.?|sra\.?)[ \t]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[ \t]+(?:de|del|de la|la|las|los|y|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)){1,5})/gi;
    for (const match of text.matchAll(titledNameRe)) {
      addUniqueKeyword(keywords, match[1]);
    }

    const documentRe = /\b(?:NIT|No\.?|N°|C\.?C\.?|cédula(?: de ciudadanía)?(?: No\.?)?)[ \t]*[:#]?[ \t]*[\d. -]{5,}\b/gi;
    for (const match of text.matchAll(documentRe)) {
      addUniqueKeyword(keywords, match[0]);
    }

    const markdownBoldRe = /\*\*([\s\S]*?)\*\*/g;
    for (const match of text.matchAll(markdownBoldRe)) {
      addUniqueKeyword(keywords, match[1]);
    }

    onChange({ boldKeywords: keywords });
  };

  const clearAutoHighlights = () => {
    onChange({ boldKeywords: [] });
  };

  const removeHighlight = (keyword: string) => {
    onChange({ boldKeywords: (config.boldKeywords || []).filter((kw) => kw !== keyword) });
  };

  const highlightedCount = config.boldKeywords?.length || 0;
  const tableFontSizePt = getTableFontSizePt(config);
  const maxBodyImageWidthMm = Math.max(4, config.size.widthCm * 10 - config.marginMm * 2);
  const defaultBodyImageWidthMm = Math.min(25, Math.max(8, maxBodyImageWidthMm));

  // ── Table editor ──
  const openTableEditor = (block: TableBlock | null, insertAt: number) =>
    setTableEditor({ initial: block?.model ?? createEmptyTable(), block, insertAt });

  /** Toolbar button: edit the table under the cursor, or insert a new one there. */
  const handleTableButton = () => {
    const cursor = bodyTextareaRef.current?.selectionStart ?? config.bodyText.length;
    openTableEditor(tableAt(config.bodyText, cursor), cursor);
  };

  useEffect(() => {
    if (!tableEditRequest) return;
    const block = findTableBlocks(config.bodyText)[tableEditRequest.index];
    if (block) openTableEditor(block, block.start);
    // Only react to new requests (nonce), not to text edits.
  }, [tableEditRequest?.nonce]);

  const focusBodyAt = (position: number) => setTimeout(() => {
    bodyTextareaRef.current?.focus();
    bodyTextareaRef.current?.setSelectionRange(position, position);
  }, 0);

  const applyTable = (model: TableModel) => {
    if (!tableEditor) return;
    const block = serializeTable(model);
    const text = config.bodyText;
    if (tableEditor.block) {
      const { start, end } = tableEditor.block;
      onChange({ bodyText: text.slice(0, start) + block + text.slice(end) });
      focusBodyAt(start + block.length);
    } else {
      const result = insertBlock(text, tableEditor.insertAt, block);
      onChange({ bodyText: result.text });
      focusBodyAt(result.end);
    }
    setTableEditor(null);
  };

  const deleteTable = () => {
    if (!tableEditor?.block) return;
    const { start, end } = tableEditor.block;
    const text = config.bodyText;
    onChange({ bodyText: (text.slice(0, start) + text.slice(end)).replace(/\n{3,}/g, '\n\n') });
    focusBodyAt(start);
    setTableEditor(null);
  };

  const handleAddCustomSizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(customWidth.replace(',', '.'));
    const h = parseFloat(customHeight.replace(',', '.'));
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    const name = customName.trim() || `${w} x ${h} cm`;
    const newSizeOption: SizeOption = {
      id: `custom-${Date.now()}`,
      name,
      widthCm: w,
      heightCm: h,
      isCustom: true,
    };

    onAddCustomSize(newSizeOption);
    onChange({ size: newSizeOption });
    setShowAddSizeModal(false);
    setCustomName('');
  };

  // Format buttons keep the textarea selection (mouse down would blur it).
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();
  const toolButton = `${ui.segmented.option(false)} !min-h-8`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Layers className="h-4 w-4 text-stone-500" />
          Contenido del aviso
        </h2>
        <span className="mr-10 hidden text-[11px] text-stone-500 xl:inline">
          Tipografía en la barra de la vista previa
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* Size and margin */}
        <ControlGroup
          title="Tamaño y margen"
          icon={<Ruler className="h-4 w-4" />}
          aside={<span className={ui.chip.neutral}>{config.size.widthCm} × {config.size.heightCm} cm</span>}
        >
          <div className="flex items-center gap-2">
            <select
              value={config.size.id}
              aria-label="Tamaño del aviso"
              onChange={(e) => {
                const selected = sizes.find((sz) => sz.id === e.target.value);
                if (selected) onChange({ size: selected });
              }}
              className={ui.field}
            >
              {sizes.map((sz) => (
                <option key={sz.id} value={sz.id}>
                  {sz.widthCm} × {sz.heightCm} cm — {sz.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAddSizeModal(!showAddSizeModal)}
              aria-expanded={showAddSizeModal}
              className={`${ui.btn.icon} !h-9 !w-9`}
              title="Añadir un tamaño en centímetros"
              aria-label="Añadir tamaño"
            >
              <Plus className="h-4 w-4" />
            </button>
            {config.size.isCustom && (
              <button
                type="button"
                onClick={() => onDeleteCustomSize(config.size.id)}
                className={`${ui.btn.icon} !h-9 !w-9 hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-700`}
                title="Eliminar este tamaño personalizado"
                aria-label="Eliminar tamaño personalizado"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {showAddSizeModal && (
            <form onSubmit={handleAddCustomSizeSubmit} className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className={ui.label}>
                  Ancho (cm)
                  <input type="text" inputMode="decimal" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className={`${ui.field} mt-1 tabular-nums`} required />
                </label>
                <label className={ui.label}>
                  Alto (cm)
                  <input type="text" inputMode="decimal" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className={`${ui.field} mt-1 tabular-nums`} required />
                </label>
              </div>
              <label className={ui.label}>
                Etiqueta (opcional)
                <input type="text" placeholder="Ej: AVISO 6.3x3.5 Especial" value={customName} onChange={(e) => setCustomName(e.target.value)} className={`${ui.field} mt-1`} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddSizeModal(false)} className={ui.btn.ghost}>Cancelar</button>
                <button type="submit" className={ui.btn.primary}>Añadir tamaño</button>
              </div>
            </form>
          )}

          <InDesignStepper
            label="Margen de texto"
            value={config.marginMm}
            onChange={(marginMm) => onChange({ marginMm })}
            min={1}
            max={10}
            step={0.5}
            unit="mm"
            presets={[1, 2, 3, 4, 5]}
            icon={<BoxSelect className="h-3.5 w-3.5 text-stone-500" />}
          />
        </ControlGroup>

        {/* Logo */}
        <ControlGroup
          title="Logo o escudo"
          icon={<ImageIcon className="h-4 w-4" />}
          aside={config.logoUrl ? <span className={ui.chip.ok}>Activo</span> : undefined}
        >
          <div id="editor-logo" tabIndex={-1} className="space-y-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white p-1">
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain grayscale" />
                ) : (
                  <span className="text-center text-[10px] leading-tight text-stone-400">Sin logo</span>
                )}
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <button type="button" onClick={() => logoInputRef.current?.click()} className={ui.btn.secondary}>
                  <Upload className="h-3.5 w-3.5" />
                  {config.logoUrl ? 'Cambiar' : 'Subir imagen'}
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                {config.logoUrl ? (
                  <>
                    <button type="button" onClick={() => setCropEditing(true)} className={ui.btn.secondary}>
                      <Crop className="h-3.5 w-3.5" />
                      Recortar
                    </button>
                    {config.originalLogoUrl && (
                      <button
                        type="button"
                        onClick={() => onChange({ logoUrl: config.originalLogoUrl, originalLogoUrl: undefined, logoCrop: undefined })}
                        className={ui.btn.ghost}
                      >
                        Original
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onChange({ logoUrl: null, originalLogoUrl: undefined, logoCrop: undefined })}
                      className={ui.btn.danger}
                    >
                      Quitar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChange({ logoUrl: SAMPLE_SHIELD_LOGO, originalLogoUrl: undefined, logoCrop: undefined })}
                    className={ui.btn.ghost}
                  >
                    Usar ejemplo
                  </button>
                )}
              </div>
            </div>

            {config.logoUrl && (
              <>
                <InDesignStepper
                  label="Ancho del logo"
                  value={config.logoWidthMm}
                  onChange={(logoWidthMm) => onChange({ logoWidthMm })}
                  min={0.1}
                  max={1000}
                  step={0.1}
                  unit="mm"
                  decimals={1}
                  presets={[8, 10, 12, 15, 18, 25, 40]}
                  icon={<ImageIcon className="h-3.5 w-3.5 text-stone-500" />}
                />

                <div>
                  <span className={ui.label}>Posición</span>
                  <div className={`${ui.segmented.group} flex w-full`} role="group" aria-label="Posición del logo">
                    {[
                      { pos: 'left', label: 'Izquierda' },
                      { pos: 'right', label: 'Derecha' },
                      { pos: 'top-center', label: 'Arriba centrado' },
                    ].map((opt) => {
                      const active = (config.logoPosition || 'left') === opt.pos;
                      return (
                        <button
                          key={opt.pos}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onChange({ logoPosition: opt.pos as NoticeConfig['logoPosition'] })}
                          className={`${ui.segmented.option(active)} flex-1`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(config.logoPosition || 'left') !== 'top-center' && (
                  <div>
                    <span className={ui.label}>Alineación vertical</span>
                    <div className={`${ui.segmented.group} flex w-full`} role="group" aria-label="Alineación vertical del logo">
                      {[
                        { value: 'body', label: 'Con el texto' },
                        { value: 'titles-top', label: 'Con los títulos' },
                      ].map((opt) => {
                        const active = (config.logoVerticalAlign || 'body') === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange({ logoVerticalAlign: opt.value as NoticeConfig['logoVerticalAlign'] })}
                            className={`${ui.segmented.option(active)} flex-1`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ControlGroup>

        {/* Titles and body */}
        <ControlGroup title="Textos" icon={<Type className="h-4 w-4" />}>
          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="editor-headerTitle" className={`${ui.label} !mb-0`}>Título 1</label>
              <CompactStepper label="Tamaño" value={config.headerFontSizePt} onChange={(headerFontSizePt) => onChange({ headerFontSizePt })} min={5} max={24} step={0.5} unit="pt" />
            </div>
            <input
              id="editor-headerTitle"
              type="text"
              value={config.headerTitle}
              onChange={(e) => onChange({ headerTitle: e.target.value })}
              onPaste={(e) => handleTitlePaste(e, 'headerTitle')}
              placeholder="Ej: AVISO ÚNICO, EDICTO, CITACIÓN"
              className={`${ui.field} text-center font-semibold`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="editor-subheaderTitle" className={`${ui.label} !mb-0`}>Título 2</label>
              <CompactStepper label="Tamaño" value={config.subheaderFontSizePt} onChange={(subheaderFontSizePt) => onChange({ subheaderFontSizePt })} min={4.5} max={18} step={0.5} unit="pt" />
            </div>
            <textarea
              id="editor-subheaderTitle"
              rows={2}
              value={config.subheaderTitle}
              onChange={(e) => onChange({ subheaderTitle: e.target.value })}
              onPaste={(e) => handleTitlePaste(e, 'subheaderTitle')}
              placeholder="Ej: LA DIRECTORA DE TALENTO HUMANO DEL DEPARTAMENTO DE RISARALDA"
              className={`${ui.field} resize-none text-center`}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="editor-bodyText" className={ui.label}>Cuerpo del texto</label>

            {/* Format toolbar, grouped by purpose */}
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Formato del cuerpo">
              <div className={ui.segmented.group}>
                <button type="button" onMouseDown={keepSelection} onClick={() => applyInlineFormatToSelection('bold')} className={toolButton} title="Negrita en la selección" aria-label="Negrita">
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button type="button" onMouseDown={keepSelection} onClick={() => applyInlineFormatToSelection('underline')} className={toolButton} title="Subrayar la selección" aria-label="Subrayado">
                  <Underline className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className={ui.segmented.group} title="Alinear solo la selección">
                {[
                  { align: 'left' as const, icon: AlignLeft, label: 'Alinear selección a la izquierda' },
                  { align: 'center' as const, icon: AlignCenter, label: 'Centrar selección' },
                  { align: 'right' as const, icon: AlignRight, label: 'Alinear selección a la derecha' },
                  { align: 'justify' as const, icon: AlignJustify, label: 'Justificar selección' },
                ].map(({ align, icon: Icon, label }) => (
                  <button key={align} type="button" onMouseDown={keepSelection} onClick={() => applyAlignmentToSelection(align)} className={toolButton} title={label} aria-label={label}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>

              <div className={ui.segmented.group}>
                <button type="button" onClick={handleCleanBodyReturns} className={toolButton} title="Unir líneas y quitar retornos de carro">
                  <WrapText className="h-3.5 w-3.5" /> Sin retornos
                </button>
                <button type="button" onClick={autoHighlightNamesAndDocs} className={toolButton} title="Detectar nombres, frases en mayúsculas y documentos para ponerlos en negrita">
                  <Highlighter className="h-3.5 w-3.5" /> Resaltar nombres{highlightedCount > 0 ? ` (${highlightedCount})` : ''}
                </button>
              </div>

              <div className={ui.segmented.group}>
                <button type="button" onClick={() => fileInputRef.current?.click()} className={toolButton} title="Importar un archivo de texto (.txt)">
                  <FileUp className="h-3.5 w-3.5" /> .TXT
                </button>
                <button
                  type="button"
                  onMouseDown={keepSelection}
                  onClick={handleTableButton}
                  className={toolButton}
                  title="Insertar una tabla, o editar la tabla donde está el cursor. También puedes pegar una tabla de Excel o Word directamente en el texto."
                >
                  <Grid className="h-3.5 w-3.5" /> Tabla
                </button>
                <button type="button" onClick={() => bodyImageInputRef.current?.click()} className={toolButton} title="Insertar una imagen (raster o SVG) en el cursor">
                  <ImageIcon className="h-3.5 w-3.5" /> Imagen
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept=".txt" onChange={handleTextFileUpload} className="hidden" />
              <input ref={bodyImageInputRef} type="file" accept="image/*,.svg" onChange={handleBodyImageUpload} className="hidden" />
            </div>

            <textarea
              id="editor-bodyText"
              ref={bodyTextareaRef}
              rows={10}
              value={config.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              onPaste={handleBodyPaste}
              placeholder="Pega o escribe aquí el texto del aviso..."
              className={`${ui.field} leading-relaxed`}
            />

            {highlightedCount > 0 && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-stone-700">Negritas automáticas ({highlightedCount})</span>
                  <button type="button" onClick={clearAutoHighlights} className={`${ui.btn.ghost} !min-h-6 !py-0.5 text-xs`}>
                    Quitar todas
                  </button>
                </div>
                <ul className="flex max-h-28 flex-wrap gap-1 overflow-y-auto" aria-label="Palabras en negrita automática">
                  {(config.boldKeywords || []).map((keyword) => (
                    <li key={keyword} className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-300 bg-white py-0.5 pl-2 pr-0.5 text-[11px] font-semibold text-stone-800">
                      <span className="truncate">{keyword}</span>
                      <button
                        type="button"
                        onClick={() => removeHighlight(keyword)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-rose-100 hover:text-rose-700"
                        title={`Quitar negrita de «${keyword}»`}
                        aria-label={`Quitar negrita de ${keyword}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer font-medium text-stone-600">Marcas de formato</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Al pegar se elimina el formato y se conservan los saltos de línea.</li>
                <li><code>**texto**</code> negrita · <code>[u]texto[/u]</code> subrayado · <code>[center]…[/center]</code> alineación.</li>
                <li>Tablas: botón Tabla, clic en la tabla de la vista previa, o pega una tabla de Excel/Word. Se guardan como <code>##table</code> … <code>##/table</code> con filas <code>| a | b |</code>.</li>
                <li>Imagen: el botón Imagen inserta <code>##imagen:N</code> en el cursor.</li>
              </ul>
            </details>

            {(config.bodyImages || []).length > 0 && (
              <div className="space-y-2 pt-1">
                <span className={ui.label}>Imágenes del aviso ({(config.bodyImages || []).length})</span>
                {(config.bodyImages || []).map((img, idx) => {
                  const width = img.widthMm || defaultBodyImageWidthMm;
                  return (
                    <div key={img.id} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
                      <img src={img.dataUrl} alt={img.name} className="h-14 w-14 shrink-0 rounded border border-stone-200 bg-white object-contain p-1" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="truncate text-xs font-medium text-stone-700">{img.name}</div>
                        <code className="text-[10px] text-stone-500">##imagen:{img.slot || idx + 1}</code>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className={ui.segmented.group} role="group" aria-label="Alineación de la imagen">
                            {[
                              { align: 'left' as BodyImageAlign, icon: AlignLeft, label: 'Izquierda' },
                              { align: 'center' as BodyImageAlign, icon: AlignCenter, label: 'Centro' },
                              { align: 'right' as BodyImageAlign, icon: AlignRight, label: 'Derecha' },
                            ].map((item) => {
                              const Icon = item.icon;
                              const active = (img.align || 'center') === item.align;
                              return (
                                <button
                                  key={item.align}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => handleUpdateBodyImage(img.id, { align: item.align })}
                                  className={ui.segmented.option(active)}
                                  title={`Alinear imagen a ${item.label.toLowerCase()}`}
                                  aria-label={`Alinear imagen a ${item.label.toLowerCase()}`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </button>
                              );
                            })}
                          </div>
                          <CompactStepper
                            label="Ancho"
                            value={Math.min(width, maxBodyImageWidthMm)}
                            onChange={(widthMm) => handleUpdateBodyImage(img.id, { widthMm })}
                            min={4}
                            max={maxBodyImageWidthMm}
                            step={1}
                            unit="mm"
                            decimals={1}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveBodyImage(img.id)}
                        className={`${ui.btn.icon} hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-700`}
                        title="Eliminar imagen"
                        aria-label={`Eliminar imagen ${img.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ControlGroup>

        {/* Fine adjustments (font, body size, leading and alignment live in the preview toolbar) */}
        <ControlGroup title="Ajustes finos" icon={<Sliders className="h-4 w-4" />} defaultOpen={false}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InDesignStepper
              label="Tamaño de tabla"
              value={tableFontSizePt}
              onChange={(tableFontSizePt) => onChange({ tableFontSizePt })}
              min={3.5}
              max={12}
              step={0.25}
              unit="pt"
              presets={[4, 4.5, 5, 5.5, 6]}
              icon={<Grid className="h-3.5 w-3.5 text-stone-500" />}
            />
            <InDesignStepper
              label="Grosor del borde"
              value={config.borderWidthPx}
              onChange={(borderWidthPx) => onChange({ borderWidthPx })}
              min={0.25}
              max={4}
              step={0.25}
              unit="px"
              presets={[0.5, 1.0, 1.5, 2.0]}
              icon={<BoxSelect className="h-3.5 w-3.5 text-stone-500" />}
            />
            <div className="sm:col-span-2">
              <InDesignStepper
                label="Espaciado entre letras"
                value={config.letterSpacingMm ?? 0}
                onChange={(letterSpacingMm) => onChange({ letterSpacingMm })}
                min={-0.3}
                max={0.3}
                step={0.02}
                unit="mm"
                presets={[-0.15, -0.1, -0.05, 0, 0.05]}
                icon={<Type className="h-3.5 w-3.5 text-stone-500" />}
              />
            </div>
          </div>
        </ControlGroup>
      </div>
      {tableEditor && (
        <TableEditorModal
          initial={tableEditor.initial}
          isExisting={tableEditor.block !== null}
          fontFamily={config.fontFamily}
          fontSizePt={tableFontSizePt}
          onApply={applyTable}
          onDelete={deleteTable}
          onCancel={() => setTableEditor(null)}
        />
      )}
      {cropEditing && config.logoUrl && <LogoCropEditor
        src={config.originalLogoUrl || config.logoUrl} initialCrop={config.logoCrop}
        onCancel={() => setCropEditing(false)}
        onApply={(logoUrl, logoCrop) => {
          onChange({ logoUrl, logoCrop, originalLogoUrl: config.originalLogoUrl || config.logoUrl! });
          setCropEditing(false);
        }}
      />}
    </div>
  );
};
