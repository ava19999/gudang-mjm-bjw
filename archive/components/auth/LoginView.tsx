// FILE: src/components/auth/LoginView.tsx
import React from 'react';
import { Car, User, KeyRound, ArrowRight } from 'lucide-react';
import { Toast } from '../common/Toast';

interface LoginViewProps {
  loginName: string;
  setLoginName: (val: string) => void;
  loginPass: string;
  setLoginPass: (val: string) => void;
  onGlobalLogin: (e: React.FormEvent) => void;
  onGuestLogin: (name: string) => void;
  toast: { msg: string; type: 'success' | 'error' } | null;
  onCloseToast: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  loginName, setLoginName, loginPass, setLoginPass,
  onGlobalLogin, onGuestLogin, toast, onCloseToast
}) => {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/10 rounded-full blur-[80px] -ml-10 -mb-10"></div>
        
        {toast && <Toast message={toast.msg} type={toast.type} onClose={onCloseToast} />}
        
        <div className="bg-gray-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700/50 relative z-10">
            <div className="relative z-10">
                <div className="flex justify-center mb-6">
                    <div className="bg-gray-700 p-4 rounded-2xl shadow-lg ring-1 ring-gray-600">
                        <Car size={40} className="text-blue-400" strokeWidth={1.5} />
                    </div>
                </div>
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-white tracking-tight mb-1">BJW</h1>
                    <p className="text-gray-300 text-lg font-bold uppercase tracking-wider mb-1">Autopart</p>
                    <p className="text-gray-500 text-sm">Sukucadang Mobil</p>
                </div>
                <form onSubmit={onGlobalLogin} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Identitas</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                            <input type="text" value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-700/50 border border-gray-600 rounded-xl focus:bg-gray-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-medium text-gray-100 placeholder:text-gray-500" placeholder="Nama Anda..." />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Kode Akses <span className="text-gray-600 font-normal">(Opsional)</span></label>
                        <div className="relative group">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                            <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-700/50 border border-gray-600 rounded-xl focus:bg-gray-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-medium text-gray-100 placeholder:text-gray-500" placeholder="Password Admin" />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group">
                        <span>Masuk Aplikasi</span>
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </form>
                <div className="mt-6 pt-6 border-t border-gray-700 flex flex-col items-center gap-3">
                    <button onClick={() => onGuestLogin('Tamu')} className="text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors py-2 px-4 hover:bg-gray-700 rounded-lg w-full text-center">Masuk sebagai Tamu</button>
                </div>
            </div>
        </div>
    </div>
  );
};