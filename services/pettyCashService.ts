// FILE: services/pettyCashService.ts
import { supabase } from './supabaseClient';

export interface PettyCashEntry {
  id: string;
  tgl: string;
  keterangan: string;
  kegunaan?: string | null;
  type: 'in' | 'out';
  akun: 'cash' | 'bank'; // Kas atau Rekening
  saldokeluarmasuk: number; // Jumlah transaksi (positif)
  saldosaatini: number; // Saldo setelah transaksi
}

// Helper: Get table name based on store
const getTableName = (store: string | null): string => {
  return store === 'bjw' ? 'petty_cash_bjw' : 'petty_cash_mjm';
};

const normalizeAkun = (akun: unknown): 'cash' | 'bank' => {
  const normalized = String(akun || '').trim().toLowerCase();
  if (normalized === 'bank' || normalized === 'rekening') return 'bank';
  return 'cash';
};

const getAkunFilters = (akun: 'cash' | 'bank'): string[] => {
  return akun === 'bank' ? ['bank', 'rekening'] : ['cash', 'kas'];
};

const fetchAllPettyCashRows = async (table: string): Promise<any[]> => {
  const pageSize = 1000;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('tgl', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Error fetching paged petty cash rows from ${table}:`, error);
      return rows;
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const fetchAllPettyCashRowsByAccount = async (
  table: string,
  akun: 'cash' | 'bank',
  ascending: boolean
): Promise<any[]> => {
  const pageSize = 1000;
  const rows: any[] = [];
  let from = 0;
  const akunFilters = getAkunFilters(akun);

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('akun', akunFilters)
      .order('tgl', { ascending })
      .order('id', { ascending })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Error fetching paged petty cash rows by account from ${table}:`, error);
      return rows;
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

// Helper: Parse angka dari input dengan format Indonesia (titik sebagai pemisah ribuan)
export const parseIndonesianNumber = (value: string): number => {
  if (!value) return 0;
  const cleaned = value
    .replace(/[^\d.,]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
};

// Helper: Format angka ke format Indonesia
export const formatIndonesianNumber = (value: number): string => {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Ambil semua transaksi petty cash
 */
export const getPettyCashEntries = async (store: string | null): Promise<PettyCashEntry[]> => {
  const table = getTableName(store);
  try {
    const data = await fetchAllPettyCashRows(table);

    return (data || []).map(item => ({
      id: String(item.id),
      tgl: item.tgl,
      keterangan: item.keterangan || '',
      kegunaan: item.kegunaan || null,
      type: item.type as 'in' | 'out',
      akun: normalizeAkun(item.akun),
      saldokeluarmasuk: Number(item.saldokeluarmasuk) || 0,
      saldosaatini: Number(item.saldosaatini) || 0,
    }));
  } catch (err) {
    console.error('getPettyCashEntries error:', err);
    return [];
  }
};

/**
 * Hitung saldo terakhir per akun (cash atau bank)
 */
export const getBalanceByAccount = async (store: string | null, akun: 'cash' | 'bank'): Promise<number> => {
  const table = getTableName(store);
  const akunFilters = getAkunFilters(akun);
  try {
    const { data, error } = await supabase
      .from(table)
      .select('saldosaatini')
      .in('akun', akunFilters)
      .order('tgl', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return 0;
    }

    return Number(data[0].saldosaatini) || 0;
  } catch (err) {
    console.error('getBalanceByAccount error:', err);
    return 0;
  }
};

/**
 * Hitung total saldo (cash + bank)
 */
export const getTotalBalance = async (store: string | null): Promise<{ cash: number; bank: number; total: number }> => {
  try {
    const cashBalance = await getBalanceByAccount(store, 'cash');
    const bankBalance = await getBalanceByAccount(store, 'bank');
    
    return {
      cash: cashBalance,
      bank: bankBalance,
      total: cashBalance + bankBalance
    };
  } catch (err) {
    console.error('getTotalBalance error:', err);
    return { cash: 0, bank: 0, total: 0 };
  }
};

/**
 * Tambah transaksi baru - OPTIMIZED for speed
 * ID auto-generated by database (INT8)
 */
export const addPettyCashEntry = async (
  store: string | null,
  entry: {
    tgl: string;
    keterangan: string;
    kegunaan?: string | null;
    type: 'in' | 'out';
    akun: 'cash' | 'bank';
    amount: number;
  }
): Promise<{ success: boolean; message: string; data?: PettyCashEntry }> => {
  const table = getTableName(store);
  
  // Konversi tanggal ke timestamp lengkap (dengan waktu saat ini)
  const now = new Date();
  const tglWithTime = `${entry.tgl}T${now.toTimeString().slice(0, 8)}`;
  
  // Ambil saldo terakhir dulu untuk hitung saldo baru
  const currentBalance = await getBalanceByAccount(store, entry.akun);
  
  // Hitung saldo baru
  const saldosaatini = entry.type === 'in' 
    ? currentBalance + entry.amount 
    : currentBalance - entry.amount;
  
  try {
    // INSERT tanpa id - biarkan database auto-generate
    const { data, error } = await supabase
      .from(table)
      .insert([{
        tgl: tglWithTime,
        keterangan: entry.keterangan,
        kegunaan: entry.kegunaan || null,
        type: entry.type,
        akun: entry.akun,
        saldokeluarmasuk: entry.amount,
        saldosaatini,
      }])
      .select('id')
      .single();
    
    if (error) {
      console.error('Error adding petty cash entry:', error);
      return { success: false, message: error.message };
    }

    return { 
      success: true, 
      message: 'Transaksi berhasil ditambahkan',
      data: {
        id: String(data.id),
        tgl: tglWithTime,
        keterangan: entry.keterangan,
        kegunaan: entry.kegunaan || null,
        type: entry.type,
        akun: entry.akun,
        saldokeluarmasuk: entry.amount,
        saldosaatini,
      }
    };
  } catch (err: any) {
    console.error('addPettyCashEntry error:', err);
    return { success: false, message: err.message || 'Gagal menambah transaksi' };
  }
};

/**
 * Toggle kegunaan "PENGELUARAN LAIN LAIN" untuk transaksi petty cash
 */
export const updatePettyCashKegunaan = async (
  store: string | null,
  id: string,
  enabled: boolean
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  try {
    const { error } = await supabase
      .from(table)
      .update({ kegunaan: enabled ? 'PENGELUARAN LAIN LAIN' : null })
      .eq('id', id);

    if (error) {
      console.error('Error updating petty cash kegunaan:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Kegunaan berhasil diupdate' };
  } catch (err: any) {
    console.error('updatePettyCashKegunaan error:', err);
    return { success: false, message: err.message || 'Gagal update kegunaan' };
  }
};

/**
 * Hapus transaksi dan recalculate saldo
 */
export const deletePettyCashEntry = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  const normalizedId = String(id || '').trim();

  const deleteAndReturnRow = async (filterValue: string | number) => {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('id', filterValue as any)
      .select('id, akun')
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  };

  try {
    let deletedRows = await deleteAndReturnRow(normalizedId);

    if (deletedRows.length === 0 && /^\d+$/.test(normalizedId)) {
      deletedRows = await deleteAndReturnRow(Number(normalizedId));
    }

    if (deletedRows.length === 0) {
      return { success: false, message: 'Transaksi tidak ditemukan atau sudah terhapus.' };
    }

    const akun = normalizeAkun(deletedRows[0].akun);

    // Recalculate saldo untuk akun ini
    await recalculateBalancesByAccount(store, akun);

    return { success: true, message: 'Transaksi berhasil dihapus' };
  } catch (err: any) {
    console.error('deletePettyCashEntry error:', err);
    return { success: false, message: err.message || 'Gagal menghapus transaksi' };
  }
};

/**
 * Recalculate saldo untuk satu akun
 */
export const recalculateBalancesByAccount = async (store: string | null, akun: 'cash' | 'bank'): Promise<void> => {
  const table = getTableName(store);
  try {
    const data = await fetchAllPettyCashRowsByAccount(table, akun, true);

    let runningBalance = 0;

    for (const entry of data) {
      const amount = Number(entry.saldokeluarmasuk) || 0;
      runningBalance = entry.type === 'in' 
        ? runningBalance + amount 
        : runningBalance - amount;

      if (Number(entry.saldosaatini) !== runningBalance) {
        const { error } = await supabase
          .from(table)
          .update({ saldosaatini: runningBalance })
          .eq('id', entry.id);

        if (error) {
          throw new Error(`Gagal update saldo transaksi #${entry.id}: ${error.message}`);
        }
      }
    }
  } catch (err: any) {
    console.error('recalculateBalancesByAccount error:', err);
    throw new Error(err?.message || 'Gagal recalculate saldo');
  }
};

/**
 * Ambil transaksi dengan filter per akun
 */
export const getEntriesByAccount = async (store: string | null, akun: 'cash' | 'bank'): Promise<PettyCashEntry[]> => {
  const table = getTableName(store);
  try {
    const data = await fetchAllPettyCashRowsByAccount(table, akun, false);

    return (data || []).map(item => ({
      id: String(item.id),
      tgl: item.tgl,
      keterangan: item.keterangan || '',
      kegunaan: item.kegunaan || null,
      type: item.type as 'in' | 'out',
      akun: normalizeAkun(item.akun),
      saldokeluarmasuk: Number(item.saldokeluarmasuk) || 0,
      saldosaatini: Number(item.saldosaatini) || 0,
    }));
  } catch (err) {
    console.error('getEntriesByAccount error:', err);
    return [];
  }
};
