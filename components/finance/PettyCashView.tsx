// FILE: src/components/finance/PettyCashView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, Plus, Calendar, ArrowUpRight, ArrowDownRight, 
  Download, Printer, X, Check, Trash2,
  Keyboard, Search, Filter, CreditCard
} from 'lucide-react';
import { generateId } from '../../utils';

interface PettyCashEntry {
  id: string;
  date: string;
  description: string;
  type: 'in' | 'out';
  amount: number;
  balance: number;
  createdAt: number;
  accountType: 'cash' | 'bank';
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

// Format currency with thousands separators and trailing zeros
// If the absolute value is less than 1000, multiply by 1000 to show proper thousands
const formatCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const displayValue = absAmount < 1000 && absAmount > 0 ? amount * 1000 : amount;
  return displayValue.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

export const PettyCashView: React.FC = () => {
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  
  // Form states
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<'in' | 'out'>('out');
  const [formAccountType, setFormAccountType] = useState<'cash' | 'bank'>('cash');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [filterAccountType, setFilterAccountType] = useState<'all' | 'cash' | 'bank'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  // Mobile toggle state
  const [mobileActiveView, setMobileActiveView] = useState<'cash' | 'bank'>('cash');
  
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
      setFormAccountType('cash');
      setFormDescription('');
      setFormAmount('');
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
  
  // Calculate separate balances for cash and bank
  const cashEntries = entries.filter(e => e.accountType === 'cash');
  const bankEntries = entries.filter(e => e.accountType === 'bank');
  
  const currentCashBalance = cashEntries.length > 0 
    ? cashEntries.reduce((max, entry) => 
        entry.createdAt > max.createdAt ? entry : max, cashEntries[0]
      ).balance
    : 0;
    
  const currentBankBalance = bankEntries.length > 0 
    ? bankEntries.reduce((max, entry) => 
        entry.createdAt > max.createdAt ? entry : max, bankEntries[0]
      ).balance
    : 0;
    
  const currentBalance = currentCashBalance + currentBankBalance;
  
  // Filter entries based on filter criteria
  const filteredEntries = entries.filter(entry => {
    if (filterType !== 'all' && entry.type !== filterType) return false;
    if (filterAccountType !== 'all' && entry.accountType !== filterAccountType) return false;
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
    
    // Calculate previous balance based on account type
    const accountEntries = entries.filter(e => e.accountType === formAccountType);
    const previousBalance = accountEntries.length > 0 
      ? accountEntries.reduce((max, entry) => 
          entry.createdAt > max.createdAt ? entry : max, accountEntries[0]
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
      accountType: formAccountType,
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
  
  const handleDeleteEntry = (entryId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) {
      return;
    }
    
    const entryToDelete = entries.find(e => e.id === entryId);
    if (!entryToDelete) return;
    
    // Remove the entry
    const updatedEntries = entries.filter(e => e.id !== entryId);
    
    // Sort all entries by date and time for proper ordering
    const sortedEntries = [...updatedEntries].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt - b.createdAt;
    });
    
    // Recalculate balances for each account type separately
    const recalculatedEntries = sortedEntries.map((entry) => {
      // Find all previous entries for this account type
      const previousEntries = sortedEntries.filter(e => 
        e.accountType === entry.accountType && 
        (e.date < entry.date || (e.date === entry.date && e.createdAt < entry.createdAt))
      );
      
      // Calculate balance from all previous entries
      let balance = 0;
      for (const prevEntry of previousEntries) {
        balance += prevEntry.type === 'in' ? prevEntry.amount : -prevEntry.amount;
      }
      
      // Add current entry to balance
      balance += entry.type === 'in' ? entry.amount : -entry.amount;
      
      return {
        ...entry,
        balance
      };
    });
    
    setEntries(recalculatedEntries);
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
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleDownloadCSV = () => {
    const headers = ['Tanggal', 'Keterangan', 'Tipe', 'Akun', 'Jumlah', 'Saldo'];
    const rows = filteredEntries.map(entry => [
      entry.date,
      entry.description,
      entry.type === 'in' ? 'Masuk' : 'Keluar',
      entry.accountType === 'cash' ? 'Kas' : 'Rekening',
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
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-4 pl-8 sm:p-6 mb-6 shadow-xl">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-green-100 text-sm font-medium mb-3 ml-2 sm:ml-0">Saldo Saat Ini</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                <div className="bg-white/10 rounded-xl p-4 pl-6 sm:pl-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet size={20} className="text-green-100" />
                    <p className="text-green-100 text-xs font-medium">Kas</p>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    Rp {formatCurrency(currentCashBalance)}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 pl-6 sm:pl-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard size={20} className="text-green-100" />
                    <p className="text-green-100 text-xs font-medium">Rekening</p>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    Rp {formatCurrency(currentBankBalance)}
                  </p>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 pl-6 sm:pl-3 backdrop-blur-sm">
                <p className="text-green-100 text-xs font-medium mb-1">Total Saldo</p>
                <p className="text-3xl font-bold text-white">
                  Rp {formatCurrency(currentBalance)}
                </p>
              </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tipe Transaksi</label>
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
              <label className="block text-xs text-gray-400 mb-1">Akun</label>
              <select 
                value={filterAccountType}
                onChange={(e) => setFilterAccountType(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
          {(filterType !== 'all' || filterAccountType !== 'all' || filterDateFrom || filterDateTo) && (
            <button 
              onClick={() => {
                setFilterType('all');
                setFilterAccountType('all');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Mobile Toggle for Cash/Bank View */}
        <div className="lg:hidden mb-4">
          <div className="bg-gray-800 rounded-xl p-2 border border-gray-700 flex gap-2">
            <button
              onClick={() => setMobileActiveView('cash')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                mobileActiveView === 'cash'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Wallet size={18} />
              <span>Kas</span>
            </button>
            <button
              onClick={() => setMobileActiveView('bank')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                mobileActiveView === 'bank'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <CreditCard size={18} />
              <span>Rekening</span>
            </button>
          </div>
        </div>

        {/* Entries List - Desktop: Two Columns, Mobile: Toggle View */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cash Entries */}
          <div className={`${mobileActiveView === 'bank' ? 'hidden lg:block' : ''}`}>
            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden print:border-gray-400">
              <div className="p-4 border-b border-gray-700 print:border-gray-400 bg-gradient-to-r from-blue-600/20 to-blue-800/20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Wallet size={20} className="text-blue-400" />
                    <h2 className="text-lg font-semibold text-gray-100 print:text-gray-900">Kas</h2>
                  </div>
                  <span className="text-sm text-gray-400 print:text-gray-700">
                    {filteredEntries.filter(e => e.accountType === 'cash').length} transaksi
                  </span>
                </div>
              </div>
              
              {filteredEntries.filter(e => e.accountType === 'cash').length === 0 ? (
                <div className="p-12 text-center print:hidden">
                  <Wallet size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg font-medium mb-2">
                    Belum ada transaksi kas
                  </p>
                  <p className="text-gray-500 text-sm">
                    Klik tombol "Tambah" untuk membuat transaksi
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700 print:divide-gray-300 max-h-[600px] overflow-y-auto">
                  {filteredEntries.filter(e => e.accountType === 'cash').map((entry) => (
                    <div key={entry.id} className="p-3 hover:bg-gray-750 transition-colors print:hover:bg-white print:py-2 group">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className={`p-1.5 rounded-lg print:hidden flex-shrink-0 ${
                            entry.type === 'in' 
                              ? 'bg-green-900/30 text-green-400' 
                              : 'bg-red-900/30 text-red-400'
                          }`}>
                            {entry.type === 'in' ? (
                              <ArrowDownRight size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-100 font-medium text-sm print:text-gray-900 truncate">{entry.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Calendar size={12} className="text-gray-500 print:text-gray-700 flex-shrink-0" />
                              <p className="text-xs text-gray-400 print:text-gray-700">{entry.date}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="text-right">
                            <p className={`text-base font-bold ${
                              entry.type === 'in' ? 'text-green-400 print:text-green-700' : 'text-red-400 print:text-red-700'
                            }`}>
                              {entry.type === 'in' ? '+' : '-'} Rp {formatCurrency(entry.amount)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 print:text-gray-700">
                              Saldo: Rp {formatCurrency(entry.balance)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="opacity-0 group-hover:opacity-100 print:hidden transition-opacity p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300"
                            title="Hapus transaksi"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bank Entries */}
          <div className={`${mobileActiveView === 'cash' ? 'hidden lg:block' : ''}`}>
            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden print:border-gray-400">
              <div className="p-4 border-b border-gray-700 print:border-gray-400 bg-gradient-to-r from-purple-600/20 to-purple-800/20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <CreditCard size={20} className="text-purple-400" />
                    <h2 className="text-lg font-semibold text-gray-100 print:text-gray-900">Rekening</h2>
                  </div>
                  <span className="text-sm text-gray-400 print:text-gray-700">
                    {filteredEntries.filter(e => e.accountType === 'bank').length} transaksi
                  </span>
                </div>
              </div>
              
              {filteredEntries.filter(e => e.accountType === 'bank').length === 0 ? (
                <div className="p-12 text-center print:hidden">
                  <CreditCard size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg font-medium mb-2">
                    Belum ada transaksi rekening
                  </p>
                  <p className="text-gray-500 text-sm">
                    Klik tombol "Tambah" untuk membuat transaksi
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700 print:divide-gray-300 max-h-[600px] overflow-y-auto">
                  {filteredEntries.filter(e => e.accountType === 'bank').map((entry) => (
                    <div key={entry.id} className="p-3 hover:bg-gray-750 transition-colors print:hover:bg-white print:py-2 group">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className={`p-1.5 rounded-lg print:hidden flex-shrink-0 ${
                            entry.type === 'in' 
                              ? 'bg-green-900/30 text-green-400' 
                              : 'bg-red-900/30 text-red-400'
                          }`}>
                            {entry.type === 'in' ? (
                              <ArrowDownRight size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-100 font-medium text-sm print:text-gray-900 truncate">{entry.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Calendar size={12} className="text-gray-500 print:text-gray-700 flex-shrink-0" />
                              <p className="text-xs text-gray-400 print:text-gray-700">{entry.date}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="text-right">
                            <p className={`text-base font-bold ${
                              entry.type === 'in' ? 'text-green-400 print:text-green-700' : 'text-red-400 print:text-red-700'
                            }`}>
                              {entry.type === 'in' ? '+' : '-'} Rp {formatCurrency(entry.amount)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 print:text-gray-700">
                              Saldo: Rp {formatCurrency(entry.balance)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="opacity-0 group-hover:opacity-100 print:hidden transition-opacity p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300"
                            title="Hapus transaksi"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
              
              {/* Account Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Akun
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormAccountType('cash')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 font-medium ${
                      formAccountType === 'cash'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <Wallet size={20} />
                    <span>Kas</span>
                  </button>
                  <button
                    onClick={() => setFormAccountType('bank')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 font-medium ${
                      formAccountType === 'bank'
                        ? 'border-purple-500 bg-purple-500/20 text-purple-400'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <CreditCard size={20} />
                    <span>Rekening</span>
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
