// FILE: components/online/FotoUploadModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Upload, Loader2, Check, AlertCircle, Search } from 'lucide-react';
import XLSX from '../../services/xlsx';
import { 
  fetchAllPartNumbersMJM, 
  checkExistingFotoPartNumbers, 
  insertFotoBatch, 
  insertFotoLinkBatch,
  FotoProdukRow,
  FotoLinkRow
} from '../../services/supabaseService';

interface UploadRow {
  id: string;
  part_number: string;
  nama_csv: string;
  foto_1: string;
  foto_2: string;
  foto_3: string;
  foto_4: string;
  foto_5: string;
  foto_6: string;
  foto_7: string;
  foto_8: string;
  foto_9: string;
  foto_10: string;
  status: 'pending' | 'skip' | 'need_input' | 'ready' | 'error';
  message?: string;
}

interface PartNumberOption {
  part_number: string;
  name: string;
}

interface FotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Autocomplete Dropdown Component
const AutocompleteDropdown: React.FC<{
  options: PartNumberOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ options, value, onChange, placeholder = "Pilih Part Number..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Safe options dengan null check
  const safeOptions = options || [];

  const filteredOptions = useMemo(() => {
    if (!safeOptions.length) return [];
    if (!search.trim()) return safeOptions.slice(0, 100); // Limit awal
    const lowerSearch = search.toLowerCase();
    return safeOptions
      .filter(o => 
        (o.part_number || '').toLowerCase().includes(lowerSearch) || 
        (o.name || '').toLowerCase().includes(lowerSearch)
      )
      .slice(0, 100);
  }, [safeOptions, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = safeOptions.find(o => o.part_number === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center gap-1 px-2 py-1 bg-gray-700 border rounded cursor-pointer text-xs ${
          isOpen ? 'border-cyan-500' : 'border-gray-600'
        } ${value ? 'text-gray-200' : 'text-gray-500'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate flex-1">
          {selectedOption ? selectedOption.part_number : placeholder}
        </span>
        <Search size={12} className="text-gray-500 flex-shrink-0" />
      </div>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari part number..."
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 focus:border-cyan-500 outline-none"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {safeOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                Memuat data...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                Tidak ditemukan
              </div>
            ) : (
              filteredOptions.map(opt => (
                <div
                  key={opt.part_number}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-gray-700 ${
                    opt.part_number === value ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-300'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.part_number);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  <div className="font-mono font-medium">{opt.part_number}</div>
                  <div className="text-[10px] text-gray-500 truncate">{opt.name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FotoUploadModal: React.FC<FotoUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [partNumberOptions, setPartNumberOptions] = useState<PartNumberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const itemsPerPage = 100;

  // Load part number options saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      loadPartNumberOptions();
    }
  }, [isOpen]);

  const loadPartNumberOptions = async () => {
    const data = await fetchAllPartNumbersMJM();
    setPartNumberOptions(data);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        setError('File kosong atau format tidak valid');
        setLoading(false);
        return;
      }

      // Parse rows
      const parsedRows: UploadRow[] = jsonData.map((row, idx) => ({
        id: `row-${idx}`,
        part_number: String(row.part_number || row.Part_Number || row.PART_NUMBER || row.PartNumber || '').trim(),
        nama_csv: String(row.nama_csv || row.Nama_CSV || row.NAMA_CSV || row.NamaCSV || row.nama || row.Nama || '').trim(),
        foto_1: String(row.foto_1 || row.Foto_1 || row.FOTO_1 || '').trim(),
        foto_2: String(row.foto_2 || row.Foto_2 || row.FOTO_2 || '').trim(),
        foto_3: String(row.foto_3 || row.Foto_3 || row.FOTO_3 || '').trim(),
        foto_4: String(row.foto_4 || row.Foto_4 || row.FOTO_4 || '').trim(),
        foto_5: String(row.foto_5 || row.Foto_5 || row.FOTO_5 || '').trim(),
        foto_6: String(row.foto_6 || row.Foto_6 || row.FOTO_6 || '').trim(),
        foto_7: String(row.foto_7 || row.Foto_7 || row.FOTO_7 || '').trim(),
        foto_8: String(row.foto_8 || row.Foto_8 || row.FOTO_8 || '').trim(),
        foto_9: String(row.foto_9 || row.Foto_9 || row.FOTO_9 || '').trim(),
        foto_10: String(row.foto_10 || row.Foto_10 || row.FOTO_10 || '').trim(),
        status: 'pending',
      }));

      // Check existing di Supabase
      const allPartNumbers = parsedRows.map(r => r.part_number).filter(Boolean);
      const existingSet = await checkExistingFotoPartNumbers(allPartNumbers);

      // Update status
      const updatedRows = parsedRows.map(row => {
        if (!row.part_number) {
          return { ...row, status: 'need_input' as const, message: 'Part number kosong, pilih dari dropdown' };
        }
        if (existingSet.has(row.part_number)) {
          return { ...row, status: 'skip' as const, message: 'Sudah ada di database' };
        }
        return { ...row, status: 'ready' as const };
      });

      setRows(updatedRows);
    } catch (err: any) {
      console.error('Parse file error:', err);
      setError('Gagal membaca file: ' + (err.message || 'Format tidak valid'));
    } finally {
      setLoading(false);
    }
  };

  const handlePartNumberChange = (rowId: string, newPartNumber: string) => {
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      
      // Check apakah part number baru sudah ada di database atau di rows lain
      const isDuplicate = prev.some(r => r.id !== rowId && r.part_number === newPartNumber && r.status === 'ready');
      
      return {
        ...row,
        part_number: newPartNumber,
        status: newPartNumber ? (isDuplicate ? 'skip' : 'ready') : 'need_input',
        message: newPartNumber ? (isDuplicate ? 'Duplikat' : undefined) : 'Part number kosong'
      };
    }));
  };

  const handleSubmit = async () => {
    const readyRows = rows.filter(r => r.status === 'ready');
    if (readyRows.length === 0) {
      setError('Tidak ada data yang siap diupload');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Prepare data untuk tabel foto
      const fotoData: FotoProdukRow[] = readyRows.map(r => ({
        part_number: r.part_number,
        foto_1: r.foto_1 || undefined,
        foto_2: r.foto_2 || undefined,
        foto_3: r.foto_3 || undefined,
        foto_4: r.foto_4 || undefined,
        foto_5: r.foto_5 || undefined,
        foto_6: r.foto_6 || undefined,
        foto_7: r.foto_7 || undefined,
        foto_8: r.foto_8 || undefined,
        foto_9: r.foto_9 || undefined,
        foto_10: r.foto_10 || undefined,
      }));

      // Prepare data untuk tabel foto_link
      const fotoLinkData: FotoLinkRow[] = readyRows
        .filter(r => r.nama_csv) // Hanya yang punya nama_csv
        .map(r => ({
          sku: r.part_number,
          nama_csv: r.nama_csv,
        }));

      // Insert ke tabel foto
      const fotoResult = await insertFotoBatch(fotoData);
      if (!fotoResult.success) {
        setError('Gagal insert ke tabel foto: ' + fotoResult.error);
        setProcessing(false);
        return;
      }

      // Insert ke tabel foto_link
      if (fotoLinkData.length > 0) {
        const linkResult = await insertFotoLinkBatch(fotoLinkData);
        if (!linkResult.success) {
          console.warn('Warning: Insert foto_link gagal:', linkResult.error);
          // Tidak return error, karena foto sudah berhasil
        }
      }

      // Update status rows
      setRows(prev => prev.map(row => {
        if (row.status === 'ready') {
          return { ...row, status: 'skip' as const, message: 'Berhasil diupload' };
        }
        return row;
      }));

      onSuccess();
      
      // Close modal setelah delay
      setTimeout(() => {
        onClose();
        setRows([]);
      }, 1500);

    } catch (err: any) {
      console.error('Submit error:', err);
      setError('Gagal upload: ' + (err.message || 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  };

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter(r => r.status === 'ready').length,
    skip: rows.filter(r => r.status === 'skip').length,
    needInput: rows.filter(r => r.status === 'need_input').length,
  }), [rows]);

  const totalPages = Math.ceil(rows.length / itemsPerPage) || 1;
  const paginatedRows = rows.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl m-4 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-100 flex items-center gap-2">
              <Upload size={18} className="text-green-400" />
              Upload Foto Produk
            </h3>
            <p className="text-xs text-gray-400">Upload file CSV/Excel dengan kolom part_number, nama_csv, foto_1 sampai foto_10</p>
          </div>
          <button onClick={onClose} className="p-1 bg-gray-700 hover:bg-gray-600 rounded-full">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* File Input */}
          {rows.length === 0 && (
            <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload size={48} className="mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400 mb-4">Pilih file CSV atau Excel</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="px-6 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded-lg font-medium border border-green-900/50 flex items-center gap-2 mx-auto"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {loading ? 'Memproses...' : 'Pilih File'}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-900/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Stats */}
          {rows.length > 0 && (
            <div className="mb-4 flex gap-4 text-xs">
              <span className="px-3 py-1 bg-gray-700 rounded-lg text-gray-300">Total: {stats.total}</span>
              <span className="px-3 py-1 bg-green-900/30 rounded-lg text-green-400">Siap: {stats.ready}</span>
              <span className="px-3 py-1 bg-yellow-900/30 rounded-lg text-yellow-400">Perlu Input: {stats.needInput}</span>
              <span className="px-3 py-1 bg-gray-600 rounded-lg text-gray-400">Skip: {stats.skip}</span>
            </div>
          )}

          {/* Preview Table */}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-900 text-gray-300 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left min-w-[200px]">Part Number</th>
                    <th className="px-2 py-2 text-left min-w-[300px]">Nama CSV</th>
                    <th className="px-2 py-2 text-center">F1</th>
                    <th className="px-2 py-2 text-center">F2</th>
                    <th className="px-2 py-2 text-center">F3</th>
                    <th className="px-2 py-2 text-center">F4</th>
                    <th className="px-2 py-2 text-center">F5</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {paginatedRows.map((row, idx) => (
                    <tr key={row.id} className={`
                      ${row.status === 'ready' ? 'bg-green-900/10' : ''}
                      ${row.status === 'skip' ? 'bg-gray-800/50 opacity-60' : ''}
                      ${row.status === 'need_input' ? 'bg-yellow-900/10' : ''}
                    `}>
                      <td className="px-2 py-2 text-gray-500">{(page - 1) * itemsPerPage + idx + 1}</td>
                      <td className="px-2 py-2">
                        {row.status === 'ready' && <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-[10px]">Siap</span>}
                        {row.status === 'skip' && <span className="px-2 py-0.5 bg-gray-600 text-gray-400 rounded text-[10px]">Skip</span>}
                        {row.status === 'need_input' && <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded text-[10px]">Input</span>}
                      </td>
                      <td className="px-2 py-2">
                        {row.status === 'need_input' ? (
                          <AutocompleteDropdown
                            options={partNumberOptions}
                            value={row.part_number}
                            onChange={(val) => handlePartNumberChange(row.id, val)}
                            placeholder="Pilih..."
                          />
                        ) : (
                          <span className="font-mono text-gray-200">{row.part_number}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-400">{row.nama_csv}</td>
                      <td className="px-2 py-2 text-center">{row.foto_1 ? <Check size={14} className="text-green-400 mx-auto" /> : '-'}</td>
                      <td className="px-2 py-2 text-center">{row.foto_2 ? <Check size={14} className="text-green-400 mx-auto" /> : '-'}</td>
                      <td className="px-2 py-2 text-center">{row.foto_3 ? <Check size={14} className="text-green-400 mx-auto" /> : '-'}</td>
                      <td className="px-2 py-2 text-center">{row.foto_4 ? <Check size={14} className="text-green-400 mx-auto" /> : '-'}</td>
                      <td className="px-2 py-2 text-center">{row.foto_5 ? <Check size={14} className="text-green-400 mx-auto" /> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {rows.length > itemsPerPage && (
            <div className="flex justify-center items-center gap-4 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-400">
                Hal <b className="text-white">{page}</b> / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {rows.length > 0 && (
          <div className="p-4 border-t border-gray-700 flex justify-between items-center bg-gray-900/50">
            <button
              onClick={() => {
                setRows([]);
                setPage(1);
                setError(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
            >
              Reset
            </button>
            <button
              onClick={handleSubmit}
              disabled={processing || stats.ready === 0}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {processing ? 'Mengupload...' : `Upload ${stats.ready} Item`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
