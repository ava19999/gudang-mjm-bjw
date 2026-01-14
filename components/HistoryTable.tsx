// FILE: src/components/HistoryTable.tsx
import React from 'react';
import { StockHistory } from '../types';
import { Store } from 'lucide-react';
import { parseHistoryReason, formatRupiah } from '../utils/dashboardHelpers';

export const HistoryTable = ({ data }: { data: StockHistory[] }) => (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">
                <tr>
                    <th className="px-3 py-2 border-r border-gray-700 w-24">Tanggal</th>
                    <th className="px-3 py-2 border-r border-gray-700 w-32">Resi / Toko</th>
                    <th className="px-3 py-2 border-r border-gray-700 w-36">Via</th>
                    <th className="px-3 py-2 border-r border-gray-700 w-32">Pelanggan</th>
                    <th className="px-3 py-2 border-r border-gray-700 w-28">Part No</th>
                    <th className="px-3 py-2 border-r border-gray-700">Barang</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-16">Qty</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-24">Satuan</th>
                    <th className="px-3 py-2 border-r border-gray-700 text-right w-24">Total</th>
                    <th className="px-3 py-2 text-center w-28">Keterangan</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 text-xs bg-gray-900/30">
                {data.map((h, idx) => {
                    const { resi, subInfo, customer, ecommerce, keterangan, isRetur } = parseHistoryReason(h);
                    
                    let ketStyle = 'bg-gray-700 text-gray-300 border-gray-600';
                    if (h.type === 'in') {
                        if (isRetur) {
                            ketStyle = 'bg-red-900/30 text-red-400 border-red-800'; 
                        } else {
                            ketStyle = 'bg-green-900/30 text-green-400 border-green-800'; 
                        }
                    } else if (h.type === 'out') {
                        ketStyle = 'bg-blue-900/30 text-blue-400 border-blue-800';
                    }

                    return (
                        <tr key={h.id || idx} className="hover:bg-blue-900/10 transition-colors group">
                            <td className="px-3 py-2 align-top border-r border-gray-700 whitespace-nowrap text-gray-400">
                                <div className="font-bold text-gray-200">{new Date(h.timestamp || 0).toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'2-digit'})}</div>
                                <div className="text-[9px] opacity-70 font-mono">{new Date(h.timestamp || 0).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</div>
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 font-mono text-[10px]">
                                <div className="flex flex-col items-start gap-2"> 
                                    <span className={`px-1.5 py-0.5 rounded w-fit font-bold border ${resi !== '-' ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'text-gray-500 bg-gray-800 border-gray-600'}`}>
                                        {resi !== '-' ? resi : '-'}
                                    </span>
                                    {subInfo !== '-' ? (
                                        <div className="flex items-center gap-1 text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-600 w-fit">
                                            <Store size={8}/>
                                            <span className="uppercase truncate max-w-[90px]">{subInfo}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700">
                                {ecommerce !== '-' ? (
                                    <span className="px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-400 text-[9px] font-bold border border-orange-800 break-words">{ecommerce}</span>
                                ) : <span className="text-gray-600">-</span>}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-gray-300 font-medium">
                                {customer !== '-' ? customer : '-'}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 font-mono text-[10px] text-gray-400">
                                {h.partNumber}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700">
                                <div className="font-bold text-gray-200 text-xs">{h.name}</div>
                            </td>
                            <td className={`px-3 py-2 align-top border-r border-gray-700 text-right font-bold ${h.type === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                                {h.type === 'in' ? '+' : '-'}{h.quantity}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-right font-mono text-[10px] text-gray-400">
                                {formatRupiah(h.price)}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-right font-mono text-[10px] font-bold text-gray-200">
                                {formatRupiah(h.totalPrice || ((h.price||0) * h.quantity))}
                            </td>
                            <td className="px-3 py-2 align-top text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ketStyle}`}>
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