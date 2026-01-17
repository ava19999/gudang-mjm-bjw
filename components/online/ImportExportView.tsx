// FILE: components/online/ImportExportView.tsx
import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Download } from 'lucide-react';
import { parseCSV, groupByResi, ParsedCSVRow } from '../../utils/csvParser';
import { ScanResi, ScanResiItem } from '../../types';
import { 
  getScanResiByDate, 
  updateScanResiWithMatch, 
  saveScanResiItems,
  saveProductAlias 
} from '../../services/resiService';

interface ImportExportViewProps {
  store: string | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface MatchResult {
  matched: Array<{ resi: ScanResi; csvData: ParsedCSVRow[] }>;
  scannedNotInCSV: ScanResi[];
  csvNotScanned: ParsedCSVRow[];
}

export const ImportExportView: React.FC<ImportExportViewProps> = ({ store, showToast }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [csvSource, setCsvSource] = useState<'SHOPEE' | 'TIKTOK' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        showToast('Hanya file CSV yang diperbolehkan', 'error');
        return;
      }
      setUploadedFile(file);
      setMatchResult(null);
      setCsvSource(null);
    }
  };

  const handleProcessCSV = async () => {
    if (!uploadedFile) {
      showToast('Pilih file CSV terlebih dahulu', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // Parse CSV
      const { source, data, errors } = await parseCSV(uploadedFile);

      if (errors.length > 0) {
        showToast(`Error parsing CSV: ${errors[0]}`, 'error');
        setIsProcessing(false);
        return;
      }

      if (!source || data.length === 0) {
        showToast('Tidak ada data valid di CSV', 'error');
        setIsProcessing(false);
        return;
      }

      setCsvSource(source);

      // Get scanned resi for today and yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const scannedResi = await getScanResiByDate(yesterdayStr, tomorrowStr, store);

      // Group CSV by resi
      const csvGrouped = groupByResi(data);

      // Matching logic
      const matched: Array<{ resi: ScanResi; csvData: ParsedCSVRow[] }> = [];
      const scannedNotInCSV: ScanResi[] = [];
      const csvNotScanned: ParsedCSVRow[] = [];

      // Check scanned resi against CSV
      scannedResi.forEach((resi) => {
        const csvData = csvGrouped.get(resi.resi);
        if (csvData) {
          matched.push({ resi, csvData });
          csvGrouped.delete(resi.resi); // Remove from map
        } else {
          scannedNotInCSV.push(resi);
        }
      });

      // Remaining in csvGrouped are not scanned
      csvGrouped.forEach((rows) => {
        csvNotScanned.push(...rows);
      });

      setMatchResult({ matched, scannedNotInCSV, csvNotScanned });
      showToast(
        `Matching selesai: ${matched.length} matched, ${scannedNotInCSV.length} scan only, ${csvNotScanned.length} CSV only`,
        'success'
      );
    } catch (error) {
      console.error('Error processing CSV:', error);
      showToast('Gagal memproses CSV', 'error');
    }

    setIsProcessing(false);
  };

  const handleSaveMatches = async () => {
    if (!matchResult || matchResult.matched.length === 0) {
      showToast('Tidak ada data yang di-match', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const match of matchResult.matched) {
        const { resi, csvData } = match;

        // Update scan_resi with customer and no_pesanan
        const firstRow = csvData[0];
        const updateSuccess = await updateScanResiWithMatch(
          resi.id!,
          firstRow.customer,
          firstRow.no_pesanan,
          store
        );

        if (!updateSuccess) {
          errorCount++;
          continue;
        }

        // Save items
        const items: ScanResiItem[] = csvData.map((row) => ({
          scan_resi_id: resi.id!,
          part_number: row.sku,
          product_name_export: row.product_name,
          qty: row.qty,
          harga_satuan: row.harga_satuan,
          harga_total: row.harga_total,
          is_split: false,
          split_count: 1,
        }));

        const itemsSuccess = await saveScanResiItems(items, store);

        if (!itemsSuccess) {
          errorCount++;
          continue;
        }

        // Save product aliases
        for (const row of csvData) {
          if (row.sku && row.product_name && csvSource) {
            await saveProductAlias(row.sku, row.product_name, csvSource);
          }
        }

        successCount++;
      }

      showToast(
        `Berhasil memproses ${successCount} data. ${errorCount > 0 ? `${errorCount} gagal.` : ''}`,
        successCount > 0 ? 'success' : 'error'
      );

      // Refresh match result
      if (uploadedFile) {
        await handleProcessCSV();
      }
    } catch (error) {
      console.error('Error saving matches:', error);
      showToast('Gagal menyimpan data', 'error');
    }

    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-4 shadow-lg">
        <h2 className="text-xl font-bold flex items-center gap-2">
          📥 IMPORT & REKONSILIASI DATA
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Upload Section */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Upload CSV Export</h3>
          
          <div className="flex flex-col gap-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-all flex items-center gap-2 justify-center"
              >
                <Upload size={20} />
                Pilih File CSV
              </button>
            </div>

            {uploadedFile && (
              <div className="flex items-center gap-3 p-3 bg-gray-750 rounded-lg border border-gray-600">
                <FileText size={24} className="text-blue-400" />
                <div className="flex-1">
                  <p className="font-semibold">{uploadedFile.name}</p>
                  <p className="text-sm text-gray-400">
                    {(uploadedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={handleProcessCSV}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold transition-all"
                >
                  {isProcessing ? 'Processing...' : 'Process & Match'}
                </button>
              </div>
            )}

            {csvSource && (
              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                <p className="text-sm">
                  <strong>Sumber:</strong> {csvSource}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Match Results */}
        {matchResult && (
          <>
            {/* Save Button */}
            {matchResult.matched.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <button
                  onClick={handleSaveMatches}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold transition-all flex items-center gap-2 justify-center"
                >
                  <Download size={20} />
                  {isProcessing ? 'Menyimpan...' : `Simpan ${matchResult.matched.length} Data Matched`}
                </button>
              </div>
            )}

            {/* Matched Section */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="p-4 bg-green-900/30 border-b border-gray-700 flex items-center gap-2">
                <CheckCircle size={20} className="text-green-400" />
                <h3 className="text-lg font-bold">✅ MATCHED ({matchResult.matched.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-750">
                    <tr>
                      <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                      <th className="px-4 py-3 text-left border-b border-gray-700">RESI</th>
                      <th className="px-4 py-3 text-left border-b border-gray-700">CUSTOMER</th>
                      <th className="px-4 py-3 text-left border-b border-gray-700">ITEMS</th>
                      <th className="px-4 py-3 text-right border-b border-gray-700">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResult.matched.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          Tidak ada data yang match
                        </td>
                      </tr>
                    ) : (
                      matchResult.matched.map((item, index) => {
                        const totalHarga = item.csvData.reduce((sum, row) => sum + row.harga_total, 0);
                        return (
                          <tr key={item.resi.id} className="border-b border-gray-700 hover:bg-gray-750">
                            <td className="px-4 py-3">{index + 1}</td>
                            <td className="px-4 py-3 font-mono">{item.resi.resi}</td>
                            <td className="px-4 py-3">{item.csvData[0]?.customer || '-'}</td>
                            <td className="px-4 py-3">
                              {item.csvData.map((row, i) => (
                                <div key={i} className="text-xs">
                                  {row.sku} x {row.qty}
                                </div>
                              ))}
                            </td>
                            <td className="px-4 py-3 text-right">
                              Rp {totalHarga.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scanned but not in CSV */}
            {matchResult.scannedNotInCSV.length > 0 && (
              <div className="bg-gray-800 rounded-lg border border-gray-700">
                <div className="p-4 bg-yellow-900/30 border-b border-gray-700 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-yellow-400" />
                  <h3 className="text-lg font-bold">⚠️ SCAN TAPI TIDAK ADA DI EXPORT ({matchResult.scannedNotInCSV.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-750">
                      <tr>
                        <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">RESI</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">TIPE</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">TOKO</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">WAKTU SCAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchResult.scannedNotInCSV.map((item, index) => (
                        <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="px-4 py-3">{index + 1}</td>
                          <td className="px-4 py-3 font-mono">{item.resi}</td>
                          <td className="px-4 py-3">{item.type_toko}</td>
                          <td className="px-4 py-3">{item.toko || '-'}</td>
                          <td className="px-4 py-3">
                            {new Date(item.scanned_at).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CSV but not scanned */}
            {matchResult.csvNotScanned.length > 0 && (
              <div className="bg-gray-800 rounded-lg border border-gray-700">
                <div className="p-4 bg-red-900/30 border-b border-gray-700 flex items-center gap-2">
                  <XCircle size={20} className="text-red-400" />
                  <h3 className="text-lg font-bold">❌ DI EXPORT TAPI BELUM SCAN ({matchResult.csvNotScanned.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-750">
                      <tr>
                        <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">RESI</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">NO. PESANAN</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">CUSTOMER</th>
                        <th className="px-4 py-3 text-left border-b border-gray-700">SKU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchResult.csvNotScanned.map((item, index) => (
                        <tr key={index} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="px-4 py-3">{index + 1}</td>
                          <td className="px-4 py-3 font-mono">{item.no_resi}</td>
                          <td className="px-4 py-3">{item.no_pesanan}</td>
                          <td className="px-4 py-3">{item.customer}</td>
                          <td className="px-4 py-3">{item.sku} x {item.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
