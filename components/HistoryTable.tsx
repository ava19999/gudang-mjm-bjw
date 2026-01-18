// FILE: src/components/HistoryTable.tsx
import React from 'react';
import { StockHistory } from '../types';
import { formatRupiah } from '../utils/dashboardHelpers';

export const HistoryTable = ({ data }: { data: StockHistory[] }) => (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                <tr>
                    <th className="px-3 py-2 border-r border-gray-700 w-28">Tanggal</th>
                    <th className="px-3 py-2 border-r border-gray-700 w-32">Pelanggan</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-24">Qty</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-28">Satuan</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-28">Total</th>
                    <th className="px-3 py-2 w-48">Keterangan</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 text-xs bg-gray-900/30">
                {data.map((h, idx) => {
                    const customer = h.customer || '-';
                    const isIn = h.type === 'in';
                    
                    // Format keterangan
                    let keterangan = '';
                    let ketStyle = '';
                    
                    if (isIn) {
                        keterangan = 'RESTOCK';
                        ketStyle = 'bg-green-900/30 text-green-400 border-green-800';
                    } else {
                        keterangan = customer !== '-' ? `KELUAR - ${customer}` : 'KELUAR';
                        ketStyle = 'bg-red-900/30 text-red-400 border-red-800';
                    }

                    return (
                        <tr key={h.id || idx} className="hover:bg-blue-900/10 transition-colors group">
                            <td className="px-3 py-2 align-top border-r border-gray-700 whitespace-nowrap text-gray-400">
                                <div className="font-bold text-gray-200">{new Date(h.timestamp || 0).toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'2-digit'})}</div>
                                <div className="text-[9px] opacity-70 font-mono">{new Date(h.timestamp || 0).toLocaleTimeString('id-ID', {timeZone: 'Asia/Jakarta', hour:'2-digit', minute:'2-digit'})}</div>
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-gray-300 font-medium">
                                {customer}
                            </td>
                            <td className={`px-3 py-2 align-top border-r border-gray-700 text-right font-bold text-lg ${isIn ? 'text-green-400' : 'text-red-400'}`}>
                                <div className="flex items-center justify-end gap-1">
                                    <span className="text-xs opacity-70">{isIn ? 'MASUK' : 'KELUAR'}</span>
                                    <span>{isIn ? '+' : '-'}{h.quantity || h.change || 0}</span>
                                </div>
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-right font-mono text-xs text-gray-400">
                                {formatRupiah(h.price || 0)}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-right font-mono text-xs font-bold text-gray-200">
                                {formatRupiah(h.total || h.totalPrice || ((h.price||0) * (h.quantity||h.change||0)))}
                            </td>
                            <td className="px-3 py-2 align-top">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${ketStyle}`}>
                                    {keterangan}
                                </span>
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);