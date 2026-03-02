import React, { useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, Save, Table2, Loader2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  addInventoryBatch,
  InventoryBatchInsertResult,
  InventoryBatchRowInput
} from '../services/supabaseService';

interface InventoryBatchAddModalProps {
  onClose: () => void;
  onSaved: (result: InventoryBatchInsertResult) => void;
}

interface BatchRow {
  id: number;
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  shelf: string;
}

interface ActiveCell {
  row: number;
  col: number;
}

const COLUMN_KEYS: Array<keyof Omit<BatchRow, 'id'>> = [
  'partNumber',
  'name',
  'brand',
  'application',
  'shelf'
];
const COLUMN_COUNT = COLUMN_KEYS.length;

const createEmptyRow = (id: number): BatchRow => ({
  id,
  partNumber: '',
  name: '',
  brand: '',
  application: '',
  shelf: ''
});

const createRows = (startId: number, count: number): BatchRow[] =>
  Array.from({ length: count }).map((_, idx) => createEmptyRow(startId + idx));

export const InventoryBatchAddModal: React.FC<InventoryBatchAddModalProps> = ({
  onClose,
  onSaved
}) => {
  const { selectedStore } = useStore();
  const [rows, setRows] = useState<BatchRow[]>(() => createRows(1, 20));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [activeCell, setActiveCell] = useState<ActiveCell>({ row: 0, col: 0 });

  const nextId = useMemo(() => (rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 1), [rows]);

  const updateCell = (rowId: number, key: keyof Omit<BatchRow, 'id'>, value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          [key]: key === 'partNumber' ? value.toUpperCase() : value
        };
      })
    );
  };

  const addRows = (count = 5) => {
    setRows((prev) => [...prev, ...createRows(nextId, count)]);
  };

  const deleteRow = (rowId: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    startColIndex: number
  ) => {
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    applyPastedText(text, startRowIndex, startColIndex);
  };

  const focusCell = (rowIndex: number, colIndex: number) => {
    const safeRow = Math.max(0, Math.min(rows.length - 1, rowIndex));
    const safeCol = Math.max(0, Math.min(COLUMN_COUNT - 1, colIndex));
    const target = inputRefs.current[safeRow * COLUMN_COUNT + safeCol];
    if (!target) return;
    target.focus();
    setTimeout(() => target.select?.(), 0);
    setActiveCell({ row: safeRow, col: safeCol });
  };

  const applyPastedText = (rawText: string, startRowIndex: number, startColIndex: number) => {
    const matrix = rawText
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.split('\t'));

    while (matrix.length > 0 && matrix[matrix.length - 1].every((cell) => cell === '')) {
      matrix.pop();
    }

    if (matrix.length === 0) return;

    setRows((prev) => {
      const requiredRows = startRowIndex + matrix.length;
      const draft = [...prev];

      if (draft.length < requiredRows) {
        const firstId = draft.length ? Math.max(...draft.map((row) => row.id)) + 1 : 1;
        draft.push(...createRows(firstId, requiredRows - draft.length));
      }

      matrix.forEach((cells, rowOffset) => {
        const targetRow = draft[startRowIndex + rowOffset];
        if (!targetRow) return;

        cells.forEach((rawValue, colOffset) => {
          const targetCol = startColIndex + colOffset;
          if (targetCol >= COLUMN_COUNT) return;
          const key = COLUMN_KEYS[targetCol];
          const value = rawValue.trim();
          (targetRow as any)[key] = key === 'partNumber' ? value.toUpperCase() : value;
        });
      });

      return draft;
    });

    const lastColWidth = matrix.reduce((max, cells) => Math.max(max, cells.length), 1);
    const nextRow = startRowIndex + matrix.length - 1;
    const nextCol = Math.min(COLUMN_COUNT - 1, startColIndex + Math.max(0, lastColWidth - 1));
    setActiveCell({ row: nextRow, col: nextCol });
  };

  const handleTablePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target instanceof HTMLInputElement) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    applyPastedText(text, activeCell.row, activeCell.col);
    focusCell(activeCell.row, activeCell.col);
  };

  const buildCopyText = () => {
    let lastFilledIndex = -1;
    rows.forEach((row, idx) => {
      const hasValue = COLUMN_KEYS.some((key) => ((row as any)[key] || '').toString().trim() !== '');
      if (hasValue) lastFilledIndex = idx;
    });
    if (lastFilledIndex < 0) return '';

    return rows
      .slice(0, lastFilledIndex + 1)
      .map((row) => COLUMN_KEYS.map((key) => (((row as any)[key] || '') as string)).join('\t'))
      .join('\n');
  };

  const handleTableCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement | null;
    if (target && target.selectionStart !== null && target.selectionEnd !== null && target.selectionStart !== target.selectionEnd) {
      return;
    }

    const text = buildCopyText();
    if (!text) return;

    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (e.key) {
      case 'ArrowLeft':
        nextCol = Math.max(0, colIndex - 1);
        break;
      case 'ArrowRight':
        nextCol = Math.min(COLUMN_COUNT - 1, colIndex + 1);
        break;
      case 'ArrowUp':
        nextRow = Math.max(0, rowIndex - 1);
        break;
      case 'ArrowDown':
        nextRow = Math.min(rows.length - 1, rowIndex + 1);
        break;
      default:
        return;
    }

    if (nextRow === rowIndex && nextCol === colIndex) return;
    e.preventDefault();
    focusCell(nextRow, nextCol);
  };

  const handleSave = async () => {
    if (saving) return;
    setError('');

    const payload: InventoryBatchRowInput[] = rows.map((row) => ({
      partNumber: row.partNumber,
      name: row.name,
      brand: row.brand,
      application: row.application,
      shelf: row.shelf
    }));

    const hasInput = payload.some((row) =>
      [row.partNumber, row.name, row.brand, row.application, row.shelf].some((v) => (v || '').trim() !== '')
    );

    if (!hasInput) {
      setError('Belum ada data yang diisi.');
      return;
    }

    setSaving(true);
    try {
      const result = await addInventoryBatch(payload, selectedStore);
      if (result.inserted <= 0 && result.errors.length > 0) {
        setError(result.errors.slice(0, 3).join(' | '));
        return;
      }
      if (result.inserted <= 0 && result.skippedInvalid > 0) {
        setError('Tidak ada data valid untuk disimpan. Pastikan PART NUMBER dan NAMA BARANG terisi.');
        return;
      }
      onSaved(result);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Gagal simpan batch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-7xl bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm md:text-base font-bold text-gray-100 flex items-center gap-2">
              <Table2 size={16} className="text-cyan-400" />
              Tambah Barang Batch ({(selectedStore || 'mjm').toUpperCase()})
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Isi tabel seperti Excel. Bisa paste langsung dari Excel (Ctrl+V).
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 md:p-4">
          <div
            className="overflow-auto border border-gray-700 rounded-xl max-h-[60vh]"
            onPasteCapture={handleTablePaste}
            onCopyCapture={handleTableCopy}
          >
            <table className="w-full min-w-[980px] text-xs">
              <thead className="sticky top-0 z-10 bg-gray-900">
                <tr className="text-gray-300 uppercase text-[10px] tracking-wide">
                  <th className="px-2 py-2 border-b border-gray-700 w-[56px] text-center">#</th>
                  <th className="px-2 py-2 border-b border-gray-700 text-left">Part Number</th>
                  <th className="px-2 py-2 border-b border-gray-700 text-left">Nama Barang</th>
                  <th className="px-2 py-2 border-b border-gray-700 text-left">Brand</th>
                  <th className="px-2 py-2 border-b border-gray-700 text-left">Aplikasi</th>
                  <th className="px-2 py-2 border-b border-gray-700 text-left">Rak</th>
                  <th className="px-2 py-2 border-b border-gray-700 w-[70px] text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className="border-b border-gray-800 last:border-b-0">
                    <td className="px-2 py-1 text-center text-gray-500 font-mono">{rowIndex + 1}</td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          inputRefs.current[rowIndex * COLUMN_COUNT + 0] = el;
                        }}
                        value={row.partNumber}
                        onChange={(e) => updateCell(row.id, 'partNumber', e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIndex, col: 0 })}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 0)}
                        onPaste={(e) => handlePaste(e, rowIndex, 0)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-gray-100 outline-none focus:border-cyan-500"
                        placeholder="PART NUMBER"
                        disabled={saving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          inputRefs.current[rowIndex * COLUMN_COUNT + 1] = el;
                        }}
                        value={row.name}
                        onChange={(e) => updateCell(row.id, 'name', e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIndex, col: 1 })}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 1)}
                        onPaste={(e) => handlePaste(e, rowIndex, 1)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-gray-100 outline-none focus:border-cyan-500"
                        placeholder="NAMA BARANG"
                        disabled={saving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          inputRefs.current[rowIndex * COLUMN_COUNT + 2] = el;
                        }}
                        value={row.brand}
                        onChange={(e) => updateCell(row.id, 'brand', e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIndex, col: 2 })}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 2)}
                        onPaste={(e) => handlePaste(e, rowIndex, 2)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-gray-100 outline-none focus:border-cyan-500"
                        placeholder="BRAND"
                        disabled={saving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          inputRefs.current[rowIndex * COLUMN_COUNT + 3] = el;
                        }}
                        value={row.application}
                        onChange={(e) => updateCell(row.id, 'application', e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIndex, col: 3 })}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 3)}
                        onPaste={(e) => handlePaste(e, rowIndex, 3)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-gray-100 outline-none focus:border-cyan-500"
                        placeholder="APLIKASI"
                        disabled={saving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          inputRefs.current[rowIndex * COLUMN_COUNT + 4] = el;
                        }}
                        value={row.shelf}
                        onChange={(e) => updateCell(row.id, 'shelf', e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIndex, col: 4 })}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 4)}
                        onPaste={(e) => handlePaste(e, rowIndex, 4)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-gray-100 outline-none focus:border-cyan-500"
                        placeholder="RAK"
                        disabled={saving}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => deleteRow(row.id)}
                        disabled={saving || rows.length <= 1}
                        className="p-1.5 rounded-md text-red-400 hover:bg-red-900/30 disabled:opacity-40"
                        title="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 rounded-lg border border-red-800 bg-red-900/20 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
            <button
              onClick={() => addRows(5)}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium disabled:opacity-50"
            >
              <Plus size={15} />
              Tambah 5 Baris
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Simpan Massal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
