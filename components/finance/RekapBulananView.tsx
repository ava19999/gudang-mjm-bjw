import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, BarChart2, PieChart, FileText, Download, User, Clock, ChevronDown, ChevronUp, X, Edit3, History, Save, Package } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useStore } from '../../context/StoreContext';

// Types for grouped data
interface CustomerGroup {
  customer: string;
  tempo: string;
  totalHarga: number;
  itemCount: number;
}

// Types for barang masuk/keluar record
interface BarangRecord {
  id: number;
  part_number: string;
  name?: string;
  qty_masuk?: number;
  qty_keluar?: number;
  harga_satuan: number;
  harga_total: number;
  customer: string;
  tempo: string;
  created_at: string;
  store?: 'mjm' | 'bjw';
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
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'rb';
  }
  return num.toString();
};

// TODO: Replace with actual chart components
const DummyChart = ({ title }: { title: string }) => (
  <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[180px] text-gray-400 border border-gray-700">
    <span className="mb-2"><BarChart2 className="w-8 h-8" /></span>
    <span>{title} (Chart Placeholder)</span>
  </div>
);

export const RekapBulananView: React.FC = () => {
  const { selectedStore } = useStore();
  const [bulan, setBulan] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  // Data states
  const [barangMasuk, setBarangMasuk] = useState<any[]>([]);
  const [barangKeluar, setBarangKeluar] = useState<any[]>([]);
  const [pettyCashData, setPettyCashData] = useState<any[]>([]);
  
  // Filter states for tempo
  const [filterTempoMasuk, setFilterTempoMasuk] = useState<string>('all');
  const [filterTempoKeluar, setFilterTempoKeluar] = useState<string>('all');
  
  // Modal states for tempo edit
  const [editTempoModal, setEditTempoModal] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<CustomerGroup | null>(null);
  const [newTempo, setNewTempo] = useState('');
  const [editType, setEditType] = useState<'masuk' | 'keluar'>('masuk');
  const [savingTempo, setSavingTempo] = useState(false);
  
  // Modal states for history view
  const [historyModal, setHistoryModal] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<CustomerGroup | null>(null);
  const [historyData, setHistoryData] = useState<BarangRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyType, setHistoryType] = useState<'masuk' | 'keluar'>('masuk');
  
  // Toast state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  // Collapse states
  const [expandedMasuk, setExpandedMasuk] = useState(true);
  const [expandedKeluar, setExpandedKeluar] = useState(true);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Ambil range tanggal bulan
        const [year, month] = bulan.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(Number(year), Number(month), 0); // last day of month
        const endDateStr = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`;
        
        // For timestamp queries, we need full datetime format
        const startDateTime = `${startDate}T00:00:00`;
        const endDateTime = `${endDateStr}T23:59:59`;

        // Barang Masuk MJM - try with created_at (timestamp)
        const { data: masukMJM, error: errMasukMJM } = await supabase
          .from('barang_masuk_mjm')
          .select('*')
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
        
        if (errMasukMJM) console.error('Error fetching barang_masuk_mjm:', errMasukMJM);
        
        // Barang Masuk BJW
        const { data: masukBJW, error: errMasukBJW } = await supabase
          .from('barang_masuk_bjw')
          .select('*')
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
        
        if (errMasukBJW) console.error('Error fetching barang_masuk_bjw:', errMasukBJW);
        
        // Barang Keluar MJM
        const { data: keluarMJM, error: errKeluarMJM } = await supabase
          .from('barang_keluar_mjm')
          .select('*')
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
        
        if (errKeluarMJM) console.error('Error fetching barang_keluar_mjm:', errKeluarMJM);
        
        // Barang Keluar BJW
        const { data: keluarBJW, error: errKeluarBJW } = await supabase
          .from('barang_keluar_bjw')
          .select('*')
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
        
        if (errKeluarBJW) console.error('Error fetching barang_keluar_bjw:', errKeluarBJW);
        
        // Petty Cash MJM & BJW
        const { data: pettyMJM } = await supabase
          .from('petty_cash_mjm')
          .select('*')
          .gte('tgl', startDate)
          .lte('tgl', endDateStr);
          
        const { data: pettyBJW } = await supabase
          .from('petty_cash_bjw')
          .select('*')
          .gte('tgl', startDate)
          .lte('tgl', endDateStr);

        console.log('Barang Masuk MJM:', masukMJM?.length || 0);
        console.log('Barang Masuk BJW:', masukBJW?.length || 0);
        console.log('Barang Keluar MJM:', keluarMJM?.length || 0);
        console.log('Barang Keluar BJW:', keluarBJW?.length || 0);

        setBarangMasuk([...(masukMJM || []).map(r => ({...r, store: 'mjm'})), ...(masukBJW || []).map(r => ({...r, store: 'bjw'}))]);
        setBarangKeluar([...(keluarMJM || []).map(r => ({...r, store: 'mjm'})), ...(keluarBJW || []).map(r => ({...r, store: 'bjw'}))]);
        setPettyCashData([...(pettyMJM || []), ...(pettyBJW || [])]);
      } catch (e) {
        console.error('Error fetching rekap data:', e);
      }
      setLoading(false);
    };
    fetchData();
  }, [bulan, selectedStore]);

  // Function to load history data for a specific customer/supplier
  const loadHistoryData = async (customer: string, tempo: string, type: 'masuk' | 'keluar') => {
    setLoadingHistory(true);
    try {
      const [year, month] = bulan.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(Number(year), Number(month), 0);
      const endDateStr = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`;
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDateStr}T23:59:59`;
      
      const customerUpper = customer.trim().toUpperCase();
      
      if (type === 'masuk') {
        // Fetch from both MJM and BJW
        const { data: dataMJM } = await supabase
          .from('barang_masuk_mjm')
          .select('*')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime)
          .order('created_at', { ascending: false });
          
        const { data: dataBJW } = await supabase
          .from('barang_masuk_bjw')
          .select('*')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime)
          .order('created_at', { ascending: false });
          
        const combined = [
          ...(dataMJM || []).map(r => ({ ...r, store: 'mjm' as const })),
          ...(dataBJW || []).map(r => ({ ...r, store: 'bjw' as const }))
        ].filter(r => {
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          return itemTempo === tempo || (tempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
        });
        
        setHistoryData(combined);
      } else {
        // Barang Keluar
        const { data: dataMJM } = await supabase
          .from('barang_keluar_mjm')
          .select('*')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime)
          .order('created_at', { ascending: false });
          
        const { data: dataBJW } = await supabase
          .from('barang_keluar_bjw')
          .select('*')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime)
          .order('created_at', { ascending: false });
          
        const combined = [
          ...(dataMJM || []).map(r => ({ ...r, store: 'mjm' as const })),
          ...(dataBJW || []).map(r => ({ ...r, store: 'bjw' as const }))
        ].filter(r => {
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          return itemTempo === tempo || (tempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
        });
        
        setHistoryData(combined);
      }
    } catch (e) {
      console.error('Error loading history:', e);
      setHistoryData([]);
    }
    setLoadingHistory(false);
  };
  
  // Function to update tempo for all records of a customer
  const handleUpdateTempo = async () => {
    if (!selectedCustomerForEdit || !newTempo) return;
    
    setSavingTempo(true);
    try {
      const customerUpper = selectedCustomerForEdit.customer.trim().toUpperCase();
      const oldTempo = selectedCustomerForEdit.tempo;
      const [year, month] = bulan.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(Number(year), Number(month), 0);
      const endDateStr = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`;
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDateStr}T23:59:59`;
      
      if (editType === 'masuk') {
        // Get IDs to update from MJM
        const { data: mjmRecords } = await supabase
          .from('barang_masuk_mjm')
          .select('id, tempo')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
          
        const mjmIdsToUpdate = (mjmRecords || [])
          .filter(r => {
            const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
            return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
          })
          .map(r => r.id);
          
        if (mjmIdsToUpdate.length > 0) {
          await supabase
            .from('barang_masuk_mjm')
            .update({ tempo: newTempo })
            .in('id', mjmIdsToUpdate);
        }
        
        // Get IDs to update from BJW
        const { data: bjwRecords } = await supabase
          .from('barang_masuk_bjw')
          .select('id, tempo')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
          
        const bjwIdsToUpdate = (bjwRecords || [])
          .filter(r => {
            const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
            return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
          })
          .map(r => r.id);
          
        if (bjwIdsToUpdate.length > 0) {
          await supabase
            .from('barang_masuk_bjw')
            .update({ tempo: newTempo })
            .in('id', bjwIdsToUpdate);
        }
        
        // Update local state
        setBarangMasuk(prev => prev.map(r => {
          const itemCustomer = (r.customer || '').trim().toUpperCase();
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          if (itemCustomer === customerUpper && 
              (itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH')))) {
            return { ...r, tempo: newTempo };
          }
          return r;
        }));
      } else {
        // Barang Keluar
        const { data: mjmRecords } = await supabase
          .from('barang_keluar_mjm')
          .select('id, tempo')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
          
        const mjmIdsToUpdate = (mjmRecords || [])
          .filter(r => {
            const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
            return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
          })
          .map(r => r.id);
          
        if (mjmIdsToUpdate.length > 0) {
          await supabase
            .from('barang_keluar_mjm')
            .update({ tempo: newTempo })
            .in('id', mjmIdsToUpdate);
        }
        
        const { data: bjwRecords } = await supabase
          .from('barang_keluar_bjw')
          .select('id, tempo')
          .ilike('customer', customerUpper)
          .gte('created_at', startDateTime)
          .lte('created_at', endDateTime);
          
        const bjwIdsToUpdate = (bjwRecords || [])
          .filter(r => {
            const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
            return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
          })
          .map(r => r.id);
          
        if (bjwIdsToUpdate.length > 0) {
          await supabase
            .from('barang_keluar_bjw')
            .update({ tempo: newTempo })
            .in('id', bjwIdsToUpdate);
        }
        
        // Update local state
        setBarangKeluar(prev => prev.map(r => {
          const itemCustomer = (r.customer || '').trim().toUpperCase();
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          if (itemCustomer === customerUpper && 
              (itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH')))) {
            return { ...r, tempo: newTempo };
          }
          return r;
        }));
      }
      
      showToast('Tempo berhasil diupdate!', 'success');
      setEditTempoModal(false);
      setSelectedCustomerForEdit(null);
      setNewTempo('');
    } catch (e) {
      console.error('Error updating tempo:', e);
      showToast('Gagal mengupdate tempo', 'error');
    }
    setSavingTempo(false);
  };
  
  // Open edit tempo modal
  const openEditTempoModal = (customer: CustomerGroup, type: 'masuk' | 'keluar', e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomerForEdit(customer);
    setNewTempo(customer.tempo || 'CASH');
    setEditType(type);
    setEditTempoModal(true);
  };
  
  // Open history modal
  const openHistoryModal = (customer: CustomerGroup, type: 'masuk' | 'keluar') => {
    setSelectedCustomerForHistory(customer);
    setHistoryType(type);
    setHistoryModal(true);
    loadHistoryData(customer.customer, customer.tempo, type);
  };

  // Helper function to check if record is RETUR (check both customer and tempo)
  const isRetur = (record: any) => {
    const customer = (record.customer || '').trim().toUpperCase();
    const tempo = (record.tempo || '').trim().toUpperCase();
    return customer.includes('RETUR') || tempo.includes('RETUR');
  };
  
  // Helper function to check if record should be excluded (RETUR or 0 total)
  const shouldExclude = (record: any) => {
    return isRetur(record) || (record.harga_total || 0) === 0;
  };

  // Statistik dari data (excluding RETUR and 0 total)
  const stats = useMemo(() => {
    // Filter out RETUR records and 0 total first
    const filteredMasuk = barangMasuk.filter(b => !shouldExclude(b));
    const filteredKeluar = barangKeluar.filter(b => !shouldExclude(b));
    
    // Barang Masuk - categorize by tempo
    const masukCash = filteredMasuk.filter(b => {
      const tempo = (b.tempo || '').toUpperCase();
      return tempo.includes('CASH') || tempo === '';
    }).reduce((a, b) => a + (b.harga_total || 0), 0);
    
    const masuk3Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masuk2Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masuk1Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('1') && !(b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masukTotal = filteredMasuk.reduce((a, b) => a + (b.harga_total || 0), 0);
    
    // Barang Keluar - categorize by tempo (using filtered data)
    const keluarCash = filteredKeluar.filter(b => {
      const tempo = (b.tempo || '').toUpperCase();
      return tempo.includes('CASH') || tempo === '';
    }).reduce((a, b) => a + (b.harga_total || 0), 0);
    
    const keluar3Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluar2Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluar1Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('1') && !(b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluarTotal = filteredKeluar.reduce((a, b) => a + (b.harga_total || 0), 0);
    
    // Petty Cash
    const pettyCash = pettyCashData.reduce((a, b) => a + (b.saldokeluarmasuk || b.jumlah || 0), 0);
    // Saldo akhir petty cash (dummy, bisa diubah sesuai logika)
    const saldoAkhir = 0;
    return { masukCash, masuk3Bln, masuk2Bln, masuk1Bln, masukTotal, keluarCash, keluar3Bln, keluar2Bln, keluar1Bln, keluarTotal, pettyCash, saldoAkhir };
  }, [barangMasuk, barangKeluar, pettyCashData]);
  
  // Group Barang Masuk by Customer and Tempo (excluding RETUR and 0 total)
  const groupedBarangMasuk = useMemo(() => {
    const customerMap = new Map<string, CustomerGroup>();
    
    barangMasuk.forEach(record => {
      const customer = (record.customer || 'UNKNOWN').trim().toUpperCase();
      const tempo = (record.tempo || 'CASH').trim().toUpperCase();
      
      // Skip RETUR records (check both customer and tempo) and 0 total
      if (customer.includes('RETUR') || tempo.includes('RETUR')) return;
      if ((record.harga_total || 0) === 0) return;
      
      const key = `${customer}_${tempo}`;
      
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer,
          tempo,
          totalHarga: 0,
          itemCount: 0,
        });
      }
      
      const existing = customerMap.get(key)!;
      existing.totalHarga += record.harga_total || 0;
      existing.itemCount += 1;
    });
    
    // Apply tempo filter
    let result = Array.from(customerMap.values());
    if (filterTempoMasuk !== 'all') {
      result = result.filter(c => {
        if (filterTempoMasuk === 'CASH') return c.tempo.includes('CASH') || c.tempo === '';
        if (filterTempoMasuk === '3 BLN') return c.tempo.includes('3');
        if (filterTempoMasuk === '2 BLN') return c.tempo.includes('2') && !c.tempo.includes('3');
        if (filterTempoMasuk === '1 BLN') return c.tempo.includes('1') && !c.tempo.includes('2') && !c.tempo.includes('3');
        return true;
      });
    }
    
    return result.sort((a, b) => b.totalHarga - a.totalHarga);
  }, [barangMasuk, filterTempoMasuk]);
  
  // Group Barang Keluar by Customer and Tempo (excluding RETUR and 0 total)
  const groupedBarangKeluar = useMemo(() => {
    const customerMap = new Map<string, CustomerGroup>();
    
    barangKeluar.forEach(record => {
      const customer = (record.customer || 'UNKNOWN').trim().toUpperCase();
      const tempo = (record.tempo || 'CASH').trim().toUpperCase();
      
      // Skip RETUR records (check both customer and tempo) and 0 total
      if (customer.includes('RETUR') || tempo.includes('RETUR')) return;
      if ((record.harga_total || 0) === 0) return;
      
      const key = `${customer}_${tempo}`;
      
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer,
          tempo,
          totalHarga: 0,
          itemCount: 0,
        });
      }
      
      const existing = customerMap.get(key)!;
      existing.totalHarga += record.harga_total || 0;
      existing.itemCount += 1;
    });
    
    // Apply tempo filter
    let result = Array.from(customerMap.values());
    if (filterTempoKeluar !== 'all') {
      result = result.filter(c => {
        if (filterTempoKeluar === 'CASH') return c.tempo.includes('CASH') || c.tempo === '';
        if (filterTempoKeluar === '3 BLN') return c.tempo.includes('3');
        if (filterTempoKeluar === '2 BLN') return c.tempo.includes('2') && !c.tempo.includes('3');
        if (filterTempoKeluar === '1 BLN') return c.tempo.includes('1') && !c.tempo.includes('2') && !c.tempo.includes('3');
        return true;
      });
    }
    
    return result.sort((a, b) => b.totalHarga - a.totalHarga);
  }, [barangKeluar, filterTempoKeluar]);
  
  // Totals for filtered data
  const totalMasukFiltered = useMemo(() => groupedBarangMasuk.reduce((sum, c) => sum + c.totalHarga, 0), [groupedBarangMasuk]);
  const totalKeluarFiltered = useMemo(() => groupedBarangKeluar.reduce((sum, c) => sum + c.totalHarga, 0), [groupedBarangKeluar]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2 bg-blue-900/30 rounded-xl">
          <BarChart2 className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Rekap Bulanan</h1>
          <p className="text-gray-400 text-sm">Ringkasan keuangan & barang masuk/keluar seluruh toko</p>
        </div>
      </div>

      {/* Filter Bulan */}
      <div className="flex gap-2 items-center mb-6">
        <Calendar className="w-5 h-5 text-gray-400" />
        <input
          type="month"
          value={bulan}
          onChange={e => setBulan(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-blue-500 transition-colors"
        />
        <button className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
          <FileText className="w-4 h-4" /> PDF
        </button>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
          <Download className="w-4 h-4" /> Excel
        </button>
      </div>

      {/* Statistik Ringkas - Barang Masuk */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Barang Masuk (Pembelian)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-800/30 rounded-xl p-4">
            <div className="text-green-400 text-xs font-medium mb-1">Total Masuk</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.masukTotal)}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-800/30 rounded-xl p-4">
            <div className="text-emerald-400 text-xs font-medium mb-1">Cash</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.masukCash)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-800/30 rounded-xl p-4">
            <div className="text-purple-400 text-xs font-medium mb-1">3 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.masuk3Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30 rounded-xl p-4">
            <div className="text-blue-400 text-xs font-medium mb-1">2 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.masuk2Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-teal-900/40 to-teal-800/20 border border-teal-800/30 rounded-xl p-4">
            <div className="text-teal-400 text-xs font-medium mb-1">1 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.masuk1Bln)}</div>
          </div>
        </div>
      </div>
      
      {/* Statistik Ringkas - Barang Keluar */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Barang Keluar (Penjualan)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-red-900/40 to-red-800/20 border border-red-800/30 rounded-xl p-4">
            <div className="text-red-400 text-xs font-medium mb-1">Total Keluar</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.keluarTotal)}</div>
          </div>
          <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 border border-orange-800/30 rounded-xl p-4">
            <div className="text-orange-400 text-xs font-medium mb-1">Cash</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.keluarCash)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-800/30 rounded-xl p-4">
            <div className="text-purple-400 text-xs font-medium mb-1">3 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.keluar3Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30 rounded-xl p-4">
            <div className="text-blue-400 text-xs font-medium mb-1">2 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.keluar2Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-pink-900/40 to-pink-800/20 border border-pink-800/30 rounded-xl p-4">
            <div className="text-pink-400 text-xs font-medium mb-1">1 BLN</div>
            <div className="text-xl md:text-2xl font-bold text-white">{formatCompactNumber(stats.keluar1Bln)}</div>
          </div>
        </div>
      </div>
      
      {/* Petty Cash Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 border border-yellow-800/30 rounded-xl p-4">
          <div className="text-yellow-400 text-xs font-medium mb-1">Penggunaan Petty Cash</div>
          <div className="text-xl md:text-2xl font-bold text-white">Rp {stats.pettyCash.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/40 to-gray-800/20 border border-gray-800/30 rounded-xl p-4">
          <div className="text-gray-400 text-xs font-medium mb-1">Saldo Akhir Petty Cash</div>
          <div className="text-xl md:text-2xl font-bold text-white">Rp {stats.saldoAkhir.toLocaleString('id-ID')}</div>
        </div>
      </div>

      {/* Diagram/Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DummyChart title="Proporsi Cash vs Tempo" />
        <DummyChart title="Barang Masuk/Keluar per Toko" />
      </div>
      <div className="mb-6">
        <DummyChart title="Trend Harian Bulan Ini" />
      </div>

      {/* Tabel Detail - Grouped by Customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Barang Masuk Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header with filter */}
          <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setExpandedMasuk(!expandedMasuk)}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {expandedMasuk ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Barang Masuk
              </h2>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-lg">{groupedBarangMasuk.length} supplier</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <select
                value={filterTempoMasuk}
                onChange={(e) => setFilterTempoMasuk(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-green-500 transition-colors"
              >
                <option value="all">Semua Tempo</option>
                <option value="CASH">Cash</option>
                <option value="3 BLN">3 Bulan</option>
                <option value="2 BLN">2 Bulan</option>
                <option value="1 BLN">1 Bulan</option>
              </select>
            </div>
          </div>
          
          {expandedMasuk && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50 sticky top-0">
                  <tr className="text-gray-400">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Customer/Supplier</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Tempo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {groupedBarangMasuk.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-gray-500 py-8">Data belum tersedia</td></tr>
                  ) : (
                    groupedBarangMasuk.map((item, i) => (
                      <tr 
                        key={`masuk-${item.customer}-${item.tempo}`} 
                        className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => openHistoryModal(item, 'masuk')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-900/30 flex items-center justify-center">
                              <User className="w-4 h-4 text-green-400" />
                            </div>
                            <span className="font-medium text-white">{item.customer}</span>
                            <History className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => openEditTempoModal(item, 'masuk', e)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium hover:ring-2 hover:ring-white/30 transition-all inline-flex items-center gap-1 ${
                              item.tempo.includes('CASH') || item.tempo === '' ? 'bg-emerald-900/40 text-emerald-300' :
                              item.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                              item.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                              item.tempo.includes('1') ? 'bg-teal-900/40 text-teal-300' :
                              'bg-gray-700 text-gray-300'
                            }`}
                            title="Klik untuk edit tempo"
                          >
                            {item.tempo || 'CASH'}
                            <Edit3 className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-white">
                          {formatCurrency(item.totalHarga)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {groupedBarangMasuk.length > 0 && (
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-white">TOTAL</td>
                      <td className="px-4 py-3 text-right font-mono text-green-400 text-base">
                        {formatCurrency(totalMasukFiltered)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
        
        {/* Barang Keluar Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header with filter */}
          <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setExpandedKeluar(!expandedKeluar)}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {expandedKeluar ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                Barang Keluar
              </h2>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-lg">{groupedBarangKeluar.length} customer</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <select
                value={filterTempoKeluar}
                onChange={(e) => setFilterTempoKeluar(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-red-500 transition-colors"
              >
                <option value="all">Semua Tempo</option>
                <option value="CASH">Cash</option>
                <option value="3 BLN">3 Bulan</option>
                <option value="2 BLN">2 Bulan</option>
                <option value="1 BLN">1 Bulan</option>
              </select>
            </div>
          </div>
          
          {expandedKeluar && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50 sticky top-0">
                  <tr className="text-gray-400">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Tempo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {groupedBarangKeluar.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-gray-500 py-8">Data belum tersedia</td></tr>
                  ) : (
                    groupedBarangKeluar.map((item, i) => (
                      <tr 
                        key={`keluar-${item.customer}-${item.tempo}`} 
                        className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => openHistoryModal(item, 'keluar')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-900/30 flex items-center justify-center">
                              <User className="w-4 h-4 text-red-400" />
                            </div>
                            <span className="font-medium text-white">{item.customer}</span>
                            <History className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => openEditTempoModal(item, 'keluar', e)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium hover:ring-2 hover:ring-white/30 transition-all inline-flex items-center gap-1 ${
                              item.tempo.includes('CASH') || item.tempo === '' ? 'bg-orange-900/40 text-orange-300' :
                              item.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                              item.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                              item.tempo.includes('1') ? 'bg-pink-900/40 text-pink-300' :
                              'bg-gray-700 text-gray-300'
                            }`}
                            title="Klik untuk edit tempo"
                          >
                            {item.tempo || 'CASH'}
                            <Edit3 className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-white">
                          {formatCurrency(item.totalHarga)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {groupedBarangKeluar.length > 0 && (
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-white">TOTAL</td>
                      <td className="px-4 py-3 text-right font-mono text-red-400 text-base">
                        {formatCurrency(totalKeluarFiltered)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 overflow-x-auto mb-6">
        <h2 className="text-lg font-bold mb-2 text-white">Petty Cash</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400">
              <th>Tanggal</th>
              <th>Toko</th>
              <th>Keterangan</th>
              <th>Pengeluaran</th>
              <th>Saldo Akhir</th>
            </tr>
          </thead>
          <tbody>
              {pettyCashData.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-500">Data belum tersedia</td></tr>
              ) : (
                pettyCashData.map((p, i) => (
                  <tr key={p.id || i}>
                    <td>{p.tanggal}</td>
                    <td>{p.toko || p.store || '-'}</td>
                    <td>{p.keterangan || '-'}</td>
                    <td>Rp {(p.jumlah || 0).toLocaleString('id-ID')}</td>
                    <td>-</td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      
      {/* Edit Tempo Modal */}
      {editTempoModal && selectedCustomerForEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  editType === 'masuk' ? 'bg-green-900/40' : 'bg-red-900/40'
                }`}>
                  <Edit3 className={`w-5 h-5 ${editType === 'masuk' ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Edit Tempo</h3>
                  <p className="text-sm text-gray-400">{selectedCustomerForEdit.customer}</p>
                </div>
              </div>
              <button 
                onClick={() => { setEditTempoModal(false); setSelectedCustomerForEdit(null); }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tempo Saat Ini</label>
                <div className={`px-3 py-2 rounded-lg text-sm font-medium inline-block ${
                  selectedCustomerForEdit.tempo.includes('CASH') || selectedCustomerForEdit.tempo === '' ? 'bg-emerald-900/40 text-emerald-300' :
                  selectedCustomerForEdit.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                  selectedCustomerForEdit.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                  'bg-teal-900/40 text-teal-300'
                }`}>
                  {selectedCustomerForEdit.tempo || 'CASH'}
                </div>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tempo Baru</label>
                <select
                  value={newTempo}
                  onChange={(e) => setNewTempo(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="CASH">CASH</option>
                  <option value="1 BLN">1 BLN (1 Bulan)</option>
                  <option value="2 BLN">2 BLN (2 Bulan)</option>
                  <option value="3 BLN">3 BLN (3 Bulan)</option>
                </select>
              </div>
              
              <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-3">
                <p className="text-yellow-300 text-sm">
                  ⚠️ Perubahan tempo akan diterapkan ke <strong>{selectedCustomerForEdit.itemCount}</strong> transaksi 
                  untuk customer <strong>{selectedCustomerForEdit.customer}</strong> di bulan ini.
                </p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex gap-3 p-4 border-t border-gray-700">
              <button
                onClick={() => { setEditTempoModal(false); setSelectedCustomerForEdit(null); }}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateTempo}
                disabled={savingTempo || newTempo === selectedCustomerForEdit.tempo}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {savingTempo ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Simpan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* History Modal */}
      {historyModal && selectedCustomerForHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  historyType === 'masuk' ? 'bg-green-900/40' : 'bg-red-900/40'
                }`}>
                  <Package className={`w-5 h-5 ${historyType === 'masuk' ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Riwayat {historyType === 'masuk' ? 'Pengambilan Barang' : 'Penjualan Barang'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {selectedCustomerForHistory.customer} • {selectedCustomerForHistory.tempo || 'CASH'} • {historyData.length} transaksi
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setHistoryModal(false); setSelectedCustomerForHistory(null); setHistoryData([]); }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Tidak ada data transaksi</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50 sticky top-0">
                    <tr className="text-gray-400">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Tanggal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Part Number</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Nama Barang</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Harga Satuan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Total</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Toko</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {historyData.map((record, i) => (
                      <tr key={record.id || i} className="hover:bg-gray-700/30 transition-colors">
                        <td className="px-3 py-2 text-gray-300 text-xs">
                          {new Date(record.created_at).toLocaleDateString('id-ID', { 
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-white text-xs">{record.part_number}</td>
                        <td className="px-3 py-2 text-gray-300 text-xs truncate max-w-[200px]" title={record.name}>
                          {record.name || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-medium text-white">
                          {historyType === 'masuk' ? record.qty_masuk : record.qty_keluar}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-300 text-xs">
                          {formatCurrency(record.harga_satuan)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-white text-sm">
                          {formatCurrency(record.harga_total)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                            record.store === 'mjm' ? 'bg-blue-900/40 text-blue-300' : 'bg-orange-900/40 text-orange-300'
                          }`}>
                            {record.store}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={3} className="px-3 py-3 text-white">Total</td>
                      <td className="px-3 py-3 text-center text-white">
                        {historyData.reduce((sum, r) => sum + (historyType === 'masuk' ? (r.qty_masuk || 0) : (r.qty_keluar || 0)), 0)}
                      </td>
                      <td className="px-3 py-3"></td>
                      <td className={`px-3 py-3 text-right font-mono text-base ${
                        historyType === 'masuk' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(historyData.reduce((sum, r) => sum + (r.harga_total || 0), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-gray-700 flex-shrink-0">
              <button
                onClick={() => { setHistoryModal(false); setSelectedCustomerForHistory(null); setHistoryData([]); }}
                className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
