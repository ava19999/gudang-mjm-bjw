// FILE: src/components/finance/PettyCashView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, Plus, Calendar, ArrowUpRight, ArrowDownRight, 
  Download, Printer, X, Check, Trash2, RefreshCw,
  Keyboard, Filter, Banknote, CreditCard
} from 'lucide-react';
import {
  getPettyCashEntries,
  addPettyCashEntry,
  deletePettyCashEntry,
  getTotalBalance,
  formatIndonesianNumber,
  PettyCashEntry
} from '../../services/pettyCashService';
import { useStore } from '../../context/StoreContext';

// Frequently used descriptions for autocomplete
const FREQUENT_DESCRIPTIONS = [
  'Pembelian ATK',
  'Biaya Transport',
  'Konsumsi',
  'Biaya Parkir',
  'Token Listrik',
  'Air Minum',
  'Biaya Cleaning Service',
  'Fotokopi',
  'Perbaikan & Pemeliharaan',
  'Biaya Lain-lain',
  'Penjualan Aset',
  'Penerimaan Kas',
  'Penggantian Dana',
  'Transfer Masuk',
  'Transfer Keluar',
];

interface PettyCashViewProps {
  refreshTrigger?: number;
}

export const PettyCashView: React.FC<PettyCashViewProps> = ({ refreshTrigger }) => {
  const { selectedStore } = useStore();
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({ cash: 0, bank: 0, total: 0 });
  const [isAdding, setIsAdding] = useState(false);
  
  // Form states
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<'in' | 'out'>('out');
  const [formAkun, setFormAkun] = useState<'cash' | 'bank'>('cash');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formAmountDisplay, setFormAmountDisplay] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [filterAkun, setFilterAkun] = useState<'all' | 'cash' | 'bank'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Refs
  const dateInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Load data from database
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPettyCashEntries(selectedStore);
      setEntries(data);
      const bal = await getTotalBalance(selectedStore);
      setBalances(bal);
    } catch (err) {
      console.error('Failed to load entries:', err);
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, [refreshTrigger, selectedStore]);
  
  // Set today's date when modal opens
  useEffect(() => {
    if (isAdding) {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());
      setFormDate(today);
      setFormType('out');
      setFormAkun('cash');
      setFormDescription('');
      setFormAmount('');
      setFormAmountDisplay('');
      setTimeout(() => dateInputRef.current?.focus(), 100);
    }
  }, [isAdding]);
  
  // Handle autocomplete
  useEffect(() => {
    if (formDescription.trim() && showSuggestions) {
      const filtered = FREQUENT_DESCRIPTIONS.filter(desc =>
        desc.toLowerCase().includes(formDescription.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setSelectedSuggestionIndex(-1);
    } else {
      setFilteredSuggestions([]);
    }
  }, [formDescription, showSuggestions]);
  
  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (filterType !== 'all' && entry.type !== filterType) return false;
    if (filterAkun !== 'all' && entry.akun !== filterAkun) return false;
    const entryDate = entry.tgl.split('T')[0];
    if (filterDateFrom && entryDate < filterDateFrom) return false;
    if (filterDateTo && entryDate > filterDateTo) return false;
    return true;
  });
  
  // Split entries by account type
  const cashEntries = filteredEntries.filter(e => e.akun === 'cash');
  const bankEntries = filteredEntries.filter(e => e.akun === 'bank');
  
  // Handle amount input with Indonesian formatting
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const digitsOnly = rawValue.replace(/\D/g, '');
    
    if (digitsOnly === '') {
      setFormAmount('');
      setFormAmountDisplay('');
      return;
    }
    
    const numericValue = parseInt(digitsOnly, 10);
    setFormAmount(digitsOnly);
    setFormAmountDisplay(formatIndonesianNumber(numericValue));
  };
  
  const handleAddEntry = async () => {
    if (!formDate || !formDescription.trim() || !formAmount) {
      showToast('Mohon lengkapi semua field', 'error');
      return;
    }
    
    const amount = parseInt(formAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      showToast('Jumlah harus berupa angka positif', 'error');
      return;
    }
    
    setLoading(true);
    
    const result = await addPettyCashEntry(selectedStore, {
      tgl: formDate,
      keterangan: formDescription.trim(),
      type: formType,
      akun: formAkun,
      amount: amount,
    });
    
    if (result.success) {
      showToast('Transaksi berhasil ditambahkan');
      setIsAdding(false);
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    
    setLoading(true);
    const result = await deletePettyCashEntry(selectedStore, id);
    
    if (result.success) {
      showToast('Transaksi berhasil dihapus');
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent, field: 'date' | 'description' | 'amount') => {
    if (e.key === 'Enter') {
      if (field === 'amount') {
        e.preventDefault();
        handleAddEntry();
      } else if (field === 'description' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        setFormDescription(filteredSuggestions[selectedSuggestionIndex]);
        setShowSuggestions(false);
      }
    }
    
    if (field === 'description' && showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };
  
  const handleDownloadCSV = () => {
    // Helper untuk format tanggal CSV tanpa konversi timezone
    const formatDateCSV = (dateStr: string) => {
      try {
        const datePart = dateStr.split(/[T\s]/)[0];
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
      } catch {
        return dateStr;
      }
    };
    
    const headers = ['Tanggal', 'Akun', 'Keterangan', 'Tipe', 'Jumlah', 'Saldo'];
    const rows = filteredEntries.map(entry => [
      formatDateCSV(entry.tgl),
      entry.akun === 'cash' ? 'Kas' : 'Rekening',
      entry.keterangan,
      entry.type === 'in' ? 'Masuk' : 'Keluar',
      entry.saldokeluarmasuk,
      entry.saldosaatini,
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `petty_cash_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  const formatDate = (dateStr: string) => {
    try {
      // Parse tanggal tanpa konversi timezone
      // Format dari Supabase: "2026-02-03 17:58:00+00" atau "2026-02-03T17:58:00+00:00"
      const datePart = dateStr.split(/[T\s]/)[0]; // Ambil bagian tanggal saja (YYYY-MM-DD)
      const [year, month, day] = datePart.split('-').map(Number);
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${String(day).padStart(2, '0')} ${months[month - 1]} ${year}`;
    } catch {
      return dateStr;
    }
  };
  
  // Reusable Transaction Table Component
  const TransactionTable = ({ 
    title, 
    icon: Icon, 
    iconColor, 
    entries: tableEntries, 
    balance 
  }: { 
    title: string; 
    icon: any; 
    iconColor: string;
    entries: PettyCashEntry[];
    balance: number;
  }) => (
    <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
      <div className={`p-4 border-b border-gray-700 flex items-center justify-between ${iconColor}`}>
        <div className="flex items-center gap-2">
          <Icon size={20} />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <span className="text-sm text-gray-400">{tableEntries.length} transaksi</span>
      </div>
      
      <div className="overflow-x-auto max-h-96">
        <table className="w-full">
          <thead className="bg-gray-700 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold">Tanggal</th>
              <th className="px-4 py-3 text-left text-xs font-semibold">Keterangan</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Masuk</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Keluar</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Saldo</th>
              <th className="px-4 py-3 text-center text-xs font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {tableEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  <Icon size={32} className="mx-auto mb-2 opacity-50" />
                  Belum ada transaksi
                </td>
              </tr>
            ) : (
              tableEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-2 text-xs">{formatDate(entry.tgl)}</td>
                  <td className="px-4 py-2 text-xs">{entry.keterangan}</td>
                  <td className="px-4 py-2 text-xs text-right">
                    {entry.type === 'in' ? (
                      <span className="text-green-400 font-semibold">
                        +Rp {formatIndonesianNumber(entry.saldokeluarmasuk)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs text-right">
                    {entry.type === 'out' ? (
                      <span className="text-red-400 font-semibold">
                        -Rp {formatIndonesianNumber(entry.saldokeluarmasuk)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs text-right font-semibold">
                    Rp {formatIndonesianNumber(entry.saldosaatini)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="p-1.5 text-red-400 hover:bg-red-600/20 rounded-lg transition-colors"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-2 text-white text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={14}/>
          </button>
        </div>
      )}
      
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-green-600 rounded-xl">
            <Wallet size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Manajemen Kas Kecil</h1>
            <p className="text-sm text-gray-400">Petty Cash Management</p>
          </div>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <p className="text-green-200 text-sm font-medium">Saldo Saat Ini</p>
          <div className="flex gap-2">
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-semibold text-white"
            >
              <Plus size={20} />
              Tambah
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-semibold text-white"
            >
              <Printer size={20} />
              Print
            </button>
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-semibold text-white"
            >
              <Download size={20} />
              Download
            </button>
          </div>
        </div>
        
        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-200 mb-1">
              <Banknote size={16} />
              <span className="text-sm">Kas</span>
            </div>
            <p className="text-2xl font-bold text-white">
              Rp {formatIndonesianNumber(balances.cash)}
            </p>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-200 mb-1">
              <CreditCard size={16} />
              <span className="text-sm">Rekening</span>
            </div>
            <p className="text-2xl font-bold text-white">
              Rp {formatIndonesianNumber(balances.bank)}
            </p>
          </div>
          
          <div className="bg-white/20 rounded-xl p-4">
            <p className="text-green-200 text-sm mb-1">Total Saldo</p>
            <p className="text-3xl font-bold text-white">
              Rp {formatIndonesianNumber(balances.total)}
            </p>
          </div>
        </div>
      </div>
      
      {/* Filter Section */}
      <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm font-medium">Filter Transaksi</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipe Transaksi</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Semua</option>
              <option value="in">Masuk</option>
              <option value="out">Keluar</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Akun</label>
            <select
              value={filterAkun}
              onChange={(e) => setFilterAkun(e.target.value as any)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Semua</option>
              <option value="cash">Kas</option>
              <option value="bank">Rekening</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={loadData}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>
      
      {/* Two Tables Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kas (Cash) Table */}
        <TransactionTable
          title="Kas"
          icon={Banknote}
          iconColor="text-green-400"
          entries={cashEntries}
          balance={balances.cash}
        />
        
        {/* Rekening (Bank) Table */}
        <TransactionTable
          title="Rekening"
          icon={CreditCard}
          iconColor="text-blue-400"
          entries={bankEntries}
          balance={balances.bank}
        />
      </div>
      
      {/* Add Entry Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Plus size={24} className="text-green-400" />
                Tambah Transaksi
              </h3>
              <button
                onClick={() => setIsAdding(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  <Calendar size={14} className="inline mr-1" />
                  Tanggal
                </label>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'date')}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              {/* Akun (Cash / Bank) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Akun</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFormAkun('cash')}
                    className={`py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      formAkun === 'cash' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Banknote size={18} />
                    Kas
                  </button>
                  <button
                    onClick={() => setFormAkun('bank')}
                    className={`py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      formAkun === 'bank' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <CreditCard size={18} />
                    Rekening
                  </button>
                </div>
              </div>
              
              {/* Type (In / Out) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tipe</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFormType('in')}
                    className={`py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      formType === 'in' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <ArrowUpRight size={18} />
                    Masuk
                  </button>
                  <button
                    onClick={() => setFormType('out')}
                    className={`py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      formType === 'out' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <ArrowDownRight size={18} />
                    Keluar
                  </button>
                </div>
              </div>
              
              {/* Description */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-1">Keterangan</label>
                <input
                  ref={descriptionInputRef}
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={(e) => handleKeyDown(e, 'description')}
                  placeholder="Masukkan keterangan..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:ring-2 focus:ring-green-500"
                />
                
                {/* Autocomplete dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredSuggestions.map((suggestion, index) => (
                      <div
                        key={suggestion}
                        onMouseDown={() => {
                          setFormDescription(suggestion);
                          setShowSuggestions(false);
                        }}
                        className={`px-4 py-2 cursor-pointer ${
                          index === selectedSuggestionIndex
                            ? 'bg-green-600 text-white'
                            : 'hover:bg-gray-600'
                        }`}
                      >
                        {suggestion}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Jumlah (Rp)
                </label>
                <input
                  ref={amountInputRef}
                  type="text"
                  inputMode="numeric"
                  value={formAmountDisplay}
                  onChange={handleAmountChange}
                  onKeyDown={(e) => handleKeyDown(e, 'amount')}
                  placeholder="Contoh: 5000000 untuk 5 juta"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ketik angka saja, format otomatis. Contoh: 5000000 → 5.000.000
                </p>
              </div>
              
              {/* Keyboard shortcuts */}
              <div className="bg-gray-700/50 rounded-lg p-3 text-xs text-gray-400">
                <div className="flex items-center gap-2 mb-1">
                  <Keyboard size={14} />
                  <span className="font-medium text-gray-300">Shortcuts:</span>
                </div>
                <p className="ml-5">Enter: Simpan • ↑↓: Navigasi saran</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setIsAdding(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-xl transition-colors font-medium"
              >
                Batal
              </button>
              <button 
                onClick={handleAddEntry}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-3 rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
              >
                {loading ? (
                  <RefreshCw size={20} className="animate-spin" />
                ) : (
                  <Check size={20} />
                )}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .bg-gray-900, .bg-gray-800 { background: white !important; border: 1px solid #ccc !important; }
          .text-gray-100, .text-gray-200, .text-gray-300 { color: #000 !important; }
          .text-gray-400, .text-gray-500 { color: #666 !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
};
