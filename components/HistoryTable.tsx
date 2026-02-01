// FILE: src/components/HistoryTable.tsx
import React from 'react';
import { StockHistory } from '../types';
import { Store, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { parseHistoryReason, formatRupiah } from '../utils/dashboardHelpers';

export interface SortConfig {
  key: string | null;
  direction: 'asc' | 'desc';
}

interface HistoryTableProps {
  data: StockHistory[];
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
}

const SortIcon = ({ columnKey, sortConfig }: { columnKey: string; sortConfig?: SortConfig }) => {
  if (!sortConfig || sortConfig.key !== columnKey) {
    return <ArrowUpDown size={12} className="ml-1 opacity-40" />;
  }
  return sortConfig.direction === 'asc' 
    ? <ArrowUp size={12} className="ml-1 text-blue-400" />
    : <ArrowDown size={12} className="ml-1 text-blue-400" />;
};

export const HistoryTable: React.FC<HistoryTableProps> = ({ data, sortConfig, onSort }) => {
  const handleHeaderClick = (key: string) => {
    if (onSort) onSort(key);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700 sticky top-0 z-10">
                <tr>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 w-24 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('timestamp')}
                    >
                      <div className="flex items-center">
                        Tanggal
                        <SortIcon columnKey="timestamp" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th className="px-3 py-2 border-r border-gray-700 w-32">Resi / Toko</th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 w-36 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('customer')}
                    >
                      <div className="flex items-center">
                        Pelanggan
                        <SortIcon columnKey="customer" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 w-32 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('partNumber')}
                    >
                      <div className="flex items-center">
                        Part No
                        <SortIcon columnKey="partNumber" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('name')}
                    >
                      <div className="flex items-center">
                        Barang
                        <SortIcon columnKey="name" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 text-right w-20 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('currentQty')}
                    >
                      <div className="flex items-center justify-end">
                        Stok
                        <SortIcon columnKey="currentQty" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 text-right w-16 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('quantity')}
                    >
                      <div className="flex items-center justify-end">
                        Qty
                        <SortIcon columnKey="quantity" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 text-right w-24 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('price')}
                    >
                      <div className="flex items-center justify-end">
                        Satuan
                        <SortIcon columnKey="price" sortConfig={sortConfig} />
                      </div>
                    </th>
                    <th 
                      className="px-3 py-2 border-r border-gray-700 text-right w-24 cursor-pointer hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleHeaderClick('totalPrice')}
                    >
                      <div className="flex items-center justify-end">
                        Total
                        <SortIcon columnKey="totalPrice" sortConfig={sortConfig} />
                      </div>
                    </th>
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
                                <div className="font-bold text-gray-200">{new Date(h.timestamp || 0).toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'2-digit'})}</div>
                                <div className="text-[9px] opacity-70 font-mono">{new Date(h.timestamp || 0).toLocaleTimeString('id-ID', {timeZone: 'Asia/Jakarta', hour:'2-digit', minute:'2-digit'})}</div>
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
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-sm text-gray-100 font-semibold">
                                {customer !== '-' ? customer : '-'}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 font-mono text-sm font-bold text-blue-300">
                                {h.partNumber}
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700">
                                <div className="font-bold text-gray-200 text-xs">{h.name}</div>
                            </td>
                            <td className="px-3 py-2 align-top border-r border-gray-700 text-right font-bold text-cyan-400">
                                {(h as any).currentQty ?? 0}
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
};