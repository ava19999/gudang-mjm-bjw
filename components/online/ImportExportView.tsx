// FILE: components/online/ImportExportView.tsx
// AFTERNOON RECONCILIATION: Import CSV exports from Shopee/TikTok and match with scanned entries

import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Search, Filter, Download } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ScanResiEntry } from '../../types';
import { 
  parseMarketplaceExport, 
  ParsedOrderData 
} from '../../utils/csvParser';
import {
  fetchScanResiEntries,
  updateScanResi,
  matchResiWithExport,
  addProductAlias
} from '../../services/resiService';
import {
  updateInventory,
  getItemByPartNumber
} from '../../services/supabaseService';

interface ImportExportViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface MatchResult {
  matched: number;
  skipped: number;
  notFound: number;
  errors: string[];
}

export const ImportExportView: React.FC<ImportExportViewProps> = ({ showToast }) => {
  const { selectedStore } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedOrderData[]>([]);
  const [detectedSource, setDetectedSource] = useState<'SHOPEE' | 'TIKTOK' | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterToko, setFilterToko] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Scanned entries
  const [scannedEntries, setScannedEntries] = useState<ScanResiEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ScanResiEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load scanned entries on mount
  useEffect(() => {
    loadScannedEntries();
  }, [selectedStore]);

  // Apply filters
  useEffect(() => {
    applyFilters();
  }, [scannedEntries, filterType, filterToko, filterStatus, filterDateFrom, filterDateTo]);

  const loadScannedEntries = async () => {
    setIsLoading(true);
    try {
      const entries = await fetchScanResiEntries(selectedStore, {});
      setScannedEntries(entries);
    } catch (error) {
      console.error('Error loading entries:', error);
      showToast('Gagal memuat data scanned entries', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...scannedEntries];

    if (filterType !== 'ALL') {
      filtered = filtered.filter(e => e.type_toko === filterType);
    }
    if (filterToko !== 'ALL') {
      filtered = filtered.filter(e => e.toko === filterToko);
    }
    if (filterStatus !== 'ALL') {
      filtered = filtered.filter(e => e.status_packing === filterStatus);
    }
    if (filterDateFrom) {
      filtered = filtered.filter(e => e.tanggal >= filterDateFrom);
    }
    if (filterDateTo) {
      filtered = filtered.filter(e => e.tanggal <= filterDateTo);
    }

    setFilteredEntries(filtered);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      showToast('File harus berformat CSV!', 'error');
      return;
    }

    setUploadedFile(file);
    setMatchResult(null);

    try {
      const text = await file.text();
      const parsed = parseMarketplaceExport(text);

      if (parsed.length === 0) {
        showToast('File CSV tidak memiliki data valid!', 'error');
        setParsedData([]);
        setDetectedSource(null);
        return;
      }

      setParsedData(parsed);
      setDetectedSource(parsed[0].source);
      showToast(`Berhasil! Terdeteksi ${parsed[0].source} dengan ${parsed.length} baris`, 'success');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      showToast('Gagal parsing file CSV!', 'error');
      setParsedData([]);
      setDetectedSource(null);
    }
  };

  const handleMatchAndProcess = async () => {
    if (parsedData.length === 0) {
      showToast('Tidak ada data untuk diproses!', 'error');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    const result: MatchResult = {
      matched: 0,
      skipped: 0,
      notFound: 0,
      errors: []
    };

    try {
      const total = parsedData.length;

      for (let i = 0; i < parsedData.length; i++) {
        const orderData = parsedData[i];
        setProgress(Math.round(((i + 1) / total) * 100));

        try {
          // Find matching entry in scan_resi by resi number
          const matchingEntry = scannedEntries.find(
            e => e.resi === orderData.resi && e.status_packing === 'SCANNED'
          );

          if (!matchingEntry) {
            // Check if already matched (duplicate)
            const alreadyMatched = scannedEntries.find(
              e => e.resi === orderData.resi && e.status_packing === 'MATCHED'
            );

            if (alreadyMatched) {
              result.skipped++;
            } else {
              result.notFound++;
              result.errors.push(`Resi ${orderData.resi} tidak ditemukan di scan entries`);
            }
            continue;
          }

          // Update scan_resi entry with export data
          const updateSuccess = await updateScanResi(
            matchingEntry.id!,
            {
              customer: orderData.customerName || orderData.recipientName,
              qty_out: orderData.quantity,
              harga_satuan: orderData.pricePerUnit,
              total_harga: orderData.totalPrice,
              status_packing: 'MATCHED',
              no_pesanan: orderData.orderNumber
            },
            selectedStore
          );

          if (!updateSuccess) {
            result.errors.push(`Gagal update resi ${orderData.resi}`);
            continue;
          }

          // Save product alias (product name → part_number mapping)
          await addProductAlias({
            part_number: matchingEntry.part_number,
            alias_name: orderData.productName,
            source: orderData.source
          });

          // Reduce stock in base_mjm/base_bjw
          const item = await getItemByPartNumber(matchingEntry.part_number, selectedStore);
          if (item) {
            const newQuantity = Math.max(0, item.quantity - orderData.quantity);
            item.quantity = newQuantity;

            // Update inventory with transaction log (barang_keluar)
            await updateInventory(
              item,
              {
                type: 'out',
                qty: orderData.quantity,
                customer: orderData.customerName || orderData.recipientName,
                resiTempo: orderData.resi,
                tempo: '-',
                ecommerce: orderData.source,
                price: orderData.pricePerUnit,
                tanggal: matchingEntry.tanggal
              },
              selectedStore
            );
          }

          result.matched++;
        } catch (error: any) {
          console.error(`Error processing resi ${orderData.resi}:`, error);
          result.errors.push(`Error pada resi ${orderData.resi}: ${error.message}`);
        }
      }

      setMatchResult(result);
      showToast(
        `Selesai! Matched: ${result.matched}, Skipped: ${result.skipped}, Not found: ${result.notFound}`,
        result.matched > 0 ? 'success' : 'error'
      );

      // Reload entries to show updated status
      await loadScannedEntries();
    } catch (error) {
      console.error('Error during processing:', error);
      showToast('Terjadi kesalahan saat memproses!', 'error');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setParsedData([]);
    setDetectedSource(null);
    setMatchResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-teal-500 rounded-xl shadow-2xl p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Import & Match Export</h1>
            <p className="text-blue-100 text-sm mt-1">
              Reconciliation: Upload CSV dari Shopee/TikTok dan cocokkan dengan scan entries
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: File Upload Section */}
        <div className="space-y-6">
          {/* Upload Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold">Upload CSV Export</h2>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                       rounded-lg font-medium transition-all duration-200 flex items-center 
                       justify-center gap-2 shadow-lg"
            >
              <FileText className="w-5 h-5" />
              {uploadedFile ? 'Ganti File' : 'Pilih File CSV'}
            </button>

            {uploadedFile && (
              <div className="mt-4 space-y-3">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="font-medium">{uploadedFile.name}</p>
                        <p className="text-sm text-gray-400">
                          {parsedData.length} baris • {detectedSource}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={clearUpload}
                      disabled={isProcessing}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Preview first 5 rows */}
                {parsedData.length > 0 && (
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">
                      Preview (5 baris pertama):
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {parsedData.slice(0, 5).map((row, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-800/50 rounded p-3 text-xs border border-gray-600"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-400">Resi:</span>{' '}
                              <span className="text-white font-mono">{row.resi}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Qty:</span>{' '}
                              <span className="text-white">{row.quantity}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-400">Produk:</span>{' '}
                              <span className="text-white">{row.productName}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Customer:</span>{' '}
                              <span className="text-white">{row.customerName || row.recipientName}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Total:</span>{' '}
                              <span className="text-white">
                                Rp {row.totalPrice.toLocaleString('id-ID')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Match & Process Card */}
          {parsedData.length > 0 && (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <h2 className="text-xl font-semibold">Match & Process</h2>
              </div>

              <button
                onClick={handleMatchAndProcess}
                disabled={isProcessing || parsedData.length === 0}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 
                         rounded-lg font-medium transition-all duration-200 flex items-center 
                         justify-center gap-2 shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Processing... {progress}%
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Match & Process Data
                  </>
                )}
              </button>

              {isProcessing && (
                <div className="mt-4">
                  <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-green-500 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-gray-400 mt-2">{progress}%</p>
                </div>
              )}

              {matchResult && (
                <div className="mt-4 space-y-2">
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                    <p className="text-green-300 font-semibold">
                      ✓ Matched: {matchResult.matched}
                    </p>
                  </div>
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                    <p className="text-yellow-300 font-semibold">
                      ⊘ Skipped (sudah matched): {matchResult.skipped}
                    </p>
                  </div>
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                    <p className="text-red-300 font-semibold">
                      ✗ Not Found: {matchResult.notFound}
                    </p>
                  </div>

                  {matchResult.errors.length > 0 && (
                    <div className="bg-gray-700/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                      <p className="text-sm font-semibold text-gray-300 mb-2">Errors:</p>
                      {matchResult.errors.map((err, idx) => (
                        <p key={idx} className="text-xs text-red-300">
                          • {err}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Scanned Entries Section */}
        <div className="space-y-6">
          {/* Filters Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-semibold">Filter Scanned Entries</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Type Toko
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white focus:ring-2 focus:ring-purple-500"
                >
                  <option value="ALL">Semua</option>
                  <option value="TIKTOK">TIKTOK</option>
                  <option value="SHOPEE">SHOPEE</option>
                  <option value="EKSPOR">EKSPOR</option>
                  <option value="KILAT">KILAT</option>
                  <option value="RESELLER">RESELLER</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Toko
                </label>
                <select
                  value={filterToko}
                  onChange={(e) => setFilterToko(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white focus:ring-2 focus:ring-purple-500"
                >
                  <option value="ALL">Semua</option>
                  <option value="LARIS">LARIS</option>
                  <option value="MJM">MJM</option>
                  <option value="BJW">BJW</option>
                  <option value="PH">PH</option>
                  <option value="MY">MY</option>
                  <option value="SG">SG</option>
                  <option value="HK">HK</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white focus:ring-2 focus:ring-purple-500"
                >
                  <option value="ALL">Semua</option>
                  <option value="SCANNED">SCANNED</option>
                  <option value="MATCHED">MATCHED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tanggal
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                             text-white focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                             text-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setFilterType('ALL');
                setFilterToko('ALL');
                setFilterStatus('ALL');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="mt-4 w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg 
                       text-sm font-medium transition-all duration-200"
            >
              Reset Filter
            </button>
          </div>

          {/* Entries Table Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold">Scanned Entries</h2>
              </div>
              <div className="text-sm text-gray-400">
                {filteredEntries.length} / {scannedEntries.length} entries
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada data yang sesuai filter</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-700/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Tanggal</th>
                        <th className="px-3 py-2 text-left font-semibold">Type</th>
                        <th className="px-3 py-2 text-left font-semibold">Toko</th>
                        <th className="px-3 py-2 text-left font-semibold">Resi</th>
                        <th className="px-3 py-2 text-left font-semibold">Part Number</th>
                        <th className="px-3 py-2 text-left font-semibold">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => {
                        const isScanned = entry.status_packing === 'SCANNED';
                        const bgColor = isScanned
                          ? 'bg-yellow-900/20 hover:bg-yellow-900/30'
                          : 'bg-green-900/20 hover:bg-green-900/30';
                        const statusColor = isScanned
                          ? 'bg-yellow-500 text-yellow-900'
                          : 'bg-green-500 text-green-900';

                        return (
                          <tr
                            key={entry.id}
                            className={`${bgColor} border-b border-gray-700 transition-colors`}
                          >
                            <td className="px-3 py-2 text-gray-300">{entry.tanggal}</td>
                            <td className="px-3 py-2">
                              <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                                {entry.type_toko}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-300">{entry.toko}</td>
                            <td className="px-3 py-2 font-mono text-gray-300">{entry.resi}</td>
                            <td className="px-3 py-2 font-mono text-gray-300">{entry.part_number}</td>
                            <td className="px-3 py-2 text-gray-300">
                              {entry.customer || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`text-xs font-semibold px-2 py-1 rounded ${statusColor}`}
                              >
                                {entry.status_packing}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
