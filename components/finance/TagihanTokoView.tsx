// FILE: src/components/finance/TagihanTokoView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Store, Search, Filter, Calendar, RefreshCw, 
  ChevronDown, ChevronUp, Clock, DollarSign, User,
  Plus, X, Check, History, FileText, Download, Building2, Receipt,
  Edit2, Trash2, Save, Image as ImageIcon
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '../../services/supabaseClient';
import { useStore } from '../../context/StoreContext';

// Types
interface BarangKeluarRecord {
  id: number;
  part_number: string;
  name: string;
  qty_keluar: number;
  harga_total: number;
  kode_toko: string;
  tempo: string;
  ecommerce: string;
  customer: string;
  resi: string;
  created_at: string;
}

interface TagihanToko {
  id: number;
  customer: string;
  tempo: string;
  tanggal: string;
  jumlah: number;
  keterangan: string;
  created_at: string;
  store: string;
}

interface TokoPiutang {
  customer: string;
  tempo: string;
  totalTagihan: number;
  totalTagihanManual: number;
  totalBayar: number;
  sisaTagihan: number;
  lastTransaction: string;
  transactions: BarangKeluarRecord[];
  tagihanManual: TagihanToko[];
}

interface Pembayaran {
  id: number;
  customer: string;
  tempo: string;
  tanggal: string;
  jumlah: number;
  keterangan: string;
  created_at: string;
  store: string;
}

// Utility functions
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCompactNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'rb';
  }
  return num.toString();
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
};

const formatCurrencyInput = (value: string): string => {
  const number = value.replace(/\D/g, '');
  if (!number) return '';
  return new Intl.NumberFormat('id-ID').format(parseInt(number));
};

const parseCurrencyInput = (value: string): string => {
  return value.replace(/\D/g, '');
};

export const TagihanTokoView: React.FC = () => {
  const { selectedStore } = useStore();
  
  // Data states
  const [loading, setLoading] = useState(false);
  const [tokoList, setTokoList] = useState<TokoPiutang[]>([]);
  const [tokoLunas, setTokoLunas] = useState<TokoPiutang[]>([]);
  const [pembayaranList, setPembayaranList] = useState<Pembayaran[]>([]);
  const [tagihanList, setTagihanList] = useState<TagihanToko[]>([]);
  
  // Tab state: belum_lunas or sudah_lunas
  const [activeTab, setActiveTab] = useState<'belum_lunas' | 'sudah_lunas'>('belum_lunas');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTempo, setFilterTempo] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<'all' | 'mjm' | 'bjw'>('all');
  const [filterMonthFrom, setFilterMonthFrom] = useState('2025-11');
  const [filterMonthTo, setFilterMonthTo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  // Modal states
  const [selectedToko, setSelectedToko] = useState<TokoPiutang | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTagihanModal, setShowTagihanModal] = useState(false);
  
  // Payment form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  
  // Tagihan form states
  const [tagihanCustomer, setTagihanCustomer] = useState('');
  const [tagihanTempo, setTagihanTempo] = useState('');
  const [tagihanAmount, setTagihanAmount] = useState('');
  const [tagihanNote, setTagihanNote] = useState('');
  const [tagihanDate, setTagihanDate] = useState('');
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Edit states
  const [editingPayment, setEditingPayment] = useState<Pembayaran | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<BarangKeluarRecord | null>(null);
  const [editingTagihan, setEditingTagihan] = useState<TagihanToko | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaymentNote, setEditPaymentNote] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editTransactionQty, setEditTransactionQty] = useState('');
  const [editTransactionHarga, setEditTransactionHarga] = useState('');
  const [editTagihanAmount, setEditTagihanAmount] = useState('');
  const [editTagihanNote, setEditTagihanNote] = useState('');
  const [editTagihanDate, setEditTagihanDate] = useState('');
  
  // Search states for history modal
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Get tempo types (excluding CASH and NADIR)
  const tempoTypes = useMemo(() => {
    const types = new Set<string>();
    tokoList.forEach(t => {
      if (t.tempo) types.add(t.tempo);
    });
    return Array.from(types).sort();
  }, [tokoList]);

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const storesToQuery = filterStore === 'all' 
        ? ['mjm', 'bjw'] 
        : [filterStore];

      const allRecords: BarangKeluarRecord[] = [];
      
      // Calculate date range from month filters
      const dateFrom = `${filterMonthFrom}-01`;
      const dateTo = new Date(filterMonthTo + '-01');
      dateTo.setMonth(dateTo.getMonth() + 1);
      dateTo.setDate(0);
      const dateToStr = dateTo.toISOString().split('T')[0];
      
      for (const store of storesToQuery) {
        const tableName = store === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';
        
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .not('tempo', 'ilike', '%CASH%')
          .not('tempo', 'ilike', '%NADIR%')
          .not('tempo', 'ilike', '%RETUR%')
          .not('tempo', 'ilike', '%STOK%')
          .not('tempo', 'ilike', '%LUNAS%')
          .not('tempo', 'is', null)
          .not('tempo', 'eq', '')
          .not('tempo', 'eq', '-')
          .gte('created_at', dateFrom)
          .lte('created_at', dateToStr + 'T23:59:59')
          .order('created_at', { ascending: false });

        if (error) {
          console.error(`Error fetching from ${tableName}:`, error);
        } else if (data) {
          allRecords.push(...data);
        }
      }

      // Load pembayaran data
      const { data: pembayaranData } = await supabase
        .from('toko_pembayaran')
        .select('*')
        .order('tanggal', { ascending: false });
      
      setPembayaranList(pembayaranData || []);

      // Load tagihan manual data
      const { data: tagihanData } = await supabase
        .from('toko_tagihan')
        .select('*')
        .gte('tanggal', dateFrom)
        .lte('tanggal', dateToStr)
        .order('tanggal', { ascending: false });
      
      setTagihanList(tagihanData || []);

      // Group by customer and tempo
      const tokoMap = new Map<string, TokoPiutang>();
      
      allRecords.forEach(record => {
        const key = `${record.customer?.trim().toUpperCase() || 'UNKNOWN'}_${record.tempo?.trim().toUpperCase() || '-'}`;
        
        if (!tokoMap.has(key)) {
          tokoMap.set(key, {
            customer: record.customer?.trim().toUpperCase() || 'UNKNOWN',
            tempo: record.tempo?.trim().toUpperCase() || '-',
            totalTagihan: 0,
            totalTagihanManual: 0,
            totalBayar: 0,
            sisaTagihan: 0,
            lastTransaction: record.created_at,
            transactions: [],
            tagihanManual: [],
          });
        }
        
        const existing = tokoMap.get(key)!;
        existing.totalTagihan += record.harga_total || 0;
        existing.transactions.push(record);
        
        if (new Date(record.created_at) > new Date(existing.lastTransaction)) {
          existing.lastTransaction = record.created_at;
        }
      });

      // Add tagihan manual to toko
      (tagihanData || []).forEach(t => {
        const key = `${t.customer?.trim().toUpperCase() || 'UNKNOWN'}_${t.tempo?.trim().toUpperCase() || '-'}`;
        
        if (!tokoMap.has(key)) {
          tokoMap.set(key, {
            customer: t.customer?.trim().toUpperCase() || 'UNKNOWN',
            tempo: t.tempo?.trim().toUpperCase() || '-',
            totalTagihan: 0,
            totalTagihanManual: 0,
            totalBayar: 0,
            sisaTagihan: 0,
            lastTransaction: t.tanggal,
            transactions: [],
            tagihanManual: [],
          });
        }
        
        const existing = tokoMap.get(key)!;
        existing.totalTagihanManual += t.jumlah || 0;
        existing.tagihanManual.push(t);
        
        if (new Date(t.tanggal) > new Date(existing.lastTransaction)) {
          existing.lastTransaction = t.tanggal;
        }
      });

      // Calculate totalBayar from pembayaran
      (pembayaranData || []).forEach(p => {
        const key = `${p.customer?.trim().toUpperCase() || 'UNKNOWN'}_${p.tempo || '-'}`;
        const toko = tokoMap.get(key);
        if (toko) {
          toko.totalBayar += p.jumlah || 0;
        }
      });

      // Calculate sisa tagihan
      tokoMap.forEach((toko) => {
        toko.sisaTagihan = toko.totalTagihan + toko.totalTagihanManual - toko.totalBayar;
      });

      // Convert to array
      const allToko = Array.from(tokoMap.values());
      
      // Belum lunas
      const tokoArray = allToko
        .filter(t => t.sisaTagihan > 0)
        .sort((a, b) => b.sisaTagihan - a.sisaTagihan);

      // Sudah lunas
      const lunasArray = allToko
        .filter(t => t.sisaTagihan <= 0 && t.totalTagihan > 0)
        .sort((a, b) => new Date(b.lastTransaction).getTime() - new Date(a.lastTransaction).getTime());

      setTokoList(tokoArray);
      setTokoLunas(lunasArray);
    } catch (err) {
      console.error('Failed to load tagihan data:', err);
      showToast('Gagal memuat data tagihan', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStore, selectedStore, filterMonthFrom, filterMonthTo]);

  // Filtered toko (based on active tab)
  const filteredToko = useMemo(() => {
    const sourceList = activeTab === 'belum_lunas' ? tokoList : tokoLunas;
    return sourceList.filter(t => {
      if (searchTerm && !t.customer.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (filterTempo !== 'all' && t.tempo !== filterTempo) {
        return false;
      }
      return true;
    });
  }, [tokoList, tokoLunas, activeTab, searchTerm, filterTempo]);

  // Statistics
  const stats = useMemo(() => {
    const totalTagihan = filteredToko.reduce((sum, t) => sum + t.sisaTagihan, 0);
    const tempo3Bln = filteredToko.filter(t => t.tempo.includes('3')).reduce((sum, t) => sum + t.sisaTagihan, 0);
    const tempo2Bln = filteredToko.filter(t => t.tempo.includes('2')).reduce((sum, t) => sum + t.sisaTagihan, 0);
    const tempo1Bln = filteredToko.filter(t => t.tempo.includes('1')).reduce((sum, t) => sum + t.sisaTagihan, 0);
    const tempoLainnya = totalTagihan - tempo3Bln - tempo2Bln - tempo1Bln;
    
    return { totalTagihan, tempo3Bln, tempo2Bln, tempo1Bln, tempoLainnya };
  }, [filteredToko]);

  // Handle payment submission
  const handleSubmitPayment = async () => {
    if (!selectedToko || !paymentAmount || parseFloat(parseCurrencyInput(paymentAmount)) <= 0) {
      showToast('Masukkan jumlah pembayaran yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('toko_pembayaran')
        .insert([{
          customer: selectedToko.customer,
          tempo: selectedToko.tempo,
          tanggal: paymentDate || new Date().toISOString().split('T')[0],
          jumlah: parseFloat(parseCurrencyInput(paymentAmount)),
          keterangan: paymentNote || 'Pembayaran tagihan',
          store: filterStore === 'all' ? 'all' : filterStore,
        }]);

      if (error) throw error;

      showToast('Pembayaran berhasil dicatat', 'success');
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNote('');
      setPaymentDate('');
      loadData();
    } catch (err) {
      console.error('Error adding payment:', err);
      showToast('Gagal mencatat pembayaran', 'error');
    }
  };

  // Handle tagihan submission
  const handleSubmitTagihan = async () => {
    if (!tagihanCustomer || !tagihanAmount || parseFloat(parseCurrencyInput(tagihanAmount)) <= 0) {
      showToast('Masukkan nama customer dan jumlah tagihan yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('toko_tagihan')
        .insert([{
          customer: tagihanCustomer.trim().toUpperCase(),
          tempo: tagihanTempo || '1 BLN',
          tanggal: tagihanDate || new Date().toISOString().split('T')[0],
          jumlah: parseFloat(parseCurrencyInput(tagihanAmount)),
          keterangan: tagihanNote || 'Tagihan manual',
          store: filterStore === 'all' ? 'all' : filterStore,
        }]);

      if (error) throw error;

      showToast('Tagihan berhasil ditambahkan', 'success');
      setShowTagihanModal(false);
      setTagihanCustomer('');
      setTagihanTempo('');
      setTagihanAmount('');
      setTagihanNote('');
      setTagihanDate('');
      loadData();
    } catch (err) {
      console.error('Error adding tagihan:', err);
      showToast('Gagal menambahkan tagihan', 'error');
    }
  };

  // Get payment history for selected toko
  const tokoPayments = useMemo(() => {
    if (!selectedToko) return [];
    return pembayaranList.filter(p => 
      p.customer?.toUpperCase() === selectedToko.customer &&
      (p.tempo === selectedToko.tempo || !p.tempo)
    );
  }, [selectedToko, pembayaranList]);

  // Filtered transactions for history modal
  const filteredTransactions = useMemo(() => {
    if (!selectedToko) return [];
    
    return selectedToko.transactions.filter(t => {
      if (historySearchTerm) {
        const searchLower = historySearchTerm.toLowerCase();
        const matchPartNumber = t.part_number?.toLowerCase().includes(searchLower);
        const matchName = t.name?.toLowerCase().includes(searchLower);
        if (!matchPartNumber && !matchName) return false;
      }
      
      if (historyDateFilter) {
        const transactionDate = t.created_at.split('T')[0];
        if (transactionDate !== historyDateFilter) return false;
      }
      
      return true;
    });
  }, [selectedToko, historySearchTerm, historyDateFilter]);

  // Handle edit payment
  const handleEditPayment = (payment: Pembayaran) => {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.jumlah.toString());
    setEditPaymentNote(payment.keterangan || '');
    setEditPaymentDate(payment.tanggal);
  };

  // Handle save edited payment
  const handleSaveEditPayment = async () => {
    if (!editingPayment || !editPaymentAmount || parseFloat(parseCurrencyInput(editPaymentAmount)) <= 0) {
      showToast('Masukkan jumlah pembayaran yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('toko_pembayaran')
        .update({
          jumlah: parseFloat(parseCurrencyInput(editPaymentAmount)),
          keterangan: editPaymentNote || 'Pembayaran tagihan',
          tanggal: editPaymentDate,
        })
        .eq('id', editingPayment.id);

      if (error) throw error;

      showToast('Pembayaran berhasil diupdate', 'success');
      setEditingPayment(null);
      setEditPaymentAmount('');
      setEditPaymentNote('');
      setEditPaymentDate('');
      loadData();
    } catch (err) {
      console.error('Error updating payment:', err);
      showToast('Gagal update pembayaran', 'error');
    }
  };

  // Handle delete payment
  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Yakin ingin menghapus pembayaran ini?')) return;

    try {
      const { error } = await supabase
        .from('toko_pembayaran')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      showToast('Pembayaran berhasil dihapus', 'success');
      loadData();
    } catch (err) {
      console.error('Error deleting payment:', err);
      showToast('Gagal menghapus pembayaran', 'error');
    }
  };

  // Handle edit transaction
  const handleEditTransaction = (transaction: BarangKeluarRecord) => {
    setEditingTransaction(transaction);
    setEditTransactionQty(transaction.qty_keluar.toString());
    setEditTransactionHarga(Math.round(transaction.harga_total / (transaction.qty_keluar || 1)).toString());
  };

  // Handle save edited transaction
  const handleSaveEditTransaction = async () => {
    if (!editingTransaction || !editTransactionQty || parseInt(editTransactionQty) <= 0) {
      showToast('Masukkan qty yang valid', 'error');
      return;
    }

    const newQty = parseInt(editTransactionQty);
    const newHargaSatuan = parseFloat(editTransactionHarga) || Math.round(editingTransaction.harga_total / (editingTransaction.qty_keluar || 1));
    const newHargaTotal = newQty * newHargaSatuan;

    try {
      // Determine which table
      let tableName = '';
      
      const { data: mjmData } = await supabase
        .from('barang_keluar_mjm')
        .select('id')
        .eq('id', editingTransaction.id)
        .single();
      
      if (mjmData) {
        tableName = 'barang_keluar_mjm';
      } else {
        tableName = 'barang_keluar_bjw';
      }

      // Update the barang_keluar record
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          qty_keluar: newQty,
          harga_total: newHargaTotal,
        })
        .eq('id', editingTransaction.id);

      if (updateError) throw updateError;

      showToast('Transaksi berhasil diupdate', 'success');
      setEditingTransaction(null);
      setEditTransactionQty('');
      setEditTransactionHarga('');
      loadData();
    } catch (err) {
      console.error('Error updating transaction:', err);
      showToast('Gagal update transaksi', 'error');
    }
  };

  // Handle edit tagihan manual
  const handleEditTagihan = (tagihan: TagihanToko) => {
    setEditingTagihan(tagihan);
    setEditTagihanAmount(tagihan.jumlah.toString());
    setEditTagihanNote(tagihan.keterangan || '');
    setEditTagihanDate(tagihan.tanggal);
  };

  // Handle save edited tagihan
  const handleSaveEditTagihan = async () => {
    if (!editingTagihan || !editTagihanAmount || parseFloat(parseCurrencyInput(editTagihanAmount)) <= 0) {
      showToast('Masukkan jumlah tagihan yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('toko_tagihan')
        .update({
          jumlah: parseFloat(parseCurrencyInput(editTagihanAmount)),
          keterangan: editTagihanNote || 'Tagihan manual',
          tanggal: editTagihanDate,
        })
        .eq('id', editingTagihan.id);

      if (error) throw error;

      showToast('Tagihan berhasil diupdate', 'success');
      setEditingTagihan(null);
      setEditTagihanAmount('');
      setEditTagihanNote('');
      setEditTagihanDate('');
      loadData();
    } catch (err) {
      console.error('Error updating tagihan:', err);
      showToast('Gagal update tagihan', 'error');
    }
  };

  // Handle delete tagihan
  const handleDeleteTagihan = async (tagihanId: number) => {
    if (!confirm('Yakin ingin menghapus tagihan ini?')) return;

    try {
      const { error } = await supabase
        .from('toko_tagihan')
        .delete()
        .eq('id', tagihanId);

      if (error) throw error;

      showToast('Tagihan berhasil dihapus', 'success');
      loadData();
    } catch (err) {
      console.error('Error deleting tagihan:', err);
      showToast('Gagal menghapus tagihan', 'error');
    }
  };

  // Export to PDF
  const exportToPDF = () => {
    const printContent = `
      <html>
        <head>
          <title>Laporan Tagihan Toko - ${new Date().toLocaleDateString('id-ID')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
            .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
            .stat-card { padding: 10px 15px; border: 1px solid #ddd; border-radius: 8px; }
            .stat-value { font-size: 18px; font-weight: bold; }
            .stat-label { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Laporan Tagihan Toko (Tempo)</h1>
          <div class="subtitle">Toko: ${filterStore === 'all' ? 'Semua' : filterStore.toUpperCase()} | Periode: ${filterMonthFrom} s/d ${filterMonthTo} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</div>
          
          <div class="stats">
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(stats.totalTagihan)}</div>
              <div class="stat-label">Total Tagihan</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(stats.tempo3Bln)}</div>
              <div class="stat-label">Tempo 3 Bulan</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(stats.tempo2Bln)}</div>
              <div class="stat-label">Tempo 2 Bulan</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(stats.tempo1Bln)}</div>
              <div class="stat-label">Tempo 1 Bulan</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Customer</th>
                <th>Tempo</th>
                <th class="text-right">Total Tagihan</th>
                <th class="text-right">Total Bayar</th>
                <th class="text-right">Sisa Tagihan</th>
                <th>Transaksi Terakhir</th>
              </tr>
            </thead>
            <tbody>
              ${filteredToko.map((t, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${t.customer}</td>
                  <td>${t.tempo}</td>
                  <td class="text-right">${formatCurrency(t.totalTagihan)}</td>
                  <td class="text-right">${formatCurrency(t.totalBayar)}</td>
                  <td class="text-right">${formatCurrency(t.sisaTagihan)}</td>
                  <td>${formatDate(t.lastTransaction)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">TOTAL</td>
                <td class="text-right">${formatCurrency(filteredToko.reduce((s, t) => s + t.totalTagihan, 0))}</td>
                <td class="text-right">${formatCurrency(filteredToko.reduce((s, t) => s + t.totalBayar, 0))}</td>
                <td class="text-right">${formatCurrency(stats.totalTagihan)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Export to Image
  const exportToImage = async () => {
    try {
      showToast('Sedang membuat gambar...', 'success');
      
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '950px';
      tempContainer.style.backgroundColor = '#ffffff';
      tempContainer.style.padding = '40px';
      tempContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      tempContainer.style.color = '#1f2937';
      tempContainer.style.lineHeight = '1.5';
      
      tempContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 15px;">
          <h1 style="margin: 0; font-size: 26px; color: #1f2937; font-weight: 700; letter-spacing: -0.5px;">Laporan Tagihan Toko (Tempo)</h1>
        </div>
        <div style="text-align: center; color: #6b7280; margin-bottom: 30px; font-size: 14px;">
          Toko: <strong>${filterStore === 'all' ? 'Semua' : filterStore.toUpperCase()}</strong> &nbsp;|&nbsp; 
          Periode: <strong>${filterMonthFrom}</strong> s/d <strong>${filterMonthTo}</strong> &nbsp;|&nbsp; 
          Tanggal Cetak: <strong>${new Date().toLocaleDateString('id-ID')}</strong>
        </div>
        
        <div style="display: flex; gap: 12px; margin-bottom: 30px; justify-content: flex-start;">
          <div style="flex: 1; max-width: 200px; padding: 15px 20px; border: 1px solid #fed7aa; border-radius: 10px; background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);">
            <div style="font-size: 18px; font-weight: 700; color: #ea580c; margin-bottom: 4px;">${formatCurrency(stats.totalTagihan)}</div>
            <div style="color: #6b7280; font-size: 12px; font-weight: 500;">Total Tagihan</div>
          </div>
          <div style="flex: 1; max-width: 200px; padding: 15px 20px; border: 1px solid #ddd6fe; border-radius: 10px; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);">
            <div style="font-size: 18px; font-weight: 700; color: #7c3aed; margin-bottom: 4px;">${formatCurrency(stats.tempo3Bln)}</div>
            <div style="color: #6b7280; font-size: 12px; font-weight: 500;">Tempo 3 Bulan</div>
          </div>
          <div style="flex: 1; max-width: 200px; padding: 15px 20px; border: 1px solid #bfdbfe; border-radius: 10px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);">
            <div style="font-size: 18px; font-weight: 700; color: #2563eb; margin-bottom: 4px;">${formatCurrency(stats.tempo2Bln)}</div>
            <div style="color: #6b7280; font-size: 12px; font-weight: 500;">Tempo 2 Bulan</div>
          </div>
          <div style="flex: 1; max-width: 200px; padding: 15px 20px; border: 1px solid #bbf7d0; border-radius: 10px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);">
            <div style="font-size: 18px; font-weight: 700; color: #16a34a; margin-bottom: 4px;">${formatCurrency(stats.tempo1Bln)}</div>
            <div style="color: #6b7280; font-size: 12px; font-weight: 500;">Tempo 1 Bulan</div>
          </div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1f2937; table-layout: fixed;">
          <thead>
            <tr style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);">
              <th style="width: 40px; border: 1px solid #d1d5db; padding: 12px 8px; text-align: center; color: #374151; font-weight: 600;">No</th>
              <th style="width: 180px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: left; color: #374151; font-weight: 600;">Customer</th>
              <th style="width: 80px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: center; color: #374151; font-weight: 600;">Tempo</th>
              <th style="width: 140px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Total Tagihan</th>
              <th style="width: 130px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Total Bayar</th>
              <th style="width: 140px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Sisa Tagihan</th>
              <th style="width: 100px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: center; color: #374151; font-weight: 600;">Terakhir</th>
            </tr>
          </thead>
          <tbody>
            ${filteredToko.map((t, idx) => `
              <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; color: #6b7280; font-size: 12px;">${idx + 1}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; font-weight: 600; color: #1f2937; font-size: 13px;">${t.customer}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center;">
                  <span style="display: inline-block; background: ${t.tempo.includes('3') ? '#f3e8ff' : t.tempo.includes('2') ? '#dbeafe' : '#dcfce7'}; color: ${t.tempo.includes('3') ? '#7c3aed' : t.tempo.includes('2') ? '#2563eb' : '#16a34a'}; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">${t.tempo}</span>
                </td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #374151; font-size: 13px;">${formatCurrency(t.totalTagihan)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #16a34a; font-weight: 600; font-size: 13px;">${formatCurrency(t.totalBayar)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #ea580c; font-weight: 700; font-size: 13px;">${formatCurrency(t.sisaTagihan)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">${formatDate(t.lastTransaction)}</td>
              </tr>
            `).join('')}
            <tr style="background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);">
              <td colspan="3" style="border: 1px solid #9ca3af; padding: 12px 10px; font-weight: 700; color: #1f2937; font-size: 13px;">TOTAL (${filteredToko.length} customer)</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #1f2937; font-size: 13px;">${formatCurrency(filteredToko.reduce((s, t) => s + t.totalTagihan, 0))}</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #16a34a; font-size: 13px;">${formatCurrency(filteredToko.reduce((s, t) => s + t.totalBayar, 0))}</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #ea580c; font-size: 13px;">${formatCurrency(stats.totalTagihan)}</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px;"></td>
            </tr>
          </tbody>
        </table>
        
        <div style="margin-top: 25px; text-align: center; color: #9ca3af; font-size: 11px; font-weight: 500;">
          Generated by Gudang MJM-BJW System
        </div>
      `;
      
      document.body.appendChild(tempContainer);
      
      const canvas = await html2canvas(tempContainer, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(tempContainer);

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `tagihan-toko-${filterStore === 'all' ? 'semua' : filterStore}-${filterMonthFrom}-${filterMonthTo}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          showToast('Gambar berhasil disimpan!', 'success');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Error exporting to image:', err);
      showToast('Gagal export gambar', 'error');
    }
  };

  // Calculate estimasi sisa for payment
  const estimasiSisa = useMemo(() => {
    if (!selectedToko) return 0;
    const paymentValue = parseFloat(parseCurrencyInput(paymentAmount)) || 0;
    return selectedToko.sisaTagihan - paymentValue;
  }, [selectedToko, paymentAmount]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg animate-in slide-in-from-top ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-orange-900/30 rounded-xl">
            <Store className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Tagihan Toko (Tempo)</h1>
            <p className="text-gray-400 text-sm">Kelola tagihan dari toko dengan tempo pembayaran</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 border border-orange-800/30 rounded-xl p-4">
          <div className="text-orange-400 text-xs font-medium mb-1">Total Tagihan</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.totalTagihan)}</div>
          <div className="text-gray-400 text-xs mt-1">{filteredToko.length} customer</div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-800/30 rounded-xl p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Tempo 3 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo3Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{filteredToko.filter(t => t.tempo.includes('3')).length} customer</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30 rounded-xl p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Tempo 2 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo2Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{filteredToko.filter(t => t.tempo.includes('2')).length} customer</div>
        </div>
        <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-800/30 rounded-xl p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Tempo 1 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo1Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{filteredToko.filter(t => t.tempo.includes('1')).length} customer</div>
        </div>
        <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 border border-yellow-800/30 rounded-xl p-4">
          <div className="text-yellow-400 text-xs font-medium mb-1">Tempo Lainnya</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempoLainnya)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('belum_lunas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'belum_lunas'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Belum Lunas</span>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            activeTab === 'belum_lunas' ? 'bg-orange-800 text-orange-200' : 'bg-gray-700 text-gray-400'
          }`}>
            {tokoList.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('sudah_lunas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'sudah_lunas'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Check className="w-4 h-4" />
          <span>Sudah Lunas</span>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            activeTab === 'sudah_lunas' ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'
          }`}>
            {tokoLunas.length}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <select
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          >
            <option value="all">Semua Toko</option>
            <option value="mjm">MJM</option>
            <option value="bjw">BJW</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <select
            value={filterTempo}
            onChange={(e) => setFilterTempo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          >
            <option value="all">Semua Tempo</option>
            {tempoTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Month Range Filter */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Periode:</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={filterMonthFrom}
            onChange={(e) => setFilterMonthFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-orange-500 transition-colors"
          />
          <span className="text-gray-400">s/d</span>
          <input
            type="month"
            value={filterMonthTo}
            onChange={(e) => setFilterMonthTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-orange-500 transition-colors"
          />
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setShowTagihanModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Tambah Tagihan</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden md:inline">PDF</span>
          </button>
          <button
            onClick={exportToImage}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden md:inline">Image</span>
          </button>
        </div>
      </div>

      {/* Toko List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Memuat data tagihan...</p>
          </div>
        ) : filteredToko.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Tidak ada data tagihan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Tempo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Total Tagihan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Sudah Bayar</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Sisa</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Transaksi</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredToko.map((toko) => (
                  <tr key={`${toko.customer}_${toko.tempo}`} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-700 rounded-lg">
                          <Store className="w-4 h-4 text-orange-400" />
                        </div>
                        <span className="font-medium text-white">{toko.customer}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        toko.tempo.includes('3') ? 'bg-purple-900/50 text-purple-300' :
                        toko.tempo.includes('2') ? 'bg-blue-900/50 text-blue-300' :
                        'bg-green-900/50 text-green-300'
                      }`}>
                        {toko.tempo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-white">{formatCurrency(toko.totalTagihan + toko.totalTagihanManual)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-green-400 font-medium">{formatCurrency(toko.totalBayar)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${toko.sisaTagihan > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                        {formatCurrency(toko.sisaTagihan)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-400 text-sm">{toko.transactions.length} item</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedToko(toko);
                            setShowHistoryModal(true);
                            setHistorySearchTerm('');
                            setHistoryDateFilter('');
                          }}
                          className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
                          title="Lihat riwayat"
                        >
                          <History className="w-4 h-4 text-gray-400" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedToko(toko);
                            setShowPaymentModal(true);
                            setPaymentAmount('');
                            setPaymentNote('');
                            setPaymentDate(new Date().toISOString().split('T')[0]);
                          }}
                          className="p-2 hover:bg-green-900/50 rounded-lg transition-colors"
                          title="Input pembayaran"
                        >
                          <DollarSign className="w-4 h-4 text-green-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedToko && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Input Pembayaran</h3>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-gray-700/50 rounded-xl p-3">
                <div className="text-sm text-gray-400">Customer</div>
                <div className="text-lg font-semibold text-white">{selectedToko.customer}</div>
                <div className="text-xs text-gray-500 mt-1">Tempo: {selectedToko.tempo}</div>
              </div>
              
              <div className="bg-orange-900/30 border border-orange-800/50 rounded-xl p-3">
                <div className="text-sm text-orange-400">Sisa Tagihan Saat Ini</div>
                <div className="text-xl font-bold text-orange-300">{formatCurrency(selectedToko.sisaTagihan)}</div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Jumlah Pembayaran</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">Rp.</span>
                  <input
                    type="text"
                    value={formatCurrencyInput(paymentAmount)}
                    onChange={(e) => setPaymentAmount(parseCurrencyInput(e.target.value))}
                    className="w-full pl-12 pr-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    placeholder="0"
                  />
                </div>
                {paymentAmount && (
                  <div className={`mt-2 text-sm ${estimasiSisa > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                    Estimasi sisa: {formatCurrency(estimasiSisa)}
                    {estimasiSisa <= 0 && ' (LUNAS)'}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  placeholder="Contoh: Transfer Bank BCA"
                />
              </div>
            </div>
            
            <div className="flex gap-2 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitPayment}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedToko && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl border border-gray-700 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Riwayat - {selectedToko.customer}</h3>
                <span className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-400">{selectedToko.tempo}</span>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setEditingPayment(null);
                  setEditingTransaction(null);
                  setEditingTagihan(null);
                }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Total Tagihan</div>
                  <div className="text-lg font-bold text-white">{formatCurrency(selectedToko.totalTagihan)}</div>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Tagihan Manual</div>
                  <div className="text-lg font-bold text-yellow-400">{formatCurrency(selectedToko.totalTagihanManual)}</div>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Total Bayar</div>
                  <div className="text-lg font-bold text-green-400">{formatCurrency(selectedToko.totalBayar)}</div>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Sisa Tagihan</div>
                  <div className={`text-lg font-bold ${selectedToko.sisaTagihan > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                    {formatCurrency(selectedToko.sisaTagihan)}
                  </div>
                </div>
              </div>

              {/* Search and Filter */}
              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari nama barang / part number..."
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-blue-500"
                  />
                </div>
                <input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-blue-500"
                />
                {(historySearchTerm || historyDateFilter) && (
                  <button
                    onClick={() => {
                      setHistorySearchTerm('');
                      setHistoryDateFilter('');
                    }}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-xl text-sm text-white"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Transactions */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Transaksi Ambil Barang ({filteredTransactions.length} item)
                </h4>
                <div className="bg-gray-700/30 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-700/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-400">Tanggal</th>
                        <th className="px-3 py-2 text-left text-gray-400">Nama Barang</th>
                        <th className="px-3 py-2 text-right text-gray-400">Qty</th>
                        <th className="px-3 py-2 text-right text-gray-400">Total</th>
                        <th className="px-3 py-2 text-center text-gray-400">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-700/30">
                          <td className="px-3 py-2 text-gray-300">{formatDate(t.created_at)}</td>
                          <td className="px-3 py-2 text-white">{t.name || t.part_number}</td>
                          <td className="px-3 py-2 text-right text-gray-300">
                            {editingTransaction?.id === t.id ? (
                              <input
                                type="number"
                                value={editTransactionQty}
                                onChange={(e) => setEditTransactionQty(e.target.value)}
                                className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-right"
                              />
                            ) : (
                              t.qty_keluar
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-400 font-medium">
                            {editingTransaction?.id === t.id ? (
                              <input
                                type="number"
                                value={editTransactionHarga}
                                onChange={(e) => setEditTransactionHarga(e.target.value)}
                                className="w-24 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-right"
                              />
                            ) : (
                              formatCurrency(t.harga_total)
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {editingTransaction?.id === t.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={handleSaveEditTransaction}
                                  className="p-1 hover:bg-green-900/50 rounded"
                                >
                                  <Save className="w-4 h-4 text-green-400" />
                                </button>
                                <button
                                  onClick={() => setEditingTransaction(null)}
                                  className="p-1 hover:bg-gray-600 rounded"
                                >
                                  <X className="w-4 h-4 text-gray-400" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleEditTransaction(t)}
                                className="p-1 hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="w-4 h-4 text-gray-400" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Manual Tagihan */}
              {selectedToko.tagihanManual.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Tagihan Manual ({selectedToko.tagihanManual.length})
                  </h4>
                  <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-yellow-900/30">
                        <tr>
                          <th className="px-3 py-2 text-left text-yellow-400">Tanggal</th>
                          <th className="px-3 py-2 text-left text-yellow-400">Keterangan</th>
                          <th className="px-3 py-2 text-right text-yellow-400">Jumlah</th>
                          <th className="px-3 py-2 text-center text-yellow-400">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-yellow-800/30">
                        {selectedToko.tagihanManual.map((t) => (
                          <tr key={t.id} className="hover:bg-yellow-900/20">
                            <td className="px-3 py-2 text-gray-300">
                              {editingTagihan?.id === t.id ? (
                                <input
                                  type="date"
                                  value={editTagihanDate}
                                  onChange={(e) => setEditTagihanDate(e.target.value)}
                                  className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
                                />
                              ) : (
                                formatDate(t.tanggal)
                              )}
                            </td>
                            <td className="px-3 py-2 text-white">
                              {editingTagihan?.id === t.id ? (
                                <input
                                  type="text"
                                  value={editTagihanNote}
                                  onChange={(e) => setEditTagihanNote(e.target.value)}
                                  className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
                                />
                              ) : (
                                t.keterangan
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-yellow-400 font-medium">
                              {editingTagihan?.id === t.id ? (
                                <input
                                  type="number"
                                  value={editTagihanAmount}
                                  onChange={(e) => setEditTagihanAmount(e.target.value)}
                                  className="w-28 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-right"
                                />
                              ) : (
                                formatCurrency(t.jumlah)
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {editingTagihan?.id === t.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={handleSaveEditTagihan}
                                    className="p-1 hover:bg-green-900/50 rounded"
                                  >
                                    <Save className="w-4 h-4 text-green-400" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTagihan(null)}
                                    className="p-1 hover:bg-gray-600 rounded"
                                  >
                                    <X className="w-4 h-4 text-gray-400" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleEditTagihan(t)}
                                    className="p-1 hover:bg-gray-600 rounded"
                                  >
                                    <Edit2 className="w-4 h-4 text-gray-400" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTagihan(t.id)}
                                    className="p-1 hover:bg-red-900/50 rounded"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payments */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Riwayat Pembayaran ({tokoPayments.length})
                </h4>
                {tokoPayments.length === 0 ? (
                  <div className="bg-gray-700/30 rounded-xl p-4 text-center text-gray-400">
                    Belum ada pembayaran
                  </div>
                ) : (
                  <div className="bg-green-900/20 border border-green-800/30 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-green-900/30">
                        <tr>
                          <th className="px-3 py-2 text-left text-green-400">Tanggal</th>
                          <th className="px-3 py-2 text-left text-green-400">Keterangan</th>
                          <th className="px-3 py-2 text-right text-green-400">Jumlah</th>
                          <th className="px-3 py-2 text-center text-green-400">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-green-800/30">
                        {tokoPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-green-900/20">
                            <td className="px-3 py-2 text-gray-300">
                              {editingPayment?.id === p.id ? (
                                <input
                                  type="date"
                                  value={editPaymentDate}
                                  onChange={(e) => setEditPaymentDate(e.target.value)}
                                  className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
                                />
                              ) : (
                                formatDate(p.tanggal)
                              )}
                            </td>
                            <td className="px-3 py-2 text-white">
                              {editingPayment?.id === p.id ? (
                                <input
                                  type="text"
                                  value={editPaymentNote}
                                  onChange={(e) => setEditPaymentNote(e.target.value)}
                                  className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
                                />
                              ) : (
                                p.keterangan
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-green-400 font-medium">
                              {editingPayment?.id === p.id ? (
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Rp.</span>
                                  <input
                                    type="text"
                                    value={formatCurrencyInput(editPaymentAmount)}
                                    onChange={(e) => setEditPaymentAmount(parseCurrencyInput(e.target.value))}
                                    className="w-28 pl-8 pr-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-right"
                                  />
                                </div>
                              ) : (
                                formatCurrency(p.jumlah)
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {editingPayment?.id === p.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={handleSaveEditPayment}
                                    className="p-1 hover:bg-green-900/50 rounded"
                                  >
                                    <Save className="w-4 h-4 text-green-400" />
                                  </button>
                                  <button
                                    onClick={() => setEditingPayment(null)}
                                    className="p-1 hover:bg-gray-600 rounded"
                                  >
                                    <X className="w-4 h-4 text-gray-400" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleEditPayment(p)}
                                    className="p-1 hover:bg-gray-600 rounded"
                                  >
                                    <Edit2 className="w-4 h-4 text-gray-400" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="p-1 hover:bg-red-900/50 rounded"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tagihan Modal */}
      {showTagihanModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-400" />
                <h3 className="text-lg font-semibold text-white">Tambah Tagihan Manual</h3>
              </div>
              <button
                onClick={() => setShowTagihanModal(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Customer</label>
                <input
                  type="text"
                  value={tagihanCustomer}
                  onChange={(e) => setTagihanCustomer(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  placeholder="Contoh: RIZKI"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tempo</label>
                <select
                  value={tagihanTempo}
                  onChange={(e) => setTagihanTempo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Pilih Tempo</option>
                  <option value="1 BLN">1 BLN</option>
                  <option value="2 BLN">2 BLN</option>
                  <option value="3 BLN">3 BLN</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Jumlah Tagihan</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">Rp.</span>
                  <input
                    type="text"
                    value={formatCurrencyInput(tagihanAmount)}
                    onChange={(e) => setTagihanAmount(parseCurrencyInput(e.target.value))}
                    className="w-full pl-12 pr-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    placeholder="0"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={tagihanDate}
                  onChange={(e) => setTagihanDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={tagihanNote}
                  onChange={(e) => setTagihanNote(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  placeholder="Contoh: Tagihan bulan November"
                />
              </div>
            </div>
            
            <div className="flex gap-2 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowTagihanModal(false)}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitTagihan}
                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
