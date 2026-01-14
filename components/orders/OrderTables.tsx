// FILE: src/components/orders/OrderTables.tsx
import React from 'react';
import { Order, OrderStatus, ReturRecord } from '../../types';
import { formatDate, getOrderDetails, getStatusColor, getStatusLabel } from '../../utils/orderHelpers';
import { formatRupiah } from '../../utils';
import { Store, Edit3, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (p: number) => void;
    currentCount: number;
    totalItems: number;
    startIndex: number;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange, currentCount, totalItems, startIndex }) => (
    <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
        <div>Menampilkan {startIndex + 1}-{Math.min(startIndex + 100, totalItems)} dari {totalItems} data</div>
        <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16}/></button>
            <span className="font-bold text-gray-200">Halaman {currentPage}</span>
            <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="p-1 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16}/></button>
        </div>
    </div>
);

// --- TABEL PESANAN (BARU / TERJUAL) ---
interface OrderListViewProps {
    orders: Order[];
    onUpdateStatus: (id: string, status: OrderStatus) => void;
    openReturnModal: (order: Order) => void;
    page: number;
    setPage: (p: number) => void;
}

export const OrderListView: React.FC<OrderListViewProps> = ({ orders, onUpdateStatus, openReturnModal, page, setPage }) => {
    const itemsPerPage = 100;
    const totalPages = Math.ceil(orders.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const currentOrders = orders.slice(startIndex, startIndex + itemsPerPage);

    if (orders.length === 0) return <div className="p-8 text-center text-gray-500"><ClipboardList size={32} className="opacity-20 mx-auto mb-2" /><p>Belum ada data pesanan</p></div>;

    return (
        <div className="flex-1 overflow-x-auto p-2 bg-gray-900">
            <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-hidden min-w-[1000px]">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        <tr><th className="px-3 py-2 w-28">Tanggal</th><th className="px-3 py-2 w-32">Resi / Toko</th><th className="px-3 py-2 w-24">Via</th><th className="px-3 py-2 w-32">Pelanggan</th><th className="px-3 py-2 w-28">Part No.</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2 text-right w-16">Qty</th><th className="px-3 py-2 text-right w-24">Satuan</th><th className="px-3 py-2 text-right w-24">Total</th><th className="px-3 py-2 text-center w-24">Status</th><th className="px-3 py-2 text-center w-32">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 text-xs">
                        {currentOrders.map(order => {
                            if(!order) return null;
                            const {cleanName, resiText, ecommerce, shopName} = getOrderDetails(order);
                            const isResi = !resiText.startsWith('#');
                            const dt = formatDate(order.timestamp);
                            const items = Array.isArray(order.items) ? order.items : [];
                            
                            return items.map((item, index) => {
                                const dealPrice = item.customPrice ?? item.price ?? 0;
                                const dealTotal = dealPrice * (item.cartQuantity || 0);
                                const hasCustomPrice = item.customPrice !== undefined && item.customPrice !== item.price;
                                return (
                                    <tr key={`${order.id}-${index}`} className="hover:bg-blue-900/10 transition-colors group">
                                        {index===0 && (<>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top border-r border-gray-700 bg-gray-800 group-hover:bg-blue-900/10"><div className="font-bold text-gray-200">{dt.date}</div><div className="text-[9px] text-gray-500 font-mono">{dt.time}</div></td>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top border-r border-gray-700 font-mono text-[10px] bg-gray-800 group-hover:bg-blue-900/10"><div className="flex flex-col gap-1"><span className={`px-1.5 py-0.5 rounded w-fit font-bold border ${isResi ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'text-gray-500 bg-gray-700 border-gray-600'}`}>{resiText}</span>{shopName!=='-' && <div className="flex items-center gap-1 text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded w-fit border border-gray-600"><Store size={8}/><span className="uppercase truncate max-w-[80px]">{shopName}</span></div>}</div></td>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top border-r border-gray-700 bg-gray-800 group-hover:bg-blue-900/10">{ecommerce!=='-'?<div className="px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-400 border border-orange-800 w-fit text-[9px] font-bold">{ecommerce}</div>:<span className="text-gray-600">-</span>}</td>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top border-r border-gray-700 font-medium text-gray-200 bg-gray-800 group-hover:bg-blue-900/10 truncate max-w-[120px]" title={cleanName}>{cleanName}</td>
                                        </>)}
                                        <td className="px-3 py-2 align-top font-mono text-[10px] text-gray-500">{item.partNumber||'-'}</td>
                                        <td className="px-3 py-2 align-top text-gray-300 font-medium truncate max-w-[180px]" title={item.name}>{item.name}</td>
                                        <td className="px-3 py-2 align-top text-right font-bold text-gray-300">{item.cartQuantity||0}</td>
                                        <td className="px-3 py-2 align-top text-right text-gray-500 font-mono text-[10px]"><div className={hasCustomPrice?"text-orange-400 font-bold":""}>{formatRupiah(dealPrice)}</div></td>
                                        <td className="px-3 py-2 align-top text-right font-bold text-gray-200 font-mono text-[10px]">{formatRupiah(dealTotal)}</td>
                                        {index===0 && (<>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top text-center border-l border-gray-700 bg-gray-800 group-hover:bg-blue-900/10"><div className={`inline-block px-2 py-0.5 rounded text-[9px] font-extrabold border uppercase mb-1 shadow-sm ${getStatusColor(order.status)}`}>{getStatusLabel(order.status)}</div><div className="text-[10px] font-extrabold text-purple-400">{formatRupiah(order.totalAmount||0)}</div></td>
                                            <td rowSpan={items.length} className="px-3 py-2 align-top text-center border-l border-gray-700 bg-gray-800 group-hover:bg-blue-900/10"><div className="flex flex-col gap-1 items-center">{order.status==='pending' && (<><button onClick={()=>onUpdateStatus(order.id, 'processing')} className="w-full py-1 bg-purple-700 text-white text-[9px] font-bold rounded hover:bg-purple-600 shadow-sm flex items-center justify-center gap-1">Proses</button><button onClick={()=>onUpdateStatus(order.id, 'cancelled')} className="w-full py-1 bg-gray-700 border border-gray-600 text-gray-400 text-[9px] font-bold rounded hover:bg-red-900/30 hover:text-red-400">Tolak</button></>)}{order.status==='processing' && (<button onClick={()=>openReturnModal(order)} className="w-full py-1 bg-orange-900/30 border border-orange-800 text-orange-400 text-[9px] font-bold rounded hover:bg-orange-800 flex items-center justify-center gap-1">Retur</button>)}</div></td>
                                        </>)}
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} currentCount={currentOrders.length} totalItems={orders.length} startIndex={startIndex} />
        </div>
    );
};

// --- TABEL HISTORY RETUR ---
interface ReturnHistoryViewProps {
    returRecords: ReturRecord[];
    openNoteModal: (retur: ReturRecord) => void;
    page: number;
    setPage: (p: number) => void;
}

export const ReturnHistoryView: React.FC<ReturnHistoryViewProps> = ({ returRecords, openNoteModal, page, setPage }) => {
    const itemsPerPage = 100;
    const totalPages = Math.ceil(returRecords.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const currentReturs = returRecords.slice(startIndex, startIndex + itemsPerPage);

    if (returRecords.length === 0) return <div className="p-8 text-center text-gray-500"><ClipboardList size={32} className="opacity-20 mx-auto mb-2" /><p>Belum ada data retur</p></div>;

    return (
        <div className="flex-1 overflow-x-auto p-2 bg-gray-900">
            <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-hidden min-w-[1000px]">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        <tr><th className="px-3 py-2 w-28">Tanggal</th><th className="px-3 py-2 w-32">Resi / Toko</th><th className="px-3 py-2 w-24">Via</th><th className="px-3 py-2 w-32">Pelanggan</th><th className="px-3 py-2 w-28">Part No.</th><th className="px-3 py-2">Barang</th><th className="px-3 py-2 text-right w-16">Qty</th><th className="px-3 py-2 text-right w-24">Satuan</th><th className="px-3 py-2 text-right w-24">Total</th><th className="px-3 py-2 w-24 bg-red-900/20 text-red-400 border-l border-red-800">Tgl Retur</th><th className="px-3 py-2 text-center w-24 bg-red-900/20 text-red-400">Status</th><th className="px-3 py-2 text-center w-32">Ket</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 text-xs">
                        {currentReturs.map(retur => {
                            const dtOrder = formatDate(retur.tanggal_pemesanan||'');
                            const dtRetur = formatDate(retur.tanggal_retur);
                            return (
                                <tr key={`retur-${retur.id}`} className="hover:bg-red-900/10 transition-colors">
                                    <td className="px-3 py-2 align-top border-r border-gray-700"><div className="font-bold text-gray-200">{dtOrder.date}</div><div className="text-[9px] text-gray-500 font-mono">{dtOrder.time}</div></td>
                                    <td className="px-3 py-2 align-top font-mono text-[10px] text-gray-400"><div className="flex flex-col gap-1"><span className="font-bold text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-800 w-fit">{retur.resi || '-'}</span>{retur.toko && <span className="uppercase text-gray-400 bg-gray-700 px-1 py-0.5 rounded w-fit">{retur.toko}</span>}</div></td>
                                    <td className="px-3 py-2 align-top">{retur.ecommerce ? <span className="px-1.5 py-0.5 bg-orange-900/30 text-orange-400 text-[9px] font-bold rounded border border-orange-800">{retur.ecommerce}</span> : '-'}</td>
                                    <td className="px-3 py-2 align-top font-medium text-gray-200 truncate max-w-[120px]" title={retur.customer}>{retur.customer||'Guest'}</td>
                                    <td className="px-3 py-2 align-top font-mono text-[10px] text-gray-500">{retur.part_number||'-'}</td>
                                    <td className="px-3 py-2 align-top text-gray-300 font-medium truncate max-w-[200px]" title={retur.nama_barang}>{retur.nama_barang}</td>
                                    <td className="px-3 py-2 align-top text-right font-bold text-red-400">-{retur.quantity}</td>
                                    <td className="px-3 py-2 align-top text-right font-mono text-[10px] text-gray-500">{formatRupiah(retur.harga_satuan)}</td>
                                    <td className="px-3 py-2 align-top text-right font-mono text-[10px] font-bold text-gray-300">{formatRupiah(retur.harga_total)}</td>
                                    <td className="px-3 py-2 align-top border-l border-red-800 bg-red-900/10"><div className="font-bold text-red-400 text-[10px]">{dtRetur.date}</div><div className="text-[9px] text-red-300/70 font-mono">{dtRetur.time}</div></td>
                                    <td className="px-3 py-2 align-top text-center bg-red-900/10"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${retur.status==='Full Retur'?'bg-red-900/30 text-red-400 border-red-800':'bg-orange-900/30 text-orange-400 border-orange-800'}`}>{retur.status||'Retur'}</span></td>
                                    <td className="px-3 py-2 align-top"><div className="flex items-start justify-between gap-1 group/edit"><div className="text-[10px] text-gray-500 italic truncate max-w-[100px]">{retur.keterangan||'-'}</div><button onClick={()=>openNoteModal(retur)} className="text-blue-400 hover:bg-blue-900/50 p-1 rounded opacity-0 group-hover/edit:opacity-100"><Edit3 size={12}/></button></div></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} currentCount={currentReturs.length} totalItems={returRecords.length} startIndex={startIndex} />
        </div>
    );
};