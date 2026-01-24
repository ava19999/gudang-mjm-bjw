// FILE: src/App.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router } from 'react-router-dom';
import { CloudLightning } from 'lucide-react';

// --- COMPONENTS ---
import { Dashboard } from './components/Dashboard';
import { ItemForm } from './components/ItemForm';
import { ShopView } from './components/ShopView';
import { OrderManagement } from './components/OrderManagement';
import { CustomerOrderView } from './components/CustomerOrderView';
import { QuickInputView } from './components/QuickInputView';
import { PettyCashView } from './components/finance/PettyCashView';
import { BarangKosongView } from './components/finance/BarangKosongView';
import { ClosingView } from './components/finance/ClosingView';
import { DataAgungView } from './components/online/DataAgungView';
import { ScanResiStage1 } from './components/scanResi/ScanResiStage1';
import { ScanResiStage2 } from './components/scanResi/ScanResiStage2';
import { ScanResiStage3 } from './components/scanResi/ScanResiStage3';
import { RiwayatScanResi } from './components/scanResi/RiwayatScanResi';

// --- NEW SPLIT COMPONENTS ---
import { Toast } from './components/common/Toast';
import { FloatingQuickAccess } from './components/common/FloatingQuickAccess';
import { StoreSelector } from './components/auth/StoreSelector';
import { LoginPage } from './components/auth/LoginPage';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { ActiveView } from './types/ui';

// --- CONTEXT ---
import { StoreProvider, useStore } from './context/StoreContext';

// --- TYPES & SERVICES ---
import { InventoryItem, InventoryFormData, CartItem, Order, StockHistory, OrderStatus } from './types';
import { 
  fetchInventory, addInventory, updateInventory, deleteInventory, getItemByPartNumber, 
  fetchHistory, addBarangMasuk, addBarangKeluar,
  saveOfflineOrder
} from './services/supabaseService';
import { generateId } from './utils';

const CUSTOMER_ID_KEY = 'stockmaster_my_customer_id';
const BANNER_PART_NUMBER = 'SYSTEM-BANNER-PROMO';

const AppContent: React.FC = () => {
  // --- STORE CONTEXT ---
  const { selectedStore, userRole, userName, setStore, setUserRole, setUserName, logout: logoutStore, getStoreConfig } = useStore();
  
  // --- STATE ---
  const isAuthenticated = selectedStore !== null && userRole !== null;
  const isAdmin = userRole === 'admin';
  const loginName = userName;
  const currentStoreConfig = getStoreConfig();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [loading, setLoading] = useState(false); 
  const [activeView, setActiveView] = useState<ActiveView>('inventory'); 
  
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [myCustomerId, setMyCustomerId] = useState<string>('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => setToast({msg, type});

  const isKingFano = useMemo(() => loginName.trim().toLowerCase() === 'king fano', [loginName]);

  // --- EFFECTS ---
  useEffect(() => {
    let cId = localStorage.getItem(CUSTOMER_ID_KEY);
    if (!cId) { cId = 'cust-' + generateId(); localStorage.setItem(CUSTOMER_ID_KEY, cId); }
    setMyCustomerId(cId);
    
    if (isAuthenticated) {
      refreshData();
    }
  }, [isAuthenticated]);

  const refreshData = async () => {
    setLoading(true);
    try {
        const inventoryData = await fetchInventory(selectedStore);
        const bannerItem = inventoryData.find(i => i.partNumber === BANNER_PART_NUMBER);
        if (bannerItem) setBannerUrl(bannerItem.imageUrl);
        setItems(inventoryData.filter(i => i.partNumber !== BANNER_PART_NUMBER));

        const historyData = await fetchHistory();
        setHistory(historyData);
        setRefreshTrigger(prev => prev + 1);

    } catch (e) { console.error("Gagal memuat data:", e); showToast("Gagal sinkronisasi data", 'error'); }
    setLoading(false);
  };

  // --- HANDLERS AUTH ---
  const handleSelectStore = (store: 'mjm' | 'bjw') => {
    setStore(store);
  };

  const handleLogin = (role: 'admin' | 'guest', name: string) => {
    setUserRole(role);
    setUserName(name);
    if (role === 'admin') {
      setActiveView('inventory');
    } else {
      setActiveView('shop');
    }
    showToast(`Selamat Datang di ${selectedStore?.toUpperCase()}, ${name}!`);
    refreshData();
  };

  const handleBackToStoreSelection = () => {
    setStore(null);
    setUserRole(null);
    setUserName('');
  };

  const handleLogout = () => { 
    logoutStore(); 
    setActiveView('inventory');
  };

  // --- HANDLERS DATA ---
  const handleSaveItem = async (data: InventoryFormData) => {
      setLoading(true);
      const newQuantity = Number(data.quantity) || 0;
      let updatedItem: InventoryItem = { ...editItem, ...data, quantity: newQuantity, initialStock: data.initialStock || 0, qtyIn: data.qtyIn || 0, qtyOut: data.qtyOut || 0, lastUpdated: Date.now() };

      if (editItem) {
          if (await updateInventory(updatedItem)) { showToast('Update berhasil!'); refreshData(); }
      } else {
          if (items.some(i => i.partNumber === data.partNumber)) { showToast('Part Number sudah ada!', 'error'); setLoading(false); return; }
          if (await addInventory(data)) { showToast('Tersimpan!'); refreshData(); }
      }
      setIsEditing(false); setEditItem(null); setLoading(false);
  };

  const handleUpdateBanner = async (base64: string) => {
      const existingItem = await getItemByPartNumber(BANNER_PART_NUMBER, selectedStore);

      const bannerData: any = { 
          partNumber: BANNER_PART_NUMBER, 
          name: 'SYSTEM BANNER PROMO', 
          application: 'DO NOT DELETE', 
          brand: 'SYS', 
          price: 0, 
          costPrice: 0, 
          ecommerce: '', 
          quantity: 0, 
          initialStock: 0, 
          qtyIn: 0, 
          qtyOut: 0, 
          shelf: 'SYSTEM', 
          imageUrl: base64 
      };

      let success = false;
      if (existingItem) {
          const updateData = { ...bannerData, id: existingItem.id };
          const result = await updateInventory(updateData, undefined, selectedStore);
          success = !!result;
      } else {
          const result = await addInventory(bannerData, selectedStore);
          success = !!result;
      }

      if (success) { 
          setBannerUrl(base64); 
          showToast('Banner diperbarui!'); 
      } else { 
          showToast('Gagal update banner', 'error'); 
      }
  };
  
  const handleDelete = async (id: string) => {
      // Hanya Bryan dan Ava yang bisa hapus barang
      const allowedToDelete = ['Bryan', 'Ava'];
      const canDelete = allowedToDelete.some(name => name.toLowerCase() === userName.toLowerCase());
      
      if (!canDelete) {
          showToast('Anda tidak memiliki akses untuk menghapus barang', 'error');
          return;
      }
      
      if(confirm('Hapus Barang Permanen?')) {
          setLoading(true);
          if (await deleteInventory(id, selectedStore)) { showToast('Dihapus'); refreshData(); }
          setLoading(false);
      }
  }

  // --- HANDLERS ORDER ---
  const addToCart = (item: InventoryItem) => {
      setCart(prev => {
          const ex = prev.find(c => c.id === item.id);
          return ex ? prev.map(c => c.id === item.id ? {...c, cartQuantity: c.cartQuantity + 1} : c) : [...prev, {...item, cartQuantity: 1}];
      });
      showToast('Masuk keranjang');
  };

  const updateCartItem = (itemId: string, changes: Partial<CartItem>) => {
      setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...changes } : item));
  };

  // --- NEW CHECKOUT LOGIC (MENGGUNAKAN saveOfflineOrder) ---
  const doCheckout = async (orderData: any) => {
      // 1. Ambil Data
      let customerName = '';
      let tempo = 'CASH';
      let note = '';

      if (typeof orderData === 'string') {
          customerName = orderData;
      } else {
          customerName = orderData.customerName;
          tempo = orderData.tempo || 'CASH';
          note = orderData.note || '';
      }

      // Gabungkan Note ke Nama jika perlu (opsional)
      const finalCustomerName = note ? `${customerName} (${note})` : customerName;

      // Update username di state jika guest
      if (customerName !== userName && !isAdmin) { 
        setUserName(customerName); 
      }

      if (cart.length === 0) return;

      setLoading(true);
      try {
          // 2. SIMPAN KE TABLE ORDERS_MJM / ORDERS_BJW
          // Stok BELUM dipotong disini, menunggu ACC dari Admin nanti
          const success = await saveOfflineOrder(
              cart, 
              finalCustomerName, 
              tempo, 
              selectedStore
          );

          if (success) {
              showToast(`Order dibuat! Status: Belum Diproses. Tempo: ${tempo}`, 'success');
              setCart([]); 
              setActiveView('shop'); // Tetap di shop agar bisa order lagi atau pindah view
              await refreshData();
          } else {
              showToast('Gagal membuat pesanan (Database Error)', 'error');
          }
      } catch (error: any) {
          console.error("Checkout Error:", error);
          showToast(`Gagal: ${error.message}`, 'error');
      } finally {
          setLoading(false);
      }
  };

  // --- RETUR LOGIC (UPDATE STOK) ---
  const handleProcessReturn = async (orderId: string, returnedItems: { itemId: string, qty: number }[]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      setLoading(true);
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());
      let pureName = order.customerName;
      let resiVal = '-'; let shopVal = ''; let ecommerceVal = 'APLIKASI';

      const resiMatch = pureName.match(/\(Resi: (.*?)\)/); if (resiMatch) { resiVal = resiMatch[1]; pureName = pureName.replace(/\(Resi:.*?\)/, ''); }
      const shopMatch = pureName.match(/\(Toko: (.*?)\)/); if (shopMatch) { shopVal = shopMatch[1]; pureName = pureName.replace(/\(Toko:.*?\)/, ''); }
      const viaMatch = pureName.match(/\(Via: (.*?)\)/); if (viaMatch) { ecommerceVal = viaMatch[1]; pureName = pureName.replace(/\(Via:.*?\)/, ''); }
      pureName = pureName.trim() || "Pelanggan";

      for (const retur of returnedItems) {
          const itemInOrder = order.items.find(i => i.id === retur.itemId);
          if (!itemInOrder) continue;
          const currentItem = await getItemByPartNumber(itemInOrder.partNumber, selectedStore);
          if (currentItem) {
              const restoreQty = retur.qty;
              const newQuantity = currentItem.quantity + restoreQty;
              const itemToUpdate = { ...currentItem, qtyOut: Math.max(0, (currentItem.qtyOut || 0) - restoreQty), quantity: newQuantity, lastUpdated: Date.now() };
              await updateInventory(itemToUpdate, undefined, selectedStore);
              await addBarangMasuk({ tanggal: today, tempo: `${resiVal} / ${shopVal}`, ecommerce: ecommerceVal, keterangan: `${pureName} (RETUR)`, partNumber: itemToUpdate.partNumber, name: itemToUpdate.name, brand: itemToUpdate.brand, application: itemToUpdate.application, rak: itemToUpdate.shelf, stockAhir: newQuantity, qtyMasuk: restoreQty, hargaSatuan: itemInOrder.customPrice ?? itemInOrder.price, hargaTotal: (itemInOrder.customPrice ?? itemInOrder.price) * restoreQty });
          }
      }

      const newItems = order.items.map(item => {
          const returInfo = returnedItems.find(r => r.itemId === item.id);
          if (returInfo) return { ...item, cartQuantity: item.cartQuantity - returInfo.qty };
          return item;
      }).filter(item => item.cartQuantity > 0); 

      const newTotal = newItems.reduce((sum, item) => sum + ((item.customPrice ?? item.price) * item.cartQuantity), 0);
      const newStatus = newItems.length === 0 ? 'cancelled' : 'completed';

      if (await updateOrderData(orderId, newItems, newTotal, newStatus)) { showToast('Retur berhasil diproses & Stok kembali!'); await refreshData(); } 
      else { showToast('Gagal update data pesanan', 'error'); }
      setLoading(false);
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      
      let pureName = order.customerName; let resiVal = '-'; let shopVal = ''; let ecommerceVal = 'APLIKASI';
      const resiMatch = pureName.match(/\(Resi: (.*?)\)/); if (resiMatch) { resiVal = resiMatch[1]; pureName = pureName.replace(/\(Resi:.*?\)/, ''); }
      const shopMatch = pureName.match(/\(Toko: (.*?)\)/); if (shopMatch) { shopVal = shopMatch[1]; pureName = pureName.replace(/\(Toko:.*?\)/, ''); }
      const viaMatch = pureName.match(/\(Via: (.*?)\)/); if (viaMatch) { ecommerceVal = viaMatch[1]; pureName = pureName.replace(/\(Via:.*?\)/, ''); }
      pureName = pureName.trim() || "Pelanggan";
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());
      let updateTime = (newStatus === 'completed' || newStatus === 'cancelled') ? Date.now() : undefined;

      if (order.status === 'pending' && newStatus === 'processing') {
          if (await updateOrderStatusService(orderId, newStatus)) { 
              for (const orderItem of order.items) {
                  const currentItem = await getItemByPartNumber(orderItem.partNumber, selectedStore);
                  if (currentItem) {
                      const qtySold = orderItem.cartQuantity;
                      const newQuantity = Math.max(0, currentItem.quantity - qtySold);
                      const itemToUpdate = { ...currentItem, qtyOut: (currentItem.qtyOut || 0) + qtySold, quantity: newQuantity, lastUpdated: Date.now() };
                      await updateInventory(itemToUpdate, undefined, selectedStore);
                      await addBarangKeluar({ tanggal: today, kodeToko: 'APP', tempo: shopVal, ecommerce: ecommerceVal, customer: pureName, partNumber: currentItem.partNumber, name: currentItem.name, brand: currentItem.brand, application: currentItem.application, rak: currentItem.shelf, stockAhir: newQuantity, qtyKeluar: qtySold, hargaSatuan: orderItem.customPrice ?? orderItem.price, hargaTotal: (orderItem.customPrice ?? orderItem.price) * qtySold, resi: resiVal });
                  }
              }
              showToast('Pesanan diproses, stok berkurang.'); refreshData();
          }
      }
      else if (newStatus === 'cancelled' && order.status !== 'cancelled') {
          if (await updateOrderStatusService(orderId, newStatus, updateTime)) {
              if (order.status !== 'pending') {
                  for (const orderItem of order.items) {
                      const currentItem = await getItemByPartNumber(orderItem.partNumber, selectedStore);
                      if (currentItem) {
                          const restoreQty = orderItem.cartQuantity;
                          const newQuantity = currentItem.quantity + restoreQty;
                          const itemToUpdate = { ...currentItem, qtyOut: Math.max(0, (currentItem.qtyOut || 0) - restoreQty), quantity: newQuantity, lastUpdated: Date.now() };
                          await updateInventory(itemToUpdate, undefined, selectedStore);
                          await addBarangMasuk({ tanggal: today, tempo: `${resiVal} / ${shopVal}`, ecommerce: ecommerceVal, keterangan: `${pureName} (RETUR FULL)`, partNumber: itemToUpdate.partNumber, name: itemToUpdate.name, brand: itemToUpdate.brand, application: itemToUpdate.application, rak: itemToUpdate.shelf, stockAhir: newQuantity, qtyMasuk: restoreQty, hargaSatuan: orderItem.customPrice ?? orderItem.price, hargaTotal: (orderItem.customPrice ?? orderItem.price) * restoreQty });
                      }
                  }
                  showToast('Pesanan dibatalkan sepenuhnya.');
              } else { showToast('Pesanan ditolak (Stok belum dipotong).'); }
              refreshData();
          }
      }
      else {
          if (await updateOrderStatusService(orderId, newStatus, updateTime)) refreshData();
      }
  };

  // --- RENDERING ---
  if (loading && items.length === 0) return <div className="flex flex-col h-screen items-center justify-center bg-gray-900 font-sans text-gray-400 space-y-6"><div className="relative"><div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><CloudLightning size={20} className="text-blue-500 animate-pulse" /></div></div><div className="text-center space-y-1"><p className="font-medium text-gray-200">Menghubungkan Database</p><p className="text-xs">Memuat Data...</p></div></div>;

  if (!selectedStore) {
    return <StoreSelector onSelectStore={handleSelectStore} />;
  }

  if (!isAuthenticated || !userRole) {
      return (
        <LoginPage 
          store={selectedStore} 
          onLogin={handleLogin} 
          onBack={handleBackToStoreSelection} 
        />
      );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col font-sans text-gray-100">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      {currentStoreConfig && (
        <Header 
          isAdmin={isAdmin} 
          activeView={activeView} 
          setActiveView={setActiveView} 
          loading={loading} 
          onRefresh={() => { refreshData(); showToast('Data diperbarui'); }} 
          loginName={loginName} 
          onLogout={handleLogout}
          storeConfig={currentStoreConfig}
        />
      )}

      <div className="flex-1 overflow-y-auto bg-gray-900">
        {activeView === 'shop' && <ShopView items={items} cart={cart} isAdmin={isAdmin} isKingFano={isKingFano} bannerUrl={bannerUrl} onAddToCart={addToCart} onRemoveFromCart={(id) => setCart(prev => prev.filter(c => c.id !== id))} onUpdateCartItem={updateCartItem} onCheckout={doCheckout} onUpdateBanner={handleUpdateBanner} />}
        {activeView === 'inventory' && isAdmin && <Dashboard items={items} orders={[]} history={history} refreshTrigger={refreshTrigger} onViewOrders={() => setActiveView('orders')} onAddNew={() => { setEditItem(null); setIsEditing(true); }} onEdit={(item) => { setEditItem(item); setIsEditing(true); }} onDelete={handleDelete} canDelete={['Bryan', 'Ava'].some(name => name.toLowerCase() === userName.toLowerCase())} />}
        {activeView === 'quick_input' && isAdmin && <QuickInputView items={items} onRefresh={refreshData} showToast={showToast} />}
        {activeView === 'petty_cash' && isAdmin && <PettyCashView />}
        {activeView === 'barang_kosong' && isAdmin && <BarangKosongView />}
        {activeView === 'closing' && isAdmin && <ClosingView />}
        {activeView === 'data_agung' && isAdmin && <DataAgungView items={items} onRefresh={refreshData} showToast={showToast} />}
        {activeView === 'scan_resi_stage1' && isAdmin && <ScanResiStage1 onRefresh={refreshData} />}
        {activeView === 'scan_resi_stage2' && isAdmin && <ScanResiStage2 onRefresh={refreshData} />}
        {activeView === 'scan_resi_stage3' && isAdmin && <ScanResiStage3 onRefresh={refreshData} />}
        {activeView === 'scan_resi_history' && isAdmin && <RiwayatScanResi />}
        {activeView === 'orders' && isAdmin && <OrderManagement />}
        {activeView === 'orders' && !isAdmin && <CustomerOrderView orders={[]} />}
        
        {isEditing && isAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
                <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                    <ItemForm initialData={editItem || undefined} onCancel={() => { setIsEditing(false); setEditItem(null); }} onSuccess={(item) => { handleSaveItem(item as any); }} />
                </div>
            </div>
        )}
      </div>

      <MobileNav isAdmin={isAdmin} activeView={activeView} setActiveView={setActiveView} pendingOrdersCount={0} myPendingOrdersCount={0} />
      
      {/* Floating Quick Access Widget */}
      {isAdmin && (
        <FloatingQuickAccess 
          onAddNew={() => { setEditItem(null); setIsEditing(true); }}
          onViewItem={(item) => { setEditItem(item); setIsEditing(true); }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

const App = () => (
  <Router>
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  </Router>
);
export default App;