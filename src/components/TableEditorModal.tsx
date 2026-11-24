import React, { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Grid, Minus, Plus, Trash2, X } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { readClipboard } from '../utils/clipboardTables';
import { NoticeTable } from './NoticeCanvas';
import * as ui from './ui';
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  defaultAlign,
  parseClipboardTable,
  type TableAlign,
  type TableModel,
} from '../utils/tableMarkup';

interface TableEditorModalProps {
  initial: TableModel;
  /** Editing an existing table (enables "Eliminar tabla"). */
  isExisting: boolean;
  fontFamily: string;
  fontSizePt: number;
  onApply: (model: TableModel) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const ALIGN_OPTIONS: { value: TableAlign; icon: typeof AlignLeft; label: string }[] = [
  { value: 'left', icon: AlignLeft, label: 'izquierda' },
  { value: 'center', icon: AlignCenter, label: 'centro' },
  { value: 'right', icon: AlignRight, label: 'derecha' },
];

/** Remove trailing rows that are completely empty (keep at least one row). */
function trimEmptyRows(rows: string[][]): string[][] {
  const result = [...rows];
  while (result.length > 1 && result[result.length - 1].every((cell) => cell.trim() === '')) result.pop();
  return result;
}

/** Spreadsheet-like grid editor for a ##table block. */
export function TableEditorModal({ initial, isExisting, fontFamily, fontSizePt, onApply, onDelete, onCancel }: TableEditorModalProps) {
  const [model, setModel] = useState<TableModel>(initial);
  const [focusCell, setFocusCell] = useState<[number, number] | null>([0, 0]);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const columns = model.rows[0]?.length ?? 1;
  const hasContent = model.rows.some((row) => row.some((cell) => cell.trim() !== ''));

  useEffect(() => {
    if (!focusCell) return;
    const input = cellRefs.current.get(`${focusCell[0]}-${focusCell[1]}`);
    input?.focus();
    input?.select();
    setFocusCell(null);
  }, [focusCell, model.rows.length, columns]);

  const updateRows = (rows: string[][], align = model.align) =>
    setModel((prev) => ({ ...prev, rows, align: Array.from({ length: rows[0].length }, (_, i) => align[i] ?? defaultAlign(rows[0].length)[i]) }));

  const setCell = (row: number, column: number, value: string) =>
    updateRows(model.rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells)));

  const addRow = (at = model.rows.length) => {
    if (model.rows.length >= MAX_TABLE_ROWS) return;
    const rows = [...model.rows];
    rows.splice(at, 0, Array.from({ length: columns }, () => ''));
    updateRows(rows);
    return at;
  };

  const addColumn = () => {
    if (columns >= MAX_TABLE_COLUMNS) return;
    updateRows(model.rows.map((cells) => [...cells, '']), [...model.align, 'center']);
  };

  const removeRow = (row: number) => {
    if (model.rows.length <= 1) return;
    updateRows(model.rows.filter((_, r) => r !== row));
  };

  const removeColumn = (column: number) => {
    if (columns <= 1) return;
    updateRows(model.rows.map((cells) => cells.filter((_, c) => c !== column)), model.align.filter((_, c) => c !== column));
  };

  const setAlign = (column: number, value: TableAlign) =>
    setModel((prev) => ({ ...prev, align: prev.align.map((current, c) => (c === column ? value : current)) }));

  /** Paste a block copied from a spreadsheet starting at this cell, growing the grid if needed. */
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    const text = event.clipboardData.getData('text/plain');
    // Prefer the clipboard HTML (merged cells, multi-line cells); then tab-separated text,
    // including a single copied row.
    const html = readClipboard(event.clipboardData);
    const grid = (html?.kind === 'table' ? html.grid : html?.grids[0])
      ?? parseClipboardTable(text)
      ?? (text.includes('\t') ? [text.replace(/\r?\n$/, '').split('\t')] : null);
    if (!grid) return;
    event.preventDefault();
    const neededRows = Math.min(MAX_TABLE_ROWS, Math.max(model.rows.length, row + grid.length));
    const neededColumns = Math.min(MAX_TABLE_COLUMNS, Math.max(columns, column + Math.max(...grid.map((r) => r.length))));
    const rows = Array.from({ length: neededRows }, (_, r) =>
      Array.from({ length: neededColumns }, (_, c) => {
        const pasted = grid[r - row]?.[c - column];
        return pasted !== undefined && r >= row && c >= column ? pasted.trim() : model.rows[r]?.[c] ?? '';
      }),
    );
    updateRows(rows);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const nextRow = row + (event.shiftKey ? -1 : 1);
    if (nextRow < 0) return;
    if (nextRow >= model.rows.length && addRow() === undefined) return;
    setFocusCell([nextRow, column]);
  };

  const apply = () => onApply({ ...model, rows: trimEmptyRows(model.rows) });

  return (
    <ModalShell
      title={isExisting ? 'Editar tabla' : 'Insertar tabla'}
      subtitle="Pega desde Excel o Word en cualquier celda · Intro baja a la fila siguiente"
      icon={<Grid className="h-5 w-5" />}
      onClose={onCancel}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          {isExisting && onDelete && (
            <button type="button" onClick={onDelete} className={`${ui.btn.danger} mr-auto`}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar tabla
            </button>
          )}
          <button type="button" onClick={onCancel} className={ui.btn.secondary}>Cancelar</button>
          <button type="button" onClick={apply} disabled={!hasContent} className={ui.btn.primary}>
            {isExisting ? 'Aplicar cambios' : 'Insertar tabla'}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        {/* Table options */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={model.header}
              onChange={(e) => setModel((prev) => ({ ...prev, header: e.target.checked }))}
              className="h-4 w-4 rounded accent-accent-700"
            />
            Primera fila es encabezado
          </label>
          <div className="flex items-center gap-2 text-sm text-stone-700">
            Ancho
            <div className={ui.segmented.group} role="group" aria-label="Ancho de la tabla">
              {([['auto', 'Ajustado al contenido'], ['full', 'Todo el ancho']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={model.width === value}
                  onClick={() => setModel((prev) => ({ ...prev, width: value }))}
                  className={ui.segmented.option(model.width === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="ml-auto text-xs tabular-nums text-stone-500">
            {model.rows.length} × {columns} · máx. {MAX_TABLE_ROWS} × {MAX_TABLE_COLUMNS}
          </span>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="bg-stone-50">
                {Array.from({ length: columns }, (_, column) => (
                  <th key={column} className="border-b border-stone-200 px-1.5 py-1.5 font-normal">
                    <div className="flex items-center justify-between gap-1">
                      <div className={ui.segmented.group} role="group" aria-label={`Alineación de la columna ${column + 1}`}>
                        {ALIGN_OPTIONS.map(({ value, icon: Icon, label }) => (
                          <button
                            key={value}
                            type="button"
                            tabIndex={-1}
                            aria-pressed={model.align[column] === value}
                            onClick={() => setAlign(column, value)}
                            className={ui.segmented.option(model.align[column] === value)}
                            title={`Columna ${column + 1}: ${label}`}
                            aria-label={`Columna ${column + 1}: alinear a la ${label}`}
                          >
                            <Icon className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => removeColumn(column)}
                        disabled={columns <= 1}
                        className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                        title={`Eliminar columna ${column + 1}`}
                        aria-label={`Eliminar columna ${column + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-8 border-b border-stone-200" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {model.rows.map((cells, row) => {
                const isHeader = model.header && row === 0;
                return (
                  <tr key={row} className={isHeader ? 'bg-accent-50/50' : ''}>
                    {cells.map((cell, column) => (
                      <td key={column} className="border-b border-r border-stone-100 p-0">
                        <input
                          ref={(el) => {
                            if (el) cellRefs.current.set(`${row}-${column}`, el);
                            else cellRefs.current.delete(`${row}-${column}`);
                          }}
                          value={cell}
                          onChange={(e) => setCell(row, column, e.target.value)}
                          onPaste={(e) => handlePaste(e, row, column)}
                          onKeyDown={(e) => handleKeyDown(e, row, column)}
                          aria-label={`Fila ${row + 1}, columna ${column + 1}${isHeader ? ' (encabezado)' : ''}`}
                          className={`w-full min-w-[8rem] bg-transparent px-2 py-1.5 text-stone-900 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-accent-500 ${isHeader ? 'font-semibold' : ''}`}
                          style={{ textAlign: model.align[column] }}
                        />
                      </td>
                    ))}
                    <td className="border-b border-stone-100 px-1 text-center">
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => removeRow(row)}
                        disabled={model.rows.length <= 1}
                        className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                        title={`Eliminar fila ${row + 1}`}
                        aria-label={`Eliminar fila ${row + 1}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { const at = addRow(); if (at !== undefined) setFocusCell([at, 0]); }} disabled={model.rows.length >= MAX_TABLE_ROWS} className={ui.btn.secondary}>
            <Plus className="h-3.5 w-3.5" /> Fila
          </button>
          <button type="button" onClick={addColumn} disabled={columns >= MAX_TABLE_COLUMNS} className={ui.btn.secondary}>
            <Plus className="h-3.5 w-3.5" /> Columna
          </button>
        </div>

        {/* Live preview at print proportions, enlarged for reading */}
        <div>
          <span className={ui.label}>Vista previa (ampliada)</span>
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-3">
            <div style={{ zoom: 2.2, textAlign: 'center', color: 'black' }}>
              <NoticeTable model={model} fontFamily={fontFamily} fontSizePt={fontSizePt} />
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
