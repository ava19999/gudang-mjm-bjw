// FILE: src/components/auth/LoginPage.tsx
import React, { useState } from 'react';
import { User, KeyRound, ArrowRight, ArrowLeft, Shield, UserCircle } from 'lucide-react';
import { StoreType, STORE_CONFIGS } from '../../types/store';

interface LoginPageProps {
  store: StoreType;
  onLogin: (role: 'admin' | 'guest', name: string, password?: string) => void;
  onBack: () => void;
}

const ALLOWED_ADMINS = [
  "Anan", "Agung", "A'A", "Mas Rudi", "Rifat", 
  "Taqim", "Bryan", "Tion", "Teguh", "Ikbar", "Ava", "BOS"
];

export const LoginPage: React.FC<LoginPageProps> = ({ store, onLogin, onBack }) => {
  const [mode, setMode] = useState<'guest' | 'admin'>('guest');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!store) return null;

  const storeConfig = STORE_CONFIGS[store];
  const theme = storeConfig.theme;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Nama harus diisi');
      return;
    }

    let loginName = name.trim();
    const matchedAdmin = ALLOWED_ADMINS.find(admin => admin.toLowerCase() === loginName.toLowerCase());

    // Jika user mencoba masuk sebagai Pengunjung dengan nama Admin, tolak dan arahkan ke mode Admin
    if (mode === 'guest' && matchedAdmin) {
      setError('Nama ini terdaftar sebagai Admin. Silakan masuk sebagai Admin.');
      return;
    }

    if (mode === 'admin') {
      if (!password) {
        setError('Password harus diisi untuk Admin');
        return;
      }

      if (!matchedAdmin) {
        setError('ID Admin tidak terdaftar');
        return;
      }

      const expectedPassword = matchedAdmin === 'BOS' ? 'BOS86' : `${matchedAdmin}1`;
      const inputPassword = password.trim();

      // Validasi password: case-insensitive (huruf besar/kecil tidak masalah)
      if (inputPassword !== expectedPassword && inputPassword.toLowerCase() !== expectedPassword.toLowerCase()) {
        setError('Password salah');
        return;
      }

      loginName = matchedAdmin;
    }

    onLogin(mode, loginName, password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 font-sans relative overflow-hidden animate-in fade-in slide-in-from-right duration-500">
      {/* Background Effects - Store themed */}
      <div className={`absolute top-0 right-0 w-96 h-96 bg-${theme.primary}/10 rounded-full blur-[120px] animate-pulse`}></div>
      <div className={`absolute bottom-0 left-0 w-96 h-96 bg-${theme.secondary}/10 rounded-full blur-[120px] animate-pulse delay-75`}></div>

      <div className="bg-gray-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border-2 border-gray-700/50 relative z-10">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 p-2 rounded-xl bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-all group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        </button>

        <div className="relative z-10 pt-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className={`bg-gray-700/50 p-4 rounded-2xl shadow-lg ring-2 ring-${theme.primary}/30 border border-${theme.primary}/20`}>
              <img 
                src={storeConfig.logo} 
                alt={storeConfig.fullName}
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  // Fallback if image fails to load - use textContent instead of innerHTML
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallbackText = document.createElement('span');
                    fallbackText.className = `text-3xl font-bold text-${theme.primary}`;
                    fallbackText.textContent = storeConfig.name;
                    parent.appendChild(fallbackText);
                  }
                }}
              />
            </div>
          </div>

          {/* Store Title */}
          <div className="text-center mb-8">
            <h1 className={`text-4xl font-extrabold text-${theme.primary} tracking-tight mb-1`}>
              {storeConfig.name}
            </h1>
            <p className="text-gray-300 text-lg font-bold uppercase tracking-wider mb-1">
              Autopart
            </p>
            <p className="text-gray-500 text-sm">Sukucadang Mobil</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-700/50 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('guest');
                setPassword('');
                setError('');
              }}
              className={`
                flex-1 py-3 rounded-lg font-semibold transition-all duration-300
                flex items-center justify-center gap-2
                ${mode === 'guest' 
                  ? `bg-${theme.primary} text-gray-900 shadow-lg shadow-${theme.glow}` 
                  : 'text-gray-400 hover:text-gray-300'
                }
              `}
            >
              <UserCircle size={20} />
              Pengunjung
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('admin');
                setError('');
              }}
              className={`
                flex-1 py-3 rounded-lg font-semibold transition-all duration-300
                flex items-center justify-center gap-2
                ${mode === 'admin' 
                  ? `bg-${theme.primary} text-gray-900 shadow-lg shadow-${theme.glow}` 
                  : 'text-gray-400 hover:text-gray-300'
                }
              `}
            >
              <Shield size={20} />
              Admin
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                {mode === 'admin' ? 'Nama Admin' : 'Nama Anda'}
              </label>
              <div className="relative group">
                <User 
                  className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-${theme.primary} transition-colors`} 
                  size={20} 
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`
                    w-full pl-12 pr-4 py-3.5 
                    bg-gray-700/50 border border-gray-600 rounded-xl 
                    focus:bg-gray-700 focus:border-${theme.primary} focus:ring-4 focus:ring-${theme.primary}/20 
                    outline-none transition-all font-medium text-gray-100 
                    placeholder:text-gray-500
                  `}
                  placeholder={mode === 'admin' ? 'Masukkan nama admin...' : 'Masukkan nama Anda...'}
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input - Only for Admin */}
            {mode === 'admin' && (
              <div className="space-y-1.5 animate-in slide-in-from-top duration-300">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                  Password
                </label>
                <div className="relative group">
                  <KeyRound 
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-${theme.primary} transition-colors`} 
                    size={20} 
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`
                      w-full pl-12 pr-4 py-3.5 
                      bg-gray-700/50 border border-gray-600 rounded-xl 
                      focus:bg-gray-700 focus:border-${theme.primary} focus:ring-4 focus:ring-${theme.primary}/20 
                      outline-none transition-all font-medium text-gray-100 
                      placeholder:text-gray-500
                    `}
                    placeholder="Masukkan password..."
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 animate-in slide-in-from-top duration-300">
                <p className="text-red-400 text-sm text-center font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className={`
                w-full bg-${theme.primary} hover:bg-${theme.hover} 
                text-gray-900 font-bold py-4 rounded-xl 
                shadow-lg shadow-${theme.glow} hover:shadow-xl hover:shadow-${theme.glow}
                transition-all active:scale-[0.98] 
                flex items-center justify-center gap-2 group
              `}
            >
              <span>Masuk {mode === 'admin' ? 'sebagai Admin' : 'sebagai Pengunjung'}</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-gray-700 text-center">
            <p className="text-xs text-gray-500">
              {mode === 'admin' 
                ? 'Mode Admin: Akses penuh ke semua fitur'
                : 'Mode Pengunjung: Akses terbatas untuk melihat katalog'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
