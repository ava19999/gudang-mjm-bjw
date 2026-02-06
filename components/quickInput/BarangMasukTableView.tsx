// FILE: src/components/quickInput/BarangMasukTableView.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { fetchBarangMasukLog, deleteBarangLog } from '../../services/supabaseService';
import { supabase } from '../../services/supabaseClient';
import { formatRupiah, formatDate } from '../../utils';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, PackageOpen, Trash2, Search, X, Edit2, Save, XCircle, Image } from 'lucide-react';
import { ImageViewer } from '../common/ImageViewer';

interface Props { 
    refreshTrigger: number; 
    onRefresh?: () => void;
}

// Helper to extract all photo URLs from foto row
const extractPhotoUrls = (fotoRow: any): string[] => {
    if (!fotoRow) return [];
    const urls: string[] = [];
    for (let i = 1; i <= 10; i++) {
        const url = fotoRow[`foto_${i}`];
        if (url && typeof url === 'string' && url.trim()) {
            urls.push(url.trim());
        }
    }
    return urls;
};

export const BarangMasukTableView: React.FC<Props> = ({ refreshTrigger, onRefresh }) => {
    const { selectedStore } = useStore();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [showFilter, setShowFilter] = useState(false);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterPartNumber, setFilterPartNumber] = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<{
        part_number: string;
        quantity: string;
        harga_satuan: string;
        customer: string;
        tempo: string;
    }>({ part_number: '', quantity: '', harga_satuan: '', customer: '', tempo: '' });
    const [savingId, setSavingId] = useState<number | null>(null);
    
    // Part number dropdown states
    const [partOptions, setPartOptions] = useState<Array<{part_number: string, name: string, quantity: number}>>([]);
    const [showPartDropdown, setShowPartDropdown] = useState(false);
    const [partDropdownIndex, setPartDropdownIndex] = useState(-1);
    const partDropdownRef = useRef<HTMLDivElement>(null);
    
    // Photo hover & viewer states
    const [hoverPartNumber, setHoverPartNumber] = useState<string | null>(null);
    const [hoverPhotoUrl, setHoverPhotoUrl] = useState<string | null>(null);
    const [hoverLoading, setHoverLoading] = useState(false);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [photoCache, setPhotoCache] = useState<Record<string, string[]>>({});
    const [viewerImages, setViewerImages] = useState<string[]>([]);
    const [viewerOpen, setViewerOpen] = useState(false);
    
    const LIMIT = 10;

    // Fetch photos for a part number
    const fetchPhotosForPartNumber = useCallback(async (partNumber: string): Promise<string[]> => {
        // Check cache first
        if (photoCache[partNumber]) {
            return photoCache[partNumber];
        }
        
        try {
            // Use ilike for case-insensitive matching
            const { data: fotoData, error } = await supabase
                .from('foto')
                .select('*')
                .ilike('part_number', partNumber)
                .limit(1)
                .single();
            
            if (error) {
                console.log('[Photo] No photo found for:', partNumber);
                setPhotoCache(prev => ({ ...prev, [partNumber]: [] }));
                return [];
            }
            
            const urls = extractPhotoUrls(fotoData);
            console.log('[Photo] Found', urls.length, 'photos for:', partNumber);
            setPhotoCache(prev => ({ ...prev, [partNumber]: urls }));
            return urls;
        } catch (e) {
            console.error('[Photo] Error fetching:', e);
            setPhotoCache(prev => ({ ...prev, [partNumber]: [] }));
            return [];
        }
    }, [photoCache]);

    // Handle mouse enter on part number
    const handlePartNumberMouseEnter = async (e: React.MouseEvent, partNumber: string) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setHoverPosition({ x: rect.left, y: rect.bottom + 5 });
        setHoverPartNumber(partNumber);
        setHoverLoading(true);
        setHoverPhotoUrl(null);
        
        const photos = await fetchPhotosForPartNumber(partNumber);
        setHoverLoading(false);
        if (photos.length > 0) {
            // Set photo URL langsung tanpa cek state karena state async
            setHoverPhotoUrl(photos[0]);
        }
    };

    // Handle mouse leave on part number
    const handlePartNumberMouseLeave = () => {
        setHoverPartNumber(null);
        setHoverPhotoUrl(null);
        setHoverLoading(false);
    };

    // Handle click on part number to open viewer
    const handlePartNumberClick = async (partNumber: string) => {
        const photos = await fetchPhotosForPartNumber(partNumber);
        if (photos.length > 0) {
            setViewerImages(photos);
            setViewerOpen(true);
        }
    };

    // Load part number options for dropdown
    const loadPartOptions = useCallback(async () => {
        try {
            const tableName = selectedStore === 'mjm' ? 'inventory_mjm' : 'inventory_bjw';
            const { data: parts, error } = await supabase
                .from(tableName)
                .select('part_number, nama_barang, stok_akhir')
                .order('part_number', { ascending: true })
                .limit(1000);
            
            if (!error && parts) {
                setPartOptions(parts.map(p => ({
                    part_number: p.part_number,
                    name: p.nama_barang || '',
                    quantity: p.stok_akhir || 0
                })));
            }
        } catch (e) {
            console.error('Error loading part options:', e);
        }
    }, [selectedStore]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (partDropdownRef.current && !partDropdownRef.current.contains(e.target as Node)) {
                setShowPartDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load part options when store changes
    useEffect(() => {
        loadPartOptions();
    }, [loadPartOptions]);

    // Handle part number selection from dropdown
    const handlePartNumberSelect = (partNumber: string, name: string) => {
        setEditForm(prev => ({ ...prev, part_number: partNumber }));
        setShowPartDropdown(false);
        setPartDropdownIndex(-1);
        
        // Update local data immediately to show name
        setData(prevData => prevData.map(d => 
            d.id === editingId 
                ? { ...d, name: name } 
                : d
        ));
    };

    // Handle keyboard navigation in dropdown
    const handlePartKeyDown = (e: React.KeyboardEvent) => {
        const filtered = partOptions.filter(p => 
            p.part_number.toLowerCase().includes(editForm.part_number.toLowerCase())
        ).slice(0, 50);
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setShowPartDropdown(true);
            setPartDropdownIndex(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setPartDropdownIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && partDropdownIndex >= 0 && filtered[partDropdownIndex]) {
            e.preventDefault();
            handlePartNumberSelect(filtered[partDropdownIndex].part_number, filtered[partDropdownIndex].name);
        } else if (e.key === 'Escape') {
            setShowPartDropdown(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            // Build filters object for server-side filtering
            const filters = {
                partNumber: filterPartNumber || undefined,
                customer: filterCustomer || undefined,
                dateFrom: filterDateFrom || undefined,
                dateTo: filterDateTo || undefined,
            };
            
            const { data: logs, total } = await fetchBarangMasukLog(selectedStore, page, LIMIT, filters);
            
            setData(logs);
            setTotalRows(total);
        } catch (e) {
            console.error("Gagal memuat data barang masuk:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (item: { id: number; part_number: string; quantity?: number; qty_masuk?: number; name?: string }) => {
        const qtyToDelete = item.quantity || item.qty_masuk || 0;
        console.log('handleDelete item:', item);
        console.log('qty to delete:', qtyToDelete);
        
        if (!confirm(`Hapus log barang masuk "${item.part_number}"?\nStok akan dikembalikan (dikurangi ${qtyToDelete}).`)) return;
        
        if (qtyToDelete <= 0) {
            alert('Error: Qty tidak valid. Tidak dapat menghapus.');
            return;
        }
        
        setDeletingId(item.id);
        try {
            const success = await deleteBarangLog(
                item.id, 
                'in', 
                item.part_number, 
                qtyToDelete, 
                selectedStore
            );
            
            if (success) {
                // Hapus dari state lokal terlebih dahulu untuk UX yang lebih responsif
                setData(prevData => prevData.filter(d => d.id !== item.id));
                setTotalRows(prev => Math.max(0, prev - 1));
                
                // Kemudian refresh data dari server untuk memastikan sinkronisasi
                setTimeout(() => {
                    loadData();
                }, 300);
                
                if (onRefresh) onRefresh();
            } else {
                alert('Gagal menghapus log. Silakan coba lagi.');
            }
        } catch (error) {
            console.error('Error deleting log:', error);
            alert('Terjadi error saat menghapus log.');
        } finally {
            setDeletingId(null);
        }
    };

    const resetFilters = () => {
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterPartNumber('');
        setFilterCustomer('');
        setPage(1);
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setEditForm({
            part_number: item.part_number || '',
            quantity: String(item.quantity || item.qty_masuk || 0),
            harga_satuan: String(item.harga_satuan || 0),
            customer: item.customer || '',
            tempo: item.tempo || 'CASH',
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({ part_number: '', quantity: '', harga_satuan: '', customer: '', tempo: '' });
    };

    const handleSaveEdit = async (item: any) => {
        const newQty = parseInt(editForm.quantity);
        const newHarga = parseFloat(editForm.harga_satuan) || 0;
        const newPartNumber = editForm.part_number.trim().toUpperCase();
        const oldQty = item.quantity || item.qty_masuk || 0;
        const oldPartNumber = item.part_number;
        const partNumberChanged = newPartNumber !== oldPartNumber;

        if (!newQty || newQty <= 0) {
            alert('Qty harus lebih dari 0');
            return;
        }

        if (!newPartNumber) {
            alert('Part Number tidak boleh kosong');
            return;
        }

        setSavingId(item.id);
        try {
            const tableName = selectedStore === 'mjm' ? 'barang_masuk_mjm' : 'barang_masuk_bjw';
            const inventoryTable = selectedStore === 'mjm' ? 'inventory_mjm' : 'inventory_bjw';
            const qtyDiff = newQty - oldQty;

            // Update barang_masuk record (including part_number)
            const { error: updateError } = await supabase
                .from(tableName)
                .update({
                    part_number: newPartNumber,
                    qty_masuk: newQty,
                    harga_satuan: newHarga,
                    harga_total: newQty * newHarga,
                    customer: editForm.customer || null,
                    tempo: editForm.tempo || 'CASH',
                })
                .eq('id', item.id);

            if (updateError) throw updateError;

            // Handle inventory stock adjustments
            if (partNumberChanged) {
                // Part number changed: reduce stock from old part, add to new part
                
                // 1. Reduce stock from old part number
                const { data: oldInventory } = await supabase
                    .from(inventoryTable)
                    .select('stok_akhir')
                    .eq('part_number', oldPartNumber)
                    .single();

                if (oldInventory) {
                    const oldStock = oldInventory.stok_akhir || 0;
                    const newOldStock = Math.max(0, oldStock - oldQty);
                    await supabase
                        .from(inventoryTable)
                        .update({ stok_akhir: newOldStock })
                        .eq('part_number', oldPartNumber);
                }

                // 2. Add stock to new part number
                const { data: newInventory } = await supabase
                    .from(inventoryTable)
                    .select('stok_akhir')
                    .eq('part_number', newPartNumber)
                    .single();

                if (newInventory) {
                    const currentNewStock = newInventory.stok_akhir || 0;
                    await supabase
                        .from(inventoryTable)
                        .update({ stok_akhir: currentNewStock + newQty })
                        .eq('part_number', newPartNumber);
                }
            } else if (qtyDiff !== 0) {
                // Same part number, only qty changed
                const { data: inventoryData } = await supabase
                    .from(inventoryTable)
                    .select('stok_akhir')
                    .eq('part_number', item.part_number)
                    .single();

                if (inventoryData) {
                    const currentStock = inventoryData.stok_akhir || 0;
                    const newStock = Math.max(0, currentStock + qtyDiff);

                    await supabase
                        .from(inventoryTable)
                        .update({ stok_akhir: newStock })
                        .eq('part_number', item.part_number);
                }
            }

            // Update local state for immediate feedback
            setData(prevData => prevData.map(d => 
                d.id === item.id 
                    ? { 
                        ...d, 
                        part_number: newPartNumber,
                        quantity: newQty,
                        qty_masuk: newQty,
                        harga_satuan: newHarga, 
                        harga_total: newQty * newHarga,
                        customer: editForm.customer,
                        tempo: editForm.tempo,
                        current_qty: partNumberChanged ? newQty : ((d.current_qty || 0) + qtyDiff)
                    } 
                    : d
            ));

            setEditingId(null);
            setEditForm({ part_number: '', quantity: '', harga_satuan: '', customer: '', tempo: '' });
            
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error updating barang masuk:', error);
            alert('Gagal menyimpan perubahan. Silakan coba lagi.');
        } finally {
            setSavingId(null);
        }
    };

    useEffect(() => { setPage(1); }, [selectedStore]);
    // Note: Filters trigger immediate reload. For production, consider debouncing filter inputs to reduce API calls.
    useEffect(() => { loadData(); }, [selectedStore, page, refreshTrigger, filterDateFrom, filterDateTo, filterPartNumber, filterCustomer]);

    const totalPages = Math.ceil(totalRows / LIMIT);

    return (
        <div className="flex-1 bg-gray-900 border-t border-gray-700 flex flex-col overflow-hidden h-[40vh]">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <PackageOpen size={16} className="text-green-500"/>
                    Riwayat Barang Masuk ({selectedStore?.toUpperCase()})
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowFilter(!showFilter)} 
                        className={`p-1.5 hover:bg-gray-700 rounded transition-colors ${showFilter ? 'bg-gray-700 text-green-400' : 'text-gray-400'}`}
                        title="Toggle Filter"
                    >
                        <Search size={14} />
                    </button>
                    <button onClick={loadData} className="p-1.5 hover:bg-gray-700 rounded text-gray-400">
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            {showFilter && (
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tanggal Dari</label>
                            <input 
                                type="date" 
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tanggal Sampai</label>
                            <input 
                                type="date" 
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Part Number</label>
                            <input 
                                type="text" 
                                value={filterPartNumber}
                                onChange={(e) => setFilterPartNumber(e.target.value)}
                                placeholder="Cari part number..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Customer/Sumber</label>
                            <input 
                                type="text" 
                                value={filterCustomer}
                                onChange={(e) => setFilterCustomer(e.target.value)}
                                placeholder="Cari customer..."
                                className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-green-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={resetFilters}
                            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-1 transition-colors"
                        >
                            <X size={12} /> Reset Filter
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-2">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-2">Tanggal</th>
                            <th className="px-3 py-2">Part Number</th>
                            <th className="px-3 py-2">Nama Barang</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Stok Saat Ini</th>
                            <th className="px-3 py-2 text-right">Harga Satuan</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2">Customer/Sumber</th>
                            <th className="px-3 py-2">Tempo</th>
                            <th className="px-3 py-2 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-gray-700/50">
                        {loading ? (
                            <tr><td colSpan={10} className="py-8 text-center text-gray-500"><Loader2 size={16} className="animate-spin inline mr-2"/>Memuat data...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={10} className="py-8 text-center text-gray-600 italic">Belum ada data barang masuk.</td></tr>
                        ) : (
                            data.map((item, idx) => (
                                <tr key={item.id || idx} className={`hover:bg-gray-800/50 transition-colors ${editingId === item.id ? 'bg-gray-800/80' : ''}`}>
                                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{formatDate(item.created_at)}</td>
                                    <td className="px-3 py-2 font-bold font-mono relative">
                                        {editingId === item.id ? (
                                            <div ref={partDropdownRef} className="relative">
                                                <input
                                                    type="text"
                                                    value={editForm.part_number}
                                                    onChange={(e) => {
                                                        setEditForm({ ...editForm, part_number: e.target.value.toUpperCase() });
                                                        setShowPartDropdown(true);
                                                        setPartDropdownIndex(-1);
                                                    }}
                                                    onFocus={() => setShowPartDropdown(true)}
                                                    onKeyDown={handlePartKeyDown}
                                                    className="w-32 px-2 py-1 text-xs bg-gray-900 border border-blue-500 rounded text-blue-400 focus:outline-none font-mono"
                                                    placeholder="Part Number..."
                                                    autoComplete="off"
                                                />
                                                {/* Part Number Dropdown */}
                                                {showPartDropdown && (
                                                    <div className="absolute left-0 top-full mt-1 bg-gray-800 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto border border-gray-600 w-72">
                                                        {(() => {
                                                            const filtered = partOptions.filter(p => 
                                                                p.part_number.toLowerCase().includes(editForm.part_number.toLowerCase())
                                                            ).slice(0, 50);
                                                            
                                                            if (filtered.length === 0) {
                                                                return (
                                                                    <div className="p-3 text-center text-gray-500 text-[10px]">
                                                                        Tidak ditemukan
                                                                    </div>
                                                                );
                                                            }
                                                            
                                                            return filtered.map((part, pIdx) => (
                                                                <div 
                                                                    key={pIdx}
                                                                    className={`px-3 py-2 cursor-pointer border-b border-gray-700 last:border-0 transition-colors ${
                                                                        partDropdownIndex === pIdx 
                                                                            ? 'bg-gray-700 border-l-2 border-blue-400' 
                                                                            : 'hover:bg-gray-700'
                                                                    }`}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        handlePartNumberSelect(part.part_number, part.name);
                                                                    }}
                                                                    onMouseEnter={() => setPartDropdownIndex(pIdx)}
                                                                >
                                                                    <div className="font-bold text-blue-400 font-mono text-xs">{part.part_number}</div>
                                                                    <div className="text-gray-400 text-[10px] truncate">{part.name}</div>
                                                                    <div className="text-cyan-400 text-[10px]">Stok: {part.quantity}</div>
                                                                </div>
                                                            ));
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span 
                                                className="text-blue-400 underline decoration-dotted cursor-pointer hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                                                onMouseEnter={(e) => handlePartNumberMouseEnter(e, item.part_number)}
                                                onMouseLeave={handlePartNumberMouseLeave}
                                                onClick={() => handlePartNumberClick(item.part_number)}
                                                title="Hover untuk preview, klik untuk lihat semua foto"
                                            >
                                                {item.part_number}
                                                <Image size={12} className="opacity-50" />
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={item.name}>{item.name || '-'}</td>
                                    <td className="px-3 py-2 text-right">
                                        {editingId === item.id ? (
                                            <input
                                                type="number"
                                                value={editForm.quantity}
                                                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                                                className="w-20 px-2 py-1 text-xs bg-gray-900 border border-green-500 rounded text-green-400 text-right focus:outline-none"
                                                min="1"
                                            />
                                        ) : (
                                            <span className="font-bold text-green-400">+{item.quantity || item.qty_masuk}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-cyan-400">{item.current_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">
                                        {editingId === item.id ? (
                                            <input
                                                type="number"
                                                value={editForm.harga_satuan}
                                                onChange={(e) => setEditForm({ ...editForm, harga_satuan: e.target.value })}
                                                className="w-24 px-2 py-1 text-xs bg-gray-900 border border-orange-500 rounded text-orange-300 text-right focus:outline-none"
                                                min="0"
                                            />
                                        ) : (
                                            <span className="text-gray-400 font-mono">{formatRupiah(item.harga_satuan)}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right text-orange-300 font-mono">
                                        {editingId === item.id 
                                            ? formatRupiah(parseInt(editForm.quantity || '0') * parseFloat(editForm.harga_satuan || '0'))
                                            : formatRupiah(item.harga_total)
                                        }
                                    </td>
                                    <td className="px-3 py-2">
                                        {editingId === item.id ? (
                                            <input
                                                type="text"
                                                value={editForm.customer}
                                                onChange={(e) => setEditForm({ ...editForm, customer: e.target.value })}
                                                className="w-28 px-2 py-1 text-xs bg-gray-900 border border-gray-500 rounded text-gray-300 focus:outline-none"
                                                placeholder="Customer..."
                                            />
                                        ) : (
                                            <span className="text-gray-400">{item.customer && item.customer !== '-' ? item.customer : (item.ecommerce || '-')}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {editingId === item.id ? (
                                            <select
                                                value={editForm.tempo}
                                                onChange={(e) => setEditForm({ ...editForm, tempo: e.target.value })}
                                                className="w-20 px-2 py-1 text-xs bg-gray-900 border border-gray-500 rounded text-gray-300 focus:outline-none"
                                            >
                                                <option value="CASH">CASH</option>
                                                <option value="TEMPO">TEMPO</option>
                                            </select>
                                        ) : (
                                            <span className="text-gray-500">{item.tempo || '-'}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {editingId === item.id ? (
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => handleSaveEdit(item)}
                                                    disabled={savingId === item.id}
                                                    className="p-1 hover:bg-green-900/30 rounded text-green-500 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Simpan Perubahan"
                                                >
                                                    {savingId === item.id ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Save size={14} />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    disabled={savingId === item.id}
                                                    className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-300 disabled:opacity-50 transition-colors"
                                                    title="Batal"
                                                >
                                                    <XCircle size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    disabled={editingId !== null}
                                                    className="p-1 hover:bg-blue-900/30 rounded text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item)}
                                                    disabled={deletingId === item.id || editingId !== null}
                                                    className="p-1 hover:bg-red-900/30 rounded text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Hapus & Rollback Stok"
                                                >
                                                    {deletingId === item.id ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-xs">
                <span className="text-gray-500">Hal {page} dari {totalPages || 1}</span>
                <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronLeft size={16}/></button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronRight size={16}/></button>
                </div>
            </div>

            {/* Photo Hover Tooltip - Show when hovering */}
            {hoverPartNumber && (
                <div 
                    className="fixed z-[9999] bg-gray-900 border border-gray-600 rounded-lg shadow-2xl p-2 pointer-events-none"
                    style={{ 
                        left: Math.min(hoverPosition.x, window.innerWidth - 220), 
                        top: Math.min(hoverPosition.y, window.innerHeight - 220) 
                    }}
                >
                    {hoverLoading ? (
                        <div className="w-48 h-48 flex items-center justify-center bg-gray-800 rounded-lg">
                            <Loader2 size={24} className="animate-spin text-blue-400" />
                        </div>
                    ) : hoverPhotoUrl ? (
                        <img 
                            src={hoverPhotoUrl} 
                            alt={hoverPartNumber}
                            className="w-48 h-48 object-contain rounded-lg bg-gray-800"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = '';
                                (e.target as HTMLImageElement).alt = 'Gagal memuat';
                            }}
                        />
                    ) : (
                        <div className="w-48 h-32 flex items-center justify-center bg-gray-800 rounded-lg text-gray-500 text-xs">
                            <div className="text-center">
                                <Image size={24} className="mx-auto mb-2 opacity-50" />
                                Tidak ada foto
                            </div>
                        </div>
                    )}
                    {hoverPhotoUrl && (
                        <div className="text-[10px] text-gray-400 text-center mt-1">
                            Klik untuk lihat semua foto
                        </div>
                    )}
                </div>
            )}

            {/* Image Viewer Modal */}
            <ImageViewer 
                images={viewerImages}
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
            />
        </div>
    );
};