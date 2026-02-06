// FILE: src/components/finance/PiutangCustomerView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CreditCard, Search, Filter, Calendar, RefreshCw, 
  ChevronDown, ChevronUp, Clock, DollarSign, User,
  Plus, X, Check, History, FileText, Download, Building2, Receipt,
  Edit2, Trash2, Save, Image as ImageIcon
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '../../services/supabaseClient';
import { useStore } from '../../context/StoreContext';

// Types
interface BarangMasukRecord {
  id: number;
  part_number: string;
  nama_barang: string;
  qty_masuk: number;
  harga_satuan: number;
  harga_total: number;
  customer: string;
  tempo: string;
  ecommerce: string;
  created_at: string;
  stok_akhir: number;
}

interface Tagihan {
  id: number;
  customer: string;
  tempo: string;
  tanggal: string;
  jumlah: number;
  keterangan: string;
  created_at: string;
  store: string;
}

interface CustomerPiutang {
  customer: string;
  tempo: string;
  totalPiutang: number;
  totalTagihanManual: number;
  totalBayar: number;
  sisaPiutang: number;
  lastTransaction: string;
  lastPaymentDate: string | null;
  transactions: BarangMasukRecord[];
  tagihanManual: Tagihan[];
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
  for_months: string;
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

export const PiutangCustomerView: React.FC = () => {
  const { selectedStore } = useStore();
  
  // Data states
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerPiutang[]>([]);
  const [customersLunas, setCustomersLunas] = useState<CustomerPiutang[]>([]);
  const [pembayaranList, setPembayaranList] = useState<Pembayaran[]>([]);
  const [tagihanList, setTagihanList] = useState<Tagihan[]>([]);
  
  // Tab state: belum_lunas or sudah_lunas
  const [activeTab, setActiveTab] = useState<'belum_lunas' | 'sudah_lunas'>('belum_lunas');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTempo, setFilterTempo] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<'all' | 'mjm' | 'bjw'>(
    selectedStore === 'mjm' ? 'mjm' : selectedStore === 'bjw' ? 'bjw' : 'mjm'
  );
  const [filterMonth, setFilterMonth] = useState(''); // Will be set after finding oldest unpaid month
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Modal states
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPiutang | null>(null);
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
  const [editingTransaction, setEditingTransaction] = useState<BarangMasukRecord | null>(null);
  const [editingTagihan, setEditingTagihan] = useState<Tagihan | null>(null);
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

  // Sync filterStore with selectedStore when user changes store in header
  useEffect(() => {
    if (selectedStore === 'mjm' || selectedStore === 'bjw') {
      setFilterStore(selectedStore);
    }
  }, [selectedStore]);

  // Get tempo types (excluding CASH and NADIR)
  const tempoTypes = useMemo(() => {
    const types = new Set<string>();
    customers.forEach(c => {
      if (c.tempo) types.add(c.tempo);
    });
    return Array.from(types).sort();
  }, [customers]);

  // Helper function to calculate due date based on tempo
  const calculateDueMonth = (transactionDate: string, tempo: string): string => {
    const date = new Date(transactionDate);
    // Extract tempo months (e.g., "3 BLN" -> 3, "2 BLN" -> 2)
    const tempoMatch = tempo.match(/(\d+)/);
    const tempoMonths = tempoMatch ? parseInt(tempoMatch[1]) : 1;
    date.setMonth(date.getMonth() + tempoMonths);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      // Determine which tables to query based on filter
      const storesToQuery = filterStore === 'all' 
        ? ['mjm', 'bjw'] 
        : [filterStore];

      const allRecords: BarangMasukRecord[] = [];
      
      // For due date filtering, we need to fetch records from previous months
      // For example, if filterMonth is Feb 2026:
      // - 3 BLN tempo: need Nov 2025 transactions
      // - 2 BLN tempo: need Dec 2025 transactions  
      // - 1 BLN tempo: need Jan 2026 transactions
      // So we fetch from 3 months before up to the selected month
      const selectedDate = new Date(filterMonth + '-01');
      const fetchFromDate = new Date(selectedDate);
      fetchFromDate.setMonth(fetchFromDate.getMonth() - 3); // Go back 3 months
      const fetchFromStr = `${fetchFromDate.getFullYear()}-${String(fetchFromDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      // Also set cutoff at Oct 2025 since those are already paid
      const cutoffDate = '2025-11-01';
      const actualFetchFrom = fetchFromStr < cutoffDate ? cutoffDate : fetchFromStr;
      
      for (const store of storesToQuery) {
        const tableName = store === 'mjm' ? 'barang_masuk_mjm' : 'barang_masuk_bjw';
        
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .not('tempo', 'ilike', '%CASH%')
          .not('tempo', 'ilike', '%NADIR%')
          .not('tempo', 'ilike', '%RETUR%')
          .not('tempo', 'ilike', '%STOK%')
          .not('tempo', 'is', null)
          .not('tempo', 'eq', '')
          .not('tempo', 'eq', '-')
          .gte('created_at', actualFetchFrom)
          .order('created_at', { ascending: false });

        if (error) {
          console.error(`Error fetching from ${tableName}:`, error);
        } else if (data) {
          // Filter records where due month matches the selected filterMonth
          const filteredData = data.filter(record => {
            const dueMonth = calculateDueMonth(record.created_at, record.tempo || '1 BLN');
            return dueMonth === filterMonth;
          });
          allRecords.push(...filteredData);
        }
      }

      // For pembayaran, we need to fetch payments for the transaction months that have due date in filterMonth
      // E.g., for Feb 2026: Nov 2025 (3 BLN), Dec 2025 (2 BLN), Jan 2026 (1 BLN)
      // So we fetch payments with for_months from 3 months before filterMonth up to filterMonth-1
      const pembayaranFromDate = new Date(selectedDate);
      pembayaranFromDate.setMonth(pembayaranFromDate.getMonth() - 3);
      const pembayaranFromStr = `${pembayaranFromDate.getFullYear()}-${String(pembayaranFromDate.getMonth() + 1).padStart(2, '0')}-01`;
      const pembayaranToDate = new Date(selectedDate);
      pembayaranToDate.setDate(0); // Last day of previous month
      const pembayaranToStr = pembayaranToDate.toISOString().split('T')[0];

      // Load pembayaran data - filtered by for_months (the month of the original transaction)
      const { data: pembayaranDataRaw } = await supabase
        .from('importir_pembayaran')
        .select('*')
        .gte('for_months', pembayaranFromStr)
        .lte('for_months', pembayaranToStr)
        .order('tanggal', { ascending: false });
      
      // Filter pembayaran to only include those whose transaction month + tempo = filterMonth
      // Also filter by toko column to separate payments per store
      const pembayaranData = (pembayaranDataRaw || []).filter(p => {
        if (!p.for_months || !p.tempo) return false;
        const dueMonth = calculateDueMonth(p.for_months, p.tempo);
        // Filter by toko if not 'all'
        if (filterStore !== 'all' && p.toko && p.toko.toLowerCase() !== filterStore) {
          return false;
        }
        return dueMonth === filterMonth;
      });
      
      setPembayaranList(pembayaranData);

      // Load tagihan manual data - also filter by due month
      const tagihanFetchFrom = new Date(selectedDate);
      tagihanFetchFrom.setMonth(tagihanFetchFrom.getMonth() - 3);
      const tagihanFetchFromStr = `${tagihanFetchFrom.getFullYear()}-${String(tagihanFetchFrom.getMonth() + 1).padStart(2, '0')}-01`;
      const actualTagihanFetchFrom = tagihanFetchFromStr < cutoffDate ? cutoffDate : tagihanFetchFromStr;
      
      const { data: tagihanDataRaw } = await supabase
        .from('importir_tagihan')
        .select('*')
        .gte('tanggal', actualTagihanFetchFrom)
        .order('tanggal', { ascending: false });
      
      // Filter tagihan by due month and store
      const tagihanData = (tagihanDataRaw || []).filter(t => {
        const dueMonth = calculateDueMonth(t.tanggal, t.tempo || '1 BLN');
        // Filter by store if not 'all'
        if (filterStore !== 'all' && t.store && t.store.toLowerCase() !== filterStore) {
          return false;
        }
        return dueMonth === filterMonth;
      });
      
      setTagihanList(tagihanData);

      // Group by customer and tempo
      const customerMap = new Map<string, CustomerPiutang>();
      
      allRecords.forEach(record => {
        const key = `${record.customer?.trim().toUpperCase() || 'UNKNOWN'}_${record.tempo?.trim().toUpperCase() || '-'}`;
        
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            customer: record.customer?.trim().toUpperCase() || 'UNKNOWN',
            tempo: record.tempo?.trim().toUpperCase() || '-',
            totalPiutang: 0,
            totalTagihanManual: 0,
            totalBayar: 0,
            sisaPiutang: 0,
            lastTransaction: record.created_at,
            lastPaymentDate: null,
            transactions: [],
            tagihanManual: [],
          });
        }
        
        const existing = customerMap.get(key)!;
        existing.totalPiutang += record.harga_total || 0;
        existing.transactions.push(record);
        
        // Update last transaction if newer
        if (new Date(record.created_at) > new Date(existing.lastTransaction)) {
          existing.lastTransaction = record.created_at;
        }
      });

      // Add tagihan manual to customers (or create new customer if not exists)
      (tagihanData || []).forEach(t => {
        const key = `${t.customer?.trim().toUpperCase() || 'UNKNOWN'}_${t.tempo?.trim().toUpperCase() || '-'}`;
        
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            customer: t.customer?.trim().toUpperCase() || 'UNKNOWN',
            tempo: t.tempo?.trim().toUpperCase() || '-',
            totalPiutang: 0,
            totalTagihanManual: 0,
            totalBayar: 0,
            sisaPiutang: 0,
            lastTransaction: t.tanggal,
            lastPaymentDate: null,
            transactions: [],
            tagihanManual: [],
          });
        }
        
        const existing = customerMap.get(key)!;
        existing.totalTagihanManual += t.jumlah || 0;
        existing.tagihanManual.push(t);
        
        // Update last transaction if newer
        if (new Date(t.tanggal) > new Date(existing.lastTransaction)) {
          existing.lastTransaction = t.tanggal;
        }
      });

      // Calculate totalBayar from pembayaran and track last payment date
      (pembayaranData || []).forEach(p => {
        const key = `${p.customer?.trim().toUpperCase() || 'UNKNOWN'}_${p.tempo || '-'}`;
        const customer = customerMap.get(key);
        if (customer) {
          customer.totalBayar += p.jumlah || 0;
          // Update last payment date if this payment is newer (use created_at from importir_pembayaran)
          if (!customer.lastPaymentDate || new Date(p.created_at) > new Date(customer.lastPaymentDate)) {
            customer.lastPaymentDate = p.created_at;
          }
        }
      });

      // Calculate sisa piutang (totalPiutang + totalTagihanManual - totalBayar)
      customerMap.forEach((customer) => {
        customer.sisaPiutang = customer.totalPiutang + customer.totalTagihanManual - customer.totalBayar;
      });

      // Convert to array - sort with lunas at bottom
      const allCustomers = Array.from(customerMap.values());
      
      // Belum lunas (sisa > 0) - sorted by sisa piutang descending
      const belumLunas = allCustomers
        .filter(c => c.sisaPiutang > 0)
        .sort((a, b) => b.sisaPiutang - a.sisaPiutang);

      // Sudah lunas (sisa <= 0 and has transactions) - sorted by last transaction
      const sudahLunas = allCustomers
        .filter(c => c.sisaPiutang <= 0 && c.totalPiutang > 0)
        .sort((a, b) => new Date(b.lastTransaction).getTime() - new Date(a.lastTransaction).getTime());

      // Combine: belum lunas first, then lunas at bottom
      setCustomers([...belumLunas, ...sudahLunas]);
      setCustomersLunas(sudahLunas);
    } catch (err) {
      console.error('Failed to load piutang data:', err);
      showToast('Gagal memuat data piutang', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Find oldest due month with unpaid records on initial load
  const findOldestUnpaidMonth = async () => {
    try {
      const storesToQuery = filterStore === 'all' ? ['mjm', 'bjw'] : [filterStore];
      let oldestDueMonth: string | null = null;

      for (const store of storesToQuery) {
        const tableName = store === 'mjm' ? 'barang_masuk_mjm' : 'barang_masuk_bjw';
        
        const { data } = await supabase
          .from(tableName)
          .select('created_at, tempo')
          .not('tempo', 'ilike', '%CASH%')
          .not('tempo', 'ilike', '%NADIR%')
          .not('tempo', 'ilike', '%RETUR%')
          .not('tempo', 'ilike', '%STOK%')
          .not('tempo', 'is', null)
          .not('tempo', 'eq', '')
          .not('tempo', 'eq', '-')
          .gte('created_at', '2025-11-01') // After Oct 2025 cutoff
          .order('created_at', { ascending: true })
          .limit(100); // Get enough records to find oldest due month

        if (data && data.length > 0) {
          data.forEach(record => {
            const dueMonth = calculateDueMonth(record.created_at, record.tempo || '1 BLN');
            if (!oldestDueMonth || dueMonth < oldestDueMonth) {
              oldestDueMonth = dueMonth;
            }
          });
        }
      }

      if (oldestDueMonth) {
        setFilterMonth(oldestDueMonth);
      } else {
        // Fallback to current month if no data found
        const now = new Date();
        setFilterMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      }
    } catch (err) {
      console.error('Failed to find oldest unpaid month:', err);
      // Fallback to current month
      const now = new Date();
      setFilterMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    } finally {
      setIsInitialLoad(false);
    }
  };

  // On initial mount, find oldest unpaid month
  useEffect(() => {
    if (isInitialLoad) {
      findOldestUnpaidMonth();
    }
  }, []);

  // Load data when filterMonth changes (but not during initial load)
  useEffect(() => {
    if (filterMonth && !isInitialLoad) {
      loadData();
    } else if (filterMonth && isInitialLoad) {
      // First load after finding oldest month
      loadData();
    }
  }, [filterStore, selectedStore, filterMonth]);

  // Filtered customers (based on active tab)
  const filteredCustomers = useMemo(() => {
    const sourceList = activeTab === 'belum_lunas' ? customers : customersLunas;
    return sourceList.filter(c => {
      // Search filter
      if (searchTerm && !c.customer.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      // Tempo filter
      if (filterTempo !== 'all' && c.tempo !== filterTempo) {
        return false;
      }
      return true;
    });
  }, [customers, customersLunas, activeTab, searchTerm, filterTempo]);

  // Statistics
  const stats = useMemo(() => {
    // Total sisa piutang (belum dibayar)
    const totalPiutang = filteredCustomers.reduce((sum, c) => sum + c.sisaPiutang, 0);
    
    // Per tempo: sisa, total tagihan, total bayar
    const tempo3BlnCustomers = filteredCustomers.filter(c => c.tempo.includes('3'));
    const tempo3Bln = tempo3BlnCustomers.reduce((sum, c) => sum + c.sisaPiutang, 0);
    const tempo3BlnTagihan = tempo3BlnCustomers.reduce((sum, c) => sum + c.totalPiutang + c.totalTagihanManual, 0);
    const tempo3BlnBayar = tempo3BlnCustomers.reduce((sum, c) => sum + c.totalBayar, 0);
    
    const tempo2BlnCustomers = filteredCustomers.filter(c => c.tempo.includes('2'));
    const tempo2Bln = tempo2BlnCustomers.reduce((sum, c) => sum + c.sisaPiutang, 0);
    const tempo2BlnTagihan = tempo2BlnCustomers.reduce((sum, c) => sum + c.totalPiutang + c.totalTagihanManual, 0);
    const tempo2BlnBayar = tempo2BlnCustomers.reduce((sum, c) => sum + c.totalBayar, 0);
    
    const tempo1BlnCustomers = filteredCustomers.filter(c => c.tempo.includes('1'));
    const tempo1Bln = tempo1BlnCustomers.reduce((sum, c) => sum + c.sisaPiutang, 0);
    const tempo1BlnTagihan = tempo1BlnCustomers.reduce((sum, c) => sum + c.totalPiutang + c.totalTagihanManual, 0);
    const tempo1BlnBayar = tempo1BlnCustomers.reduce((sum, c) => sum + c.totalBayar, 0);
    
    const tempoLainnya = totalPiutang - tempo3Bln - tempo2Bln - tempo1Bln;
    
    // Total keseluruhan
    const totalTagihan = filteredCustomers.reduce((sum, c) => sum + c.totalPiutang + c.totalTagihanManual, 0);
    const totalBayar = filteredCustomers.reduce((sum, c) => sum + c.totalBayar, 0);
    
    return { 
      totalPiutang, totalTagihan, totalBayar,
      tempo3Bln, tempo3BlnTagihan, tempo3BlnBayar, tempo3BlnCount: tempo3BlnCustomers.length,
      tempo2Bln, tempo2BlnTagihan, tempo2BlnBayar, tempo2BlnCount: tempo2BlnCustomers.length,
      tempo1Bln, tempo1BlnTagihan, tempo1BlnBayar, tempo1BlnCount: tempo1BlnCustomers.length,
      tempoLainnya 
    };
  }, [filteredCustomers]);

  // Handle payment submission
  const handleSubmitPayment = async () => {
    if (!selectedCustomer || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      showToast('Masukkan jumlah pembayaran yang valid', 'error');
      return;
    }

    try {
      // Calculate the original transaction month based on tempo
      // E.g., if filterMonth is Feb 2026 and tempo is 3 BLN, 
      // the original transaction was in Nov 2025 (Feb 2026 - 3 months)
      const tempoMatch = selectedCustomer.tempo.match(/(\d+)/);
      const tempoMonths = tempoMatch ? parseInt(tempoMatch[1]) : 1;
      const dueDate = new Date(filterMonth + '-01');
      const transactionDate = new Date(dueDate);
      transactionDate.setMonth(transactionDate.getMonth() - tempoMonths);
      const forMonthsValue = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}-01`;

      const { error } = await supabase
        .from('importir_pembayaran')
        .insert([{
          customer: selectedCustomer.customer,
          tempo: selectedCustomer.tempo,
          tanggal: paymentDate || new Date().toISOString().split('T')[0],
          jumlah: parseFloat(paymentAmount),
          keterangan: paymentNote || 'Pembayaran piutang',
          store: filterStore === 'all' ? 'all' : filterStore,
          for_months: forMonthsValue,
          toko: selectedStore?.toUpperCase() || 'MJM',
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
    if (!tagihanCustomer || !tagihanAmount || parseFloat(tagihanAmount) <= 0) {
      showToast('Masukkan nama importir dan jumlah tagihan yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('importir_tagihan')
        .insert([{
          customer: tagihanCustomer.trim().toUpperCase(),
          tempo: tagihanTempo || '1 BLN',
          tanggal: tagihanDate || new Date().toISOString().split('T')[0],
          jumlah: parseFloat(tagihanAmount),
          keterangan: tagihanNote || 'Tagihan manual',
          store: selectedStore?.toUpperCase() || 'MJM',
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

  // Get payment history for selected customer
  const customerPayments = useMemo(() => {
    if (!selectedCustomer) return [];
    return pembayaranList.filter(p => 
      p.customer?.toUpperCase() === selectedCustomer.customer &&
      (p.tempo === selectedCustomer.tempo || !p.tempo)
    );
  }, [selectedCustomer, pembayaranList]);

  // Filtered transactions for history modal (by nama_barang and date)
  const filteredTransactions = useMemo(() => {
    if (!selectedCustomer) return [];
    
    return selectedCustomer.transactions.filter(t => {
      // Filter by search term (part_number or nama_barang)
      if (historySearchTerm) {
        const searchLower = historySearchTerm.toLowerCase();
        const matchPartNumber = t.part_number?.toLowerCase().includes(searchLower);
        const matchNamaBarang = t.nama_barang?.toLowerCase().includes(searchLower);
        if (!matchPartNumber && !matchNamaBarang) return false;
      }
      
      // Filter by date
      if (historyDateFilter) {
        const transactionDate = t.created_at.split('T')[0];
        if (transactionDate !== historyDateFilter) return false;
      }
      
      return true;
    });
  }, [selectedCustomer, historySearchTerm, historyDateFilter]);

  // Handle edit payment
  const handleEditPayment = (payment: Pembayaran) => {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.jumlah.toString());
    setEditPaymentNote(payment.keterangan || '');
    setEditPaymentDate(payment.tanggal);
  };

  // Handle save edited payment
  const handleSaveEditPayment = async () => {
    if (!editingPayment || !editPaymentAmount || parseFloat(editPaymentAmount) <= 0) {
      showToast('Masukkan jumlah pembayaran yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('importir_pembayaran')
        .update({
          jumlah: parseFloat(editPaymentAmount),
          keterangan: editPaymentNote || 'Pembayaran piutang',
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
        .from('importir_pembayaran')
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
  const handleEditTransaction = (transaction: BarangMasukRecord) => {
    setEditingTransaction(transaction);
    setEditTransactionQty(transaction.qty_masuk.toString());
    setEditTransactionHarga(transaction.harga_satuan.toString());
  };

  // Handle save edited transaction (update barang_masuk + stok)
  const handleSaveEditTransaction = async () => {
    if (!editingTransaction || !editTransactionQty || parseInt(editTransactionQty) <= 0) {
      showToast('Masukkan qty yang valid', 'error');
      return;
    }

    const newQty = parseInt(editTransactionQty);
    const newHarga = parseFloat(editTransactionHarga) || editingTransaction.harga_satuan;
    const oldQty = editingTransaction.qty_masuk;
    const qtyDiff = newQty - oldQty; // positive = add stock, negative = reduce stock

    try {
      // Determine which table based on the transaction
      // We need to find which store this transaction is from
      let tableName = '';
      
      // Try MJM first
      const { data: mjmData } = await supabase
        .from('barang_masuk_mjm')
        .select('id')
        .eq('id', editingTransaction.id)
        .single();
      
      if (mjmData) {
        tableName = 'barang_masuk_mjm';
      } else {
        tableName = 'barang_masuk_bjw';
      }

      // Update the barang_masuk record
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          qty_masuk: newQty,
          harga_satuan: newHarga,
          harga_total: newQty * newHarga,
        })
        .eq('id', editingTransaction.id);

      if (updateError) throw updateError;

      // Update stock in inventory if qty changed
      if (qtyDiff !== 0) {
        const inventoryTable = tableName === 'barang_masuk_mjm' ? 'inventory_mjm' : 'inventory_bjw';
        
        // Get current stock
        const { data: inventoryData } = await supabase
          .from(inventoryTable)
          .select('stok_akhir')
          .eq('part_number', editingTransaction.part_number)
          .single();

        if (inventoryData) {
          const currentStock = inventoryData.stok_akhir || 0;
          const newStock = Math.max(0, currentStock + qtyDiff); // Prevent negative stock

          const { error: stockError } = await supabase
            .from(inventoryTable)
            .update({ stok_akhir: newStock })
            .eq('part_number', editingTransaction.part_number);

          if (stockError) {
            console.error('Error updating stock:', stockError);
            // Don't throw - transaction update succeeded
          }
        }
      }

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
  const handleEditTagihan = (tagihan: Tagihan) => {
    setEditingTagihan(tagihan);
    setEditTagihanAmount(tagihan.jumlah.toString());
    setEditTagihanNote(tagihan.keterangan || '');
    setEditTagihanDate(tagihan.tanggal);
  };

  // Handle save edited tagihan
  const handleSaveEditTagihan = async () => {
    if (!editingTagihan || !editTagihanAmount || parseFloat(editTagihanAmount) <= 0) {
      showToast('Masukkan jumlah tagihan yang valid', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('importir_tagihan')
        .update({
          jumlah: parseFloat(editTagihanAmount),
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
        .from('importir_tagihan')
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
          <title>Laporan Piutang Customer - ${new Date().toLocaleDateString('id-ID')}</title>
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
          <h1>Laporan Piutang Customer (Tempo)</h1>
          <div class="subtitle">Toko: ${filterStore === 'all' ? 'Semua' : filterStore.toUpperCase()} | Periode: ${filterMonth} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</div>
          
          <div class="stats">
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(stats.totalPiutang)}</div>
              <div class="stat-label">Total Piutang</div>
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
                <th class="text-right">Total Piutang</th>
                <th class="text-right">Total Bayar</th>
                <th class="text-right">Sisa Piutang</th>
                <th>Transaksi Terakhir</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCustomers.map((c, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${c.customer}</td>
                  <td>${c.tempo}</td>
                  <td class="text-right">${formatCurrency(c.totalPiutang + c.totalTagihanManual)}</td>
                  <td class="text-right">${formatCurrency(c.totalBayar)}</td>
                  <td class="text-right">${formatCurrency(c.sisaPiutang)}</td>
                  <td>${formatDate(c.lastTransaction)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">TOTAL</td>
                <td class="text-right">${formatCurrency(filteredCustomers.reduce((s, c) => s + c.totalPiutang + c.totalTagihanManual, 0))}</td>
                <td class="text-right">${formatCurrency(filteredCustomers.reduce((s, c) => s + c.totalBayar, 0))}</td>
                <td class="text-right">${formatCurrency(stats.totalPiutang)}</td>
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
      
      // Create a temporary container with the same layout as PDF
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
          <h1 style="margin: 0; font-size: 26px; color: #1f2937; font-weight: 700; letter-spacing: -0.5px;">Laporan Piutang Customer (Tempo)</h1>
        </div>
        <div style="text-align: center; color: #6b7280; margin-bottom: 30px; font-size: 14px;">
          Toko: <strong>${filterStore === 'all' ? 'Semua' : filterStore.toUpperCase()}</strong> &nbsp;|&nbsp; 
          Periode: <strong>${filterMonth}</strong> &nbsp;|&nbsp; 
          Tanggal Cetak: <strong>${new Date().toLocaleDateString('id-ID')}</strong>
        </div>
        
        <div style="display: flex; gap: 12px; margin-bottom: 30px; justify-content: flex-start;">
          <div style="flex: 1; max-width: 200px; padding: 15px 20px; border: 1px solid #fecaca; border-radius: 10px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);">
            <div style="font-size: 18px; font-weight: 700; color: #dc2626; margin-bottom: 4px;">${formatCurrency(stats.totalPiutang)}</div>
            <div style="color: #6b7280; font-size: 12px; font-weight: 500;">Total Piutang</div>
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
              <th style="width: 140px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Total Piutang</th>
              <th style="width: 130px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Total Bayar</th>
              <th style="width: 140px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: right; color: #374151; font-weight: 600;">Sisa Piutang</th>
              <th style="width: 100px; border: 1px solid #d1d5db; padding: 12px 10px; text-align: center; color: #374151; font-weight: 600;">Terakhir Bayar</th>
            </tr>
          </thead>
          <tbody>
            ${filteredCustomers.map((c, idx) => `
              <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; color: #6b7280; font-size: 12px;">${idx + 1}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; font-weight: 600; color: #1f2937; font-size: 13px;">${c.customer}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center;">
                  <span style="display: inline-block; background: ${c.tempo.includes('3') ? '#f3e8ff' : c.tempo.includes('2') ? '#dbeafe' : '#dcfce7'}; color: ${c.tempo.includes('3') ? '#7c3aed' : c.tempo.includes('2') ? '#2563eb' : '#16a34a'}; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">${c.tempo}</span>
                </td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #374151; font-size: 13px;">${formatCurrency(c.totalPiutang + c.totalTagihanManual)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #16a34a; font-weight: 600; font-size: 13px;">${formatCurrency(c.totalBayar)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: #dc2626; font-weight: 700; font-size: 13px;">${formatCurrency(c.sisaPiutang)}</td>
                <td style="border: 1px solid #d1d5db; padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">${c.lastPaymentDate ? formatDate(c.lastPaymentDate) : '-'}</td>
              </tr>
            `).join('')}
            <tr style="background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);">
              <td colspan="3" style="border: 1px solid #9ca3af; padding: 12px 10px; font-weight: 700; color: #1f2937; font-size: 13px;">TOTAL (${filteredCustomers.length} customer)</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #1f2937; font-size: 13px;">${formatCurrency(filteredCustomers.reduce((s, c) => s + c.totalPiutang + c.totalTagihanManual, 0))}</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #16a34a; font-size: 13px;">${formatCurrency(filteredCustomers.reduce((s, c) => s + c.totalBayar, 0))}</td>
              <td style="border: 1px solid #9ca3af; padding: 12px 10px; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 700; color: #dc2626; font-size: 13px;">${formatCurrency(stats.totalPiutang)}</td>
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

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `piutang-customer-${filterStore === 'all' ? 'semua' : filterStore}-${filterMonth}.png`;
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
          <div className="p-2 bg-red-900/30 rounded-xl">
            <CreditCard className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Piutang Customer (Tempo)</h1>
            <p className="text-gray-400 text-sm">Kelola piutang dari supplier dengan tempo pembayaran</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gradient-to-br from-red-900/40 to-red-800/20 border border-red-800/30 rounded-xl p-4">
          <div className="text-red-400 text-xs font-medium mb-1">Total Sisa Piutang</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.totalPiutang)}</div>
          <div className="text-gray-400 text-xs mt-1">{filteredCustomers.length} customer</div>
          <div className="mt-2 pt-2 border-t border-red-800/30 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tagihan:</span>
              <span className="text-gray-300">{formatCompactNumber(stats.totalTagihan)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Dibayar:</span>
              <span className="text-green-400">{formatCompactNumber(stats.totalBayar)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-800/30 rounded-xl p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Tempo 3 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo3Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{stats.tempo3BlnCount} customer</div>
          <div className="mt-2 pt-2 border-t border-purple-800/30 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tagihan:</span>
              <span className="text-gray-300">{formatCompactNumber(stats.tempo3BlnTagihan)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Dibayar:</span>
              <span className="text-green-400">{formatCompactNumber(stats.tempo3BlnBayar)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30 rounded-xl p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Tempo 2 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo2Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{stats.tempo2BlnCount} customer</div>
          <div className="mt-2 pt-2 border-t border-blue-800/30 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tagihan:</span>
              <span className="text-gray-300">{formatCompactNumber(stats.tempo2BlnTagihan)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Dibayar:</span>
              <span className="text-green-400">{formatCompactNumber(stats.tempo2BlnBayar)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-800/30 rounded-xl p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Tempo 1 BLN</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempo1Bln)}</div>
          <div className="text-gray-400 text-xs mt-1">{stats.tempo1BlnCount} customer</div>
          <div className="mt-2 pt-2 border-t border-green-800/30 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tagihan:</span>
              <span className="text-gray-300">{formatCompactNumber(stats.tempo1BlnTagihan)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Dibayar:</span>
              <span className="text-green-400">{formatCompactNumber(stats.tempo1BlnBayar)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 border border-yellow-800/30 rounded-xl p-4">
          <div className="text-yellow-400 text-xs font-medium mb-1">Tempo Lainnya</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.tempoLainnya)}</div>
        </div>
      </div>

      {/* Tabs: Belum Lunas / Sudah Lunas */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('belum_lunas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'belum_lunas'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Belum Lunas</span>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            activeTab === 'belum_lunas' ? 'bg-red-800 text-red-200' : 'bg-gray-700 text-gray-400'
          }`}>
            {customers.length}
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
            {customersLunas.length}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
          />
        </div>

        {/* Store Filter */}
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <select
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
          >
            <option value="all">Semua Toko</option>
            <option value="mjm">MJM</option>
            <option value="bjw">BJW</option>
          </select>
        </div>

        {/* Tempo Filter */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <select
            value={filterTempo}
            onChange={(e) => setFilterTempo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
          >
            <option value="all">Semua Tempo</option>
            {tempoTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Month Filter - Now filters by payment due date */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Jatuh Tempo:</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            min="2025-12"
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
          />
        </div>
        <div className="text-xs text-gray-500 bg-gray-800/50 px-2 py-1 rounded-lg">
          ℹ️ Tagihan jatuh tempo bulan ini (transaksi + tempo)
        </div>

        {/* Actions */}
        <div className="flex gap-2 md:ml-auto">
          <button
            onClick={() => {
              setShowTagihanModal(true);
              setTagihanDate(new Date().toISOString().split('T')[0]);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors"
          >
            <Receipt className="w-4 h-4" />
            <span className="hidden md:inline">Tambah Tagihan</span>
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Refresh</span>
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export PDF</span>
          </button>
          <button
            onClick={exportToImage}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden md:inline">Save Image</span>
          </button>
        </div>
      </div>

      {/* Customer List */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-gray-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-400">Memuat data...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center">
            {activeTab === 'belum_lunas' ? (
              <>
                <CreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Tidak ada piutang ditemukan</p>
              </>
            ) : (
              <>
                <Check className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Tidak ada data pembayaran lunas</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Tempo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Piutang</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Bayar</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">{activeTab === 'belum_lunas' ? 'Sisa' : 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Terakhir</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredCustomers.map((customer, idx) => (
                  <tr key={`${customer.customer}-${customer.tempo}`} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          activeTab === 'belum_lunas' ? 'bg-red-900/30' : 'bg-green-900/30'
                        }`}>
                          <User className={`w-4 h-4 ${activeTab === 'belum_lunas' ? 'text-red-400' : 'text-green-400'}`} />
                        </div>
                        <span className="font-medium">{customer.customer}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        customer.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                        customer.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                        customer.tempo.includes('1') ? 'bg-green-900/40 text-green-300' :
                        'bg-yellow-900/40 text-yellow-300'
                      }`}>
                        {customer.tempo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      {formatCurrency(customer.totalPiutang + customer.totalTagihanManual)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-green-400">
                      {formatCurrency(customer.totalBayar)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-red-400">
                      {activeTab === 'belum_lunas' ? (
                        formatCurrency(customer.sisaPiutang)
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/40 text-green-400 rounded-lg text-xs">
                          <Check className="w-3 h-3" />
                          LUNAS
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(customer.lastTransaction)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {activeTab === 'belum_lunas' && (
                          <button
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowPaymentModal(true);
                              setPaymentDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                            title="Input Pembayaran"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setHistorySearchTerm('');
                            setHistoryDateFilter('');
                            setShowHistoryModal(true);
                          }}
                          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                          title="Lihat Detail"
                        >
                          <History className="w-4 h-4" />
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
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Input Pembayaran</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentAmount('');
                  setPaymentNote('');
                }}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-900/50 rounded-xl p-3">
                <div className="text-sm text-gray-400">Customer</div>
                <div className="font-semibold text-lg">{selectedCustomer.customer}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">{selectedCustomer.tempo}</span>
                  <span className="text-sm text-red-400">Sisa: {formatCurrency(selectedCustomer.sisaPiutang)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Tanggal Pembayaran</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Jumlah Pembayaran</label>
                <input
                  type="text"
                  value={paymentAmount ? `Rp ${parseInt(paymentAmount).toLocaleString('id-ID')}` : ''}
                  onChange={(e) => {
                    // Remove all non-digit characters and update state
                    const numericValue = e.target.value.replace(/[^\d]/g, '');
                    setPaymentAmount(numericValue);
                  }}
                  placeholder="Rp 0"
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 text-lg font-semibold"
                />
                {/* Estimasi Sisa Hutang */}
                {paymentAmount && parseFloat(paymentAmount) > 0 && selectedCustomer && (
                  <div className="mt-2 p-2 bg-gray-800 rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Sisa saat ini:</span>
                      <span className="text-red-400">{formatCurrency(selectedCustomer.sisaPiutang)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Pembayaran:</span>
                      <span className="text-green-400">- {formatCurrency(parseFloat(paymentAmount))}</span>
                    </div>
                    <div className="border-t border-gray-700 mt-1 pt-1 flex justify-between text-sm font-semibold">
                      <span className="text-gray-300">Estimasi sisa:</span>
                      <span className={selectedCustomer.sisaPiutang - parseFloat(paymentAmount) <= 0 ? 'text-green-400' : 'text-yellow-400'}>
                        {selectedCustomer.sisaPiutang - parseFloat(paymentAmount) <= 0 
                          ? 'LUNAS ✓' 
                          : formatCurrency(selectedCustomer.sisaPiutang - parseFloat(paymentAmount))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Keterangan (opsional)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Contoh: Transfer BCA, Tunai, dll"
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentAmount('');
                  setPaymentNote('');
                }}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitPayment}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History/Detail Modal */}
      {showHistoryModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedCustomer.customer}</h3>
                <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">{selectedCustomer.tempo}</span>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Summary */}
            <div className="p-4 bg-gray-900/30 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-400">Total Piutang</div>
                <div className="text-xl font-bold text-white">{formatCurrency(selectedCustomer.totalPiutang + selectedCustomer.totalTagihanManual)}</div>
                <div className="text-xs text-gray-500">
                  {selectedCustomer.totalTagihanManual > 0 && `(+${formatCurrency(selectedCustomer.totalTagihanManual)} manual)`}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">Total Bayar</div>
                <div className="text-xl font-bold text-green-400">{formatCurrency(selectedCustomer.totalBayar)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">Sisa Piutang</div>
                <div className="text-xl font-bold text-red-400">{formatCurrency(selectedCustomer.sisaPiutang)}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Payment History */}
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  Riwayat Pembayaran
                </h4>
                {customerPayments.length === 0 ? (
                  <p className="text-gray-500 text-sm">Belum ada pembayaran</p>
                ) : (
                  <div className="space-y-2">
                    {customerPayments.map((p) => (
                      <div key={p.id} className="bg-gray-900/50 rounded-lg p-3">
                        {editingPayment?.id === p.id ? (
                          // Edit Mode
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={editPaymentDate}
                                onChange={(e) => setEditPaymentDate(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                              />
                              <input
                                type="number"
                                value={editPaymentAmount}
                                onChange={(e) => setEditPaymentAmount(e.target.value)}
                                placeholder="Jumlah"
                                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                              />
                            </div>
                            <input
                              type="text"
                              value={editPaymentNote}
                              onChange={(e) => setEditPaymentNote(e.target.value)}
                              placeholder="Keterangan"
                              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setEditingPayment(null)}
                                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs"
                              >
                                Batal
                              </button>
                              <button
                                onClick={handleSaveEditPayment}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded-lg text-xs flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{formatDate(p.tanggal)}</div>
                              <div className="text-xs text-gray-400">{p.keterangan}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-green-400 font-semibold">{formatCurrency(p.jumlah)}</span>
                              <button
                                onClick={() => handleEditPayment(p)}
                                className="p-1.5 bg-blue-600/30 hover:bg-blue-600/50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3 h-3 text-blue-400" />
                              </button>
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                className="p-1.5 bg-red-600/30 hover:bg-red-600/50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Tagihan History */}
              {selectedCustomer.tagihanManual && selectedCustomer.tagihanManual.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-orange-400" />
                    Tagihan Manual ({selectedCustomer.tagihanManual.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedCustomer.tagihanManual.map((t) => (
                      <div key={t.id} className="bg-orange-900/20 border border-orange-800/30 rounded-lg p-3">
                        {editingTagihan?.id === t.id ? (
                          // Edit Mode
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={editTagihanDate}
                                onChange={(e) => setEditTagihanDate(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                              />
                              <input
                                type="number"
                                value={editTagihanAmount}
                                onChange={(e) => setEditTagihanAmount(e.target.value)}
                                placeholder="Jumlah"
                                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                              />
                            </div>
                            <input
                              type="text"
                              value={editTagihanNote}
                              onChange={(e) => setEditTagihanNote(e.target.value)}
                              placeholder="Keterangan"
                              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setEditingTagihan(null)}
                                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs"
                              >
                                Batal
                              </button>
                              <button
                                onClick={handleSaveEditTagihan}
                                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded-lg text-xs flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{formatDate(t.tanggal)}</div>
                              <div className="text-xs text-gray-400">{t.keterangan}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-orange-400 font-semibold">{formatCurrency(t.jumlah)}</span>
                              <button
                                onClick={() => handleEditTagihan(t)}
                                className="p-1.5 bg-orange-600/30 hover:bg-orange-600/50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3 h-3 text-orange-400" />
                              </button>
                              <button
                                onClick={() => handleDeleteTagihan(t.id)}
                                className="p-1.5 bg-red-600/30 hover:bg-red-600/50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction History */}
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Riwayat Transaksi dari Barang Masuk ({selectedCustomer.transactions.length})
                </h4>
                
                {/* Search Bar for Transactions */}
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Cari part number / nama barang..."
                      value={historySearchTerm}
                      onChange={(e) => setHistorySearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <input
                    type="date"
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {(historySearchTerm || historyDateFilter) && (
                    <button
                      onClick={() => {
                        setHistorySearchTerm('');
                        setHistoryDateFilter('');
                      }}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                    >
                      Reset
                    </button>
                  )}
                </div>
                
                {/* Filter Info */}
                {(historySearchTerm || historyDateFilter) && (
                  <div className="text-xs text-blue-400 mb-2">
                    Menampilkan {filteredTransactions.length} dari {selectedCustomer.transactions.length} transaksi
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredTransactions.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      {selectedCustomer.transactions.length === 0 
                        ? 'Tidak ada transaksi dari barang_masuk' 
                        : 'Tidak ada transaksi yang cocok dengan filter'}
                    </p>
                  ) : (
                    filteredTransactions.map((t) => (
                      <div key={t.id} className="bg-gray-900/50 rounded-lg p-3">
                        {editingTransaction?.id === t.id ? (
                          // Edit Mode
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{t.part_number}</span>
                              <span className="text-xs text-gray-400">{formatDate(t.created_at)}</span>
                            </div>
                            <div className="text-xs text-gray-400">{t.nama_barang}</div>
                            <div className="flex gap-2 items-center">
                              <div className="flex-1">
                                <label className="text-xs text-gray-500">Qty</label>
                                <input
                                  type="number"
                                  value={editTransactionQty}
                                  onChange={(e) => setEditTransactionQty(e.target.value)}
                                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                                />
                              </div>
                              <span className="text-gray-500 pt-5">x</span>
                              <div className="flex-1">
                                <label className="text-xs text-gray-500">Harga</label>
                                <input
                                  type="number"
                                  value={editTransactionHarga}
                                  onChange={(e) => setEditTransactionHarga(e.target.value)}
                                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white"
                                />
                              </div>
                              <span className="text-gray-500 pt-5">=</span>
                              <div className="pt-5 text-sm font-semibold text-yellow-400">
                                {formatCurrency((parseInt(editTransactionQty) || 0) * (parseFloat(editTransactionHarga) || 0))}
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setEditingTransaction(null)}
                                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs"
                              >
                                Batal
                              </button>
                              <button
                                onClick={handleSaveEditTransaction}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                Update + Stok
                              </button>
                            </div>
                            <div className="text-xs text-yellow-400/70 bg-yellow-900/20 p-2 rounded">
                              ⚠️ Perubahan qty akan mengupdate stok di inventory (Qty lama: {t.qty_masuk})
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{t.part_number}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{formatDate(t.created_at)}</span>
                                <button
                                  onClick={() => handleEditTransaction(t)}
                                  className="p-1.5 bg-blue-600/30 hover:bg-blue-600/50 rounded-lg transition-colors"
                                  title="Edit Transaksi"
                                >
                                  <Edit2 className="w-3 h-3 text-blue-400" />
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-400">{t.nama_barang}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs">{t.qty_masuk} x {formatCurrency(t.harga_satuan)}</span>
                              <span className="text-sm font-semibold text-red-400">{formatCurrency(t.harga_total)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-700">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tagihan Modal */}
      {showTagihanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-orange-400" />
                Tambah Tagihan
              </h3>
              <button
                onClick={() => {
                  setShowTagihanModal(false);
                  setTagihanCustomer('');
                  setTagihanTempo('');
                  setTagihanAmount('');
                  setTagihanNote('');
                }}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nama Importir / Supplier *</label>
                <input
                  type="text"
                  value={tagihanCustomer}
                  onChange={(e) => setTagihanCustomer(e.target.value)}
                  placeholder="Contoh: PT MAJU JAYA"
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Tempo</label>
                <select
                  value={tagihanTempo}
                  onChange={(e) => setTagihanTempo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Pilih Tempo</option>
                  <option value="1 BLN">1 BLN</option>
                  <option value="2 BLN">2 BLN</option>
                  <option value="3 BLN">3 BLN</option>
                  <option value="LAINNYA">LAINNYA</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Tanggal Tagihan</label>
                <input
                  type="date"
                  value={tagihanDate}
                  onChange={(e) => setTagihanDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Jumlah Tagihan *</label>
                <input
                  type="number"
                  value={tagihanAmount}
                  onChange={(e) => setTagihanAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Keterangan (opsional)</label>
                <input
                  type="text"
                  value={tagihanNote}
                  onChange={(e) => setTagihanNote(e.target.value)}
                  placeholder="Contoh: Invoice #123, Tagihan bulan Nov, dll"
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div className="text-xs text-gray-500 bg-gray-900/50 p-2 rounded-lg">
                ℹ️ Tagihan ini akan ditambahkan sebagai piutang untuk importir yang dipilih, terpisah dari data barang_masuk
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => {
                  setShowTagihanModal(false);
                  setTagihanCustomer('');
                  setTagihanTempo('');
                  setTagihanAmount('');
                  setTagihanNote('');
                }}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitTagihan}
                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors flex items-center justify-center gap-2"
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
