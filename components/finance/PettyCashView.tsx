// FILE: src/components/finance/PettyCashView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, Plus, Calendar, ArrowUpRight, ArrowDownRight, 
  Upload, Download, Printer, X, Check, AlertCircle, 
  Keyboard, Search, Filter
} from 'lucide-react';
import { generateId, parseCSV } from '../../utils';

interface PettyCashEntry {
  id: string;
  date: string;
  description: string;
  type: 'in' | 'out';
  amount: number;
  balance: number;
  createdAt: number;
}

interface CSVPreviewEntry {
  date: string;
  description: string;
  type: 'in' | 'out';
  amount: number;
}

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
];

export const PettyCashView: React.FC = () => {
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  
  // Form states
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<'in' | 'out'>('out');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // CSV upload states
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [csvErrors, setCSVErrors] = useState<string[]>([]);
  const [csvPreview, setCSVPreview] = useState<CSVPreviewEntry[]>([]);
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  // Refs for keyboard navigation
  const dateInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  
  // Load data from localStorage on mount
  useEffect(() => {
    const savedEntries = localStorage.getItem('petty_cash_entries');
    if (savedEntries) {
      try {
        setEntries(JSON.parse(savedEntries));
      } catch (e) {
        console.error('Failed to load entries:', e);
      }
    }
  }, []);
  
  // Save to localStorage when entries change
  useEffect(() => {
    if (entries.length > 0) {
      localStorage.setItem('petty_cash_entries', JSON.stringify(entries));
    }
  }, [entries]);
  
  // Set today's date as default when modal opens
  useEffect(() => {
    if (isAdding) {
      const today = new Date().toISOString().split('T')[0];
      setFormDate(today);
      setFormType('out');
      setFormDescription('');
      setFormAmount('');
      setCSVErrors([]);
      // Focus on date field after modal opens
      setTimeout(() => dateInputRef.current?.focus(), 100);
    }
  }, [isAdding]);
  
  // Handle autocomplete suggestions
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
  
  const currentBalance = entries.length > 0 
    ? entries.reduce((max, entry) => 
        entry.createdAt > max.createdAt ? entry : max, entries[0]
      ).balance
    : 0;
  
  // Filter entries based on filter criteria
  const filteredEntries = entries.filter(entry => {
    if (filterType !== 'all' && entry.type !== filterType) return false;
    if (filterDateFrom && entry.date < filterDateFrom) return false;
    if (filterDateTo && entry.date > filterDateTo) return false;
    return true;
  });
  
  const handleAddEntry = () => {
    if (!formDate || !formDescription.trim() || !formAmount) {
      alert('Mohon lengkapi semua field');
      return;
    }
    
    const amount = parseFloat(formAmount.replace(/[^\d.-]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('Jumlah harus berupa angka positif');
      return;
    }
    
    const previousBalance = entries.length > 0 
      ? entries.reduce((max, entry) => 
          entry.createdAt > max.createdAt ? entry : max, entries[0]
        ).balance
      : 0;
    const newBalance = formType === 'in' 
      ? previousBalance + amount 
      : previousBalance - amount;
    
    const newEntry: PettyCashEntry = {
      id: generateId(),
      date: formDate,
      description: formDescription.trim(),
      type: formType,
      amount,
      balance: newBalance,
      createdAt: Date.now(),
    };
    
    setEntries(prev => [...prev, newEntry].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt - b.createdAt;
    }));
    
    setIsAdding(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent, field: 'date' | 'type' | 'description' | 'amount') => {
    // Handle Enter key for form submission
    if (e.key === 'Enter' && field === 'amount') {
      e.preventDefault();
      handleAddEntry();
      return;
    }
    
    // Handle Tab navigation
    if (e.key === 'Tab') {
      e.preventDefault();
      if (field === 'date') {
        // Focus on type selector - we'll just toggle it
        setFormType(prev => prev === 'in' ? 'out' : 'in');
        descriptionInputRef.current?.focus();
      } else if (field === 'description') {
        amountInputRef.current?.focus();
      } else if (field === 'amount') {
        submitButtonRef.current?.focus();
      }
    }
    
    // Handle autocomplete navigation
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
      } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        setFormDescription(filteredSuggestions[selectedSuggestionIndex]);
        setShowSuggestions(false);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };
  
  const handleCSVUpload = (file: File) => {
    setCSVFile(file);
    setCSVErrors([]);
    setCSVPreview([]);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        
        const errors: string[] = [];
        const validEntries: CSVPreviewEntry[] = [];
        
        parsed.forEach((row, index) => {
          const lineNum = index + 2; // +2 because index starts at 0 and we skip header
          
          // Validate required fields
          if (!row.date && !row.tanggal) {
            errors.push(`Baris ${lineNum}: Kolom tanggal tidak ditemukan`);
            return;
          }
          if (!row.description && !row.keterangan) {
            errors.push(`Baris ${lineNum}: Kolom keterangan tidak ditemukan`);
            return;
          }
          if (!row.type && !row.tipe) {
            errors.push(`Baris ${lineNum}: Kolom tipe tidak ditemukan`);
            return;
          }
          if (!row.amount && !row.jumlah) {
            errors.push(`Baris ${lineNum}: Kolom jumlah tidak ditemukan`);
            return;
          }
          
          const date = row.date || row.tanggal;
          const description = row.description || row.keterangan;
          const type = (row.type || row.tipe).toLowerCase();
          const amountStr = row.amount || row.jumlah;
          
          // Validate date format
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            errors.push(`Baris ${lineNum}: Format tanggal harus YYYY-MM-DD`);
            return;
          }
          
          // Validate type
          if (type !== 'in' && type !== 'out') {
            errors.push(`Baris ${lineNum}: Tipe harus 'in' atau 'out'`);
            return;
          }
          
          // Validate amount
          const amount = parseFloat(amountStr.replace(/[^\d.-]/g, ''));
          if (isNaN(amount) || amount <= 0) {
            errors.push(`Baris ${lineNum}: Jumlah harus berupa angka positif`);
            return;
          }
          
          validEntries.push({
            date,
            description,
            type: type as 'in' | 'out',
            amount,
          });
        });
        
        setCSVErrors(errors);
        setCSVPreview(validEntries);
        
      } catch (error) {
        setCSVErrors(['Gagal membaca file CSV. Pastikan format file benar.']);
      }
    };
    
    reader.readAsText(file);
  };
  
  const handleImportCSV = () => {
    if (csvPreview.length === 0) return;
    
    let currentBalance = entries.length > 0 
      ? entries.reduce((max, entry) => 
          entry.createdAt > max.createdAt ? entry : max, entries[0]
        ).balance
      : 0;
    const newEntries: PettyCashEntry[] = [];
    
    csvPreview.forEach(item => {
      currentBalance = item.type === 'in' 
        ? currentBalance + item.amount 
        : currentBalance - item.amount;
      
      newEntries.push({
        id: generateId(),
        date: item.date,
        description: item.description,
        type: item.type,
        amount: item.amount,
        balance: currentBalance,
        createdAt: Date.now(),
      });
    });
    
    setEntries(prev => [...prev, ...newEntries].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt - b.createdAt;
    }));
    
    setIsUploadingCSV(false);
    setCSVFile(null);
    setCSVPreview([]);
    setCSVErrors([]);
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleDownloadCSV = () => {
    const headers = ['Tanggal', 'Keterangan', 'Tipe', 'Jumlah', 'Saldo'];
    const rows = filteredEntries.map(entry => [
      entry.date,
      entry.description,
      entry.type,
      entry.amount,
      entry.balance,
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `petty-cash-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-600 p-3 rounded-xl">
                <Wallet size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">Petty Cash</h1>
                <p className="text-sm text-gray-400">Manajemen kas kecil</p>
              </div>
            </div>
            
            {/* Keyboard Shortcuts Info */}
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700">
              <Keyboard size={16} />
              <span>Tab: Next | Enter: Submit</span>
            </div>
          </div>
        </div>

        {/* Balance Card with Action Buttons */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-6 mb-6 shadow-xl">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">Saldo Saat Ini</p>
              <p className="text-4xl font-bold text-white">
                Rp {currentBalance.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={() => setIsAdding(true)}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
                title="Tambah transaksi baru"
              >
                <Plus size={20} />
                <span className="font-medium">Tambah</span>
              </button>
              <button 
                onClick={() => setIsUploadingCSV(true)}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
                title="Upload CSV untuk batch input"
              >
                <Upload size={20} />
                <span className="font-medium hidden sm:inline">Upload CSV</span>
              </button>
              <button 
                onClick={handlePrint}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
                title="Print transaksi"
              >
                <Printer size={20} />
                <span className="font-medium hidden sm:inline">Print</span>
              </button>
              <button 
                onClick={handleDownloadCSV}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
                title="Download CSV"
              >
                <Download size={20} />
                <span className="font-medium hidden sm:inline">Download</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-300">Filter Transaksi</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tipe</label>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Semua</option>
                <option value="in">Masuk</option>
                <option value="out">Keluar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Dari Tanggal</label>
              <input 
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sampai Tanggal</label>
              <input 
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          {(filterType !== 'all' || filterDateFrom || filterDateTo) && (
            <button 
              onClick={() => {
                setFilterType('all');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Entries List */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden print:border-gray-400">
          <div className="p-4 border-b border-gray-700 print:border-gray-400">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-100 print:text-gray-900">Riwayat Transaksi</h2>
              <span className="text-sm text-gray-400 print:text-gray-700">
                {filteredEntries.length} transaksi
              </span>
            </div>
          </div>
          
          {filteredEntries.length === 0 ? (
            <div className="p-12 text-center print:hidden">
              <Wallet size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg font-medium mb-2">
                {entries.length === 0 ? 'Belum ada transaksi' : 'Tidak ada transaksi yang sesuai filter'}
              </p>
              <p className="text-gray-500 text-sm">
                {entries.length === 0 
                  ? 'Klik tombol "Tambah" untuk membuat transaksi pertama'
                  : 'Coba ubah filter untuk melihat transaksi lainnya'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700 print:divide-gray-300">
              {filteredEntries.map((entry) => (
                <div key={entry.id} className="p-4 hover:bg-gray-750 transition-colors print:hover:bg-white print:py-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg print:hidden ${
                        entry.type === 'in' 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {entry.type === 'in' ? (
                          <ArrowDownRight size={20} />
                        ) : (
                          <ArrowUpRight size={20} />
                        )}
                      </div>
                      <div>
                        <p className="text-gray-100 font-medium print:text-gray-900">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar size={14} className="text-gray-500 print:text-gray-700" />
                          <p className="text-xs text-gray-400 print:text-gray-700">{entry.date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        entry.type === 'in' ? 'text-green-400 print:text-green-700' : 'text-red-400 print:text-red-700'
                      }`}>
                        {entry.type === 'in' ? '+' : '-'} Rp {entry.amount.toLocaleString('id-ID')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 print:text-gray-700">
                        Saldo: Rp {entry.balance.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal with Quick Form */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-100">Tambah Transaksi</h3>
              <button 
                onClick={() => setIsAdding(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Date Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tanggal
                </label>
                <input 
                  ref={dateInputRef}
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'date')}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              {/* Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tipe Transaksi
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormType('in')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 font-medium ${
                      formType === 'in'
                        ? 'border-green-500 bg-green-500/20 text-green-400'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <ArrowDownRight size={20} />
                    <span>Masuk</span>
                  </button>
                  <button
                    onClick={() => setFormType('out')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 font-medium ${
                      formType === 'out'
                        ? 'border-red-500 bg-red-500/20 text-red-400'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <ArrowUpRight size={20} />
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
              
              {/* Description Input with Autocomplete */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Keterangan
                </label>
                <div className="relative">
                  <input 
                    ref={descriptionInputRef}
                    type="text"
                    value={formDescription}
                    onChange={(e) => {
                      setFormDescription(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(e) => handleKeyDown(e, 'description')}
                    placeholder="Ketik untuk melihat saran..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 pr-10 text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                </div>
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredSuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setFormDescription(suggestion);
                          setShowSuggestions(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-gray-200 hover:bg-gray-600 transition-colors ${
                          index === selectedSuggestionIndex ? 'bg-gray-600' : ''
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Show all suggestions button */}
                {!showSuggestions && (
                  <button
                    onClick={() => setShowSuggestions(true)}
                    className="mt-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Lihat saran keterangan umum
                  </button>
                )}
              </div>
              
              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Jumlah (Rp)
                </label>
                <input 
                  ref={amountInputRef}
                  type="text"
                  inputMode="numeric"
                  value={formAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d]/g, '');
                    setFormAmount(value ? parseInt(value).toLocaleString('id-ID') : '');
                  }}
                  onKeyDown={(e) => handleKeyDown(e, 'amount')}
                  placeholder="0"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              {/* Keyboard Shortcuts Help */}
              <div className="bg-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-2">
                  <Keyboard size={14} />
                  <span className="font-medium text-gray-300">Keyboard Shortcuts:</span>
                </div>
                <div className="ml-5 space-y-0.5">
                  <p>• Tab: Pindah ke field berikutnya</p>
                  <p>• Enter: Simpan transaksi</p>
                  <p>• ↑↓: Navigasi saran keterangan</p>
                  <p>• Esc: Tutup saran</p>
                </div>
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
                ref={submitButtonRef}
                onClick={handleAddEntry}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Check size={20} />
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {isUploadingCSV && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-2xl w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-100">Upload CSV - Batch Input</h3>
              <button 
                onClick={() => {
                  setIsUploadingCSV(false);
                  setCSVFile(null);
                  setCSVErrors([]);
                  setCSVPreview([]);
                }}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* CSV Format Help */}
            <div className="bg-gray-700/50 rounded-lg p-4 mb-4 text-sm text-gray-300">
              <p className="font-medium mb-2">Format CSV yang dibutuhkan:</p>
              <div className="bg-gray-900 rounded p-3 font-mono text-xs overflow-x-auto">
                <div>date,description,type,amount</div>
                <div>2024-01-15,Pembelian ATK,out,50000</div>
                <div>2024-01-16,Penerimaan Kas,in,100000</div>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <p>• <strong>date</strong>: Format YYYY-MM-DD</p>
                <p>• <strong>description</strong>: Keterangan transaksi</p>
                <p>• <strong>type</strong>: 'in' (masuk) atau 'out' (keluar)</p>
                <p>• <strong>amount</strong>: Jumlah dalam angka</p>
                <p className="text-gray-400 mt-2">* Bisa juga menggunakan header Bahasa Indonesia: tanggal, keterangan, tipe, jumlah</p>
              </div>
            </div>
            
            {/* File Upload */}
            <div className="mb-4">
              <label className="block w-full">
                <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-gray-500 transition-colors cursor-pointer">
                  <Upload size={48} className="text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-300 font-medium mb-1">
                    {csvFile ? csvFile.name : 'Pilih file CSV'}
                  </p>
                  <p className="text-gray-500 text-sm">
                    Atau drag & drop file di sini
                  </p>
                </div>
                <input 
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCSVUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>
            
            {/* Errors */}
            {csvErrors.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={20} className="text-red-400" />
                  <p className="font-medium text-red-400">Ditemukan {csvErrors.length} error:</p>
                </div>
                <div className="space-y-1 text-sm text-red-300 max-h-32 overflow-y-auto">
                  {csvErrors.map((error, index) => (
                    <p key={index}>• {error}</p>
                  ))}
                </div>
              </div>
            )}
            
            {/* Preview */}
            {csvPreview.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-300 mb-2">
                  Preview: {csvPreview.length} transaksi valid
                </p>
                <div className="bg-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-600 sticky top-0">
                      <tr>
                        <th className="text-left p-2 text-gray-300">Tanggal</th>
                        <th className="text-left p-2 text-gray-300">Keterangan</th>
                        <th className="text-left p-2 text-gray-300">Tipe</th>
                        <th className="text-right p-2 text-gray-300">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((item, index) => (
                        <tr key={index} className="border-t border-gray-600">
                          <td className="p-2 text-gray-300">{item.date}</td>
                          <td className="p-2 text-gray-300">{item.description}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.type === 'in' 
                                ? 'bg-green-900/30 text-green-400' 
                                : 'bg-red-900/30 text-red-400'
                            }`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="p-2 text-right text-gray-300">
                            Rp {item.amount.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsUploadingCSV(false);
                  setCSVFile(null);
                  setCSVErrors([]);
                  setCSVPreview([]);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-xl transition-colors font-medium"
              >
                Batal
              </button>
              <button 
                onClick={handleImportCSV}
                disabled={csvPreview.length === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Check size={20} />
                Import {csvPreview.length > 0 && `(${csvPreview.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
          }
          .bg-gray-900 {
            background: white !important;
          }
          .bg-gray-800 {
            background: white !important;
            border: 1px solid #ccc !important;
          }
          .text-gray-100,
          .text-gray-200,
          .text-gray-300 {
            color: #000 !important;
          }
          .text-gray-400,
          .text-gray-500 {
            color: #666 !important;
          }
          button,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
