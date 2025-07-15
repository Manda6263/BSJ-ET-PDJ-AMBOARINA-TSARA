import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Edit,
  Trash2,
  Filter,
  Download,
  ArrowUpDown,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  Package,
  CheckCircle,
  X,
  Calendar,
  Zap,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
  Info
} from 'lucide-react';
import { Product, RegisterSale } from '../types';
import { format } from 'date-fns';
import { exportToExcel } from '../utils/excelUtils';
import { useViewState, useScrollPosition } from '../hooks/useViewState';
import { ProductEditModal } from './ProductEditModal';
import { StockImportModule } from './StockImportModule';
import { calculateStockFinal, clearProductSalesCache } from '../utils/calculateStockFinal';

interface StockModuleProps {
  products: Product[];
  registerSales: RegisterSale[];
  loading: boolean;
  onAddProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  onAddProducts: (products: Omit<Product, 'id'>[]) => Promise<boolean>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onDeleteProducts: (productIds: string[]) => Promise<boolean>;
  onRefreshData: () => Promise<void>;
  autoSyncProductsFromSales: () => Promise<{
    created: Product[];
    summary: string;
  }>;
}

// Memoized component for product row to prevent unnecessary re-renders
const ProductRow = React.memo(({ 
  product, 
  isSelected, 
  onSelect, 
  onEdit, 
  onDelete,
  registerSales
}: { 
  product: Product, 
  isSelected: boolean, 
  onSelect: () => void, 
  onEdit: () => void, 
  onDelete: () => void,
  registerSales: RegisterSale[]
}) => {
  // Memoize the stock calculation to avoid recalculating on every render
  const stockCalculation = useMemo(() => {
    return calculateStockFinal(product, registerSales, true);
  }, [product, registerSales]);

  const hasStockWarning = stockCalculation.hasInconsistentStock;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors duration-200 ${
        isSelected ? 'bg-cyan-500/10' : ''
      }`}
    >
      <td className="py-4 px-4">
        <button
          onClick={onSelect}
          className="text-gray-400 hover:text-cyan-400 transition-colors duration-200"
        >
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-cyan-400" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>
      </td>
      <td className="py-4 px-4 text-white font-medium">{product.name}</td>
      <td className="py-4 px-4">
        <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full text-xs font-medium">
          {product.category}
        </span>
      </td>
      <td className="py-4 px-4 text-gray-300">{formatCurrency(product.price)}</td>
      <td className="py-4 px-4 text-center">
        <div className="flex items-center justify-center">
          <span className={`font-medium ${
            product.stock === 0 ? 'text-red-400' :
            product.stock <= product.minStock ? 'text-orange-400' : 'text-green-400'
          }`}>
            {product.stock}
          </span>
          {hasStockWarning && (
            <div className="relative ml-2 group">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <div className="absolute left-0 bottom-full mb-2 w-48 bg-gray-800 text-xs text-gray-300 p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                {stockCalculation.warningMessage}
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="py-4 px-4 text-center text-gray-300">{product.minStock}</td>
      <td className="py-4 px-4 text-center text-gray-300">{product.quantitySold || 0}</td>
      <td className="py-4 px-4">
        <div className="flex space-x-2 justify-end">
          <button 
            onClick={onEdit}
            className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 
                       transition-all duration-200"
            title="Modifier le produit"
          >
            <Edit className="w-4 h-4" />
          </button>
          
          <button 
            onClick={onDelete}
            className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 
                       transition-all duration-200"
            title="Supprimer le produit"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
});

function StockModule({ 
  products, 
  registerSales, 
  loading, 
  onAddProduct, 
  onAddProducts,
  onUpdateProduct, 
  onDeleteProduct, 
  onDeleteProducts,
  onRefreshData,
  autoSyncProductsFromSales
}: StockModuleProps) {
  const { viewState, updateState, updateFilters, updateSelectedItems, updateModals } = useViewState('stock');
  useScrollPosition('stock');

  // Initialize state from viewState with stable defaults
  const [searchTerm, setSearchTerm] = useState(viewState.searchTerm || '');
  const [filterCategory, setFilterCategory] = useState(viewState.filters?.category || 'all');
  const [filterStatus, setFilterStatus] = useState(viewState.filters?.status || 'all');
  const [filterStockLevel, setFilterStockLevel] = useState(viewState.filters?.stockLevel || 'all');
  const [sortField, setSortField] = useState<keyof Product>(viewState.sortField as keyof Product || 'name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(viewState.sortDirection || 'asc');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(viewState.selectedItems || new Set());
  const [currentPage, setCurrentPage] = useState(viewState.currentPage || 1);
  const [itemsPerPage, setItemsPerPage] = useState(viewState.itemsPerPage || 50);
  const [showAddModal, setShowAddModal] = useState(viewState.modals?.addModal || false);
  const [showEditModal, setShowEditModal] = useState(viewState.modals?.editModal || false);
  const [showDeleteModal, setShowDeleteModal] = useState(viewState.modals?.deleteModal || false);
  const [showImportModal, setShowImportModal] = useState(viewState.modals?.importModal || false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'import'>(viewState.activeTab as 'list' | 'import' || 'list');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    summary?: string;
  } | null>(null);

  // Debounced state updates to prevent excessive re-renders
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateState({
        searchTerm,
        currentPage,
        itemsPerPage,
        sortField,
        sortDirection,
        activeTab,
        scrollPosition: viewState.scrollPosition
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentPage, itemsPerPage, sortField, sortDirection, activeTab]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateFilters({ category: filterCategory, status: filterStatus, stockLevel: filterStockLevel });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [filterCategory, filterStatus, filterStockLevel]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateSelectedItems(selectedProducts);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [selectedProducts]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateModals({ 
        addModal: showAddModal, 
        editModal: showEditModal, 
        deleteModal: showDeleteModal,
        importModal: showImportModal
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [showAddModal, showEditModal, showDeleteModal, showImportModal]);

  // Clear product sales cache when component mounts or when registerSales changes
  useEffect(() => {
    clearProductSalesCache();
  }, [registerSales.length]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Memoized filtered products to avoid recalculation on every render
  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (product.description || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
        
        let matchesStatus = true;
        if (filterStatus === 'out-of-stock') {
          matchesStatus = product.stock === 0;
        } else if (filterStatus === 'low-stock') {
          matchesStatus = product.stock > 0 && product.stock <= product.minStock;
        } else if (filterStatus === 'in-stock') {
          matchesStatus = product.stock > product.minStock;
        }
        
        let matchesStockLevel = true;
        if (filterStockLevel === 'critical') {
          matchesStockLevel = product.stock === 0;
        } else if (filterStockLevel === 'low') {
          matchesStockLevel = product.stock > 0 && product.stock <= product.minStock;
        } else if (filterStockLevel === 'normal') {
          matchesStockLevel = product.stock > product.minStock && product.stock <= product.minStock * 3;
        } else if (filterStockLevel === 'high') {
          matchesStockLevel = product.stock > product.minStock * 3;
        }
        
        return matchesSearch && matchesCategory && matchesStatus && matchesStockLevel;
      })
      .sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];
        
        if (sortDirection === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });
  }, [
    products, 
    searchTerm, 
    filterCategory, 
    filterStatus, 
    filterStockLevel, 
    sortField, 
    sortDirection
  ]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Memoized categories to avoid recalculation
  const categories = useMemo(() => {
    return [...new Set(products.map(p => p.category))];
  }, [products]);

  // Memoized stock statistics to avoid recalculation
  const stockStats = useMemo(() => {
    const outOfStock = products.filter(p => p.stock === 0).length;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
    const totalSold = products.reduce((sum, p) => sum + (p.quantitySold || 0), 0);
    const totalSoldValue = products.reduce((sum, p) => sum + ((p.quantitySold || 0) * p.price), 0);
    
    return {
      outOfStock,
      lowStock,
      totalStock,
      totalValue,
      totalSold,
      totalSoldValue
    };
  }, [products]);

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const exportData = filteredProducts.map(product => ({
      Name: product.name,
      Category: product.category,
      Price: product.price,
      Stock: product.stock,
      'Min Stock': product.minStock,
      'Quantity Sold': product.quantitySold || 0,
      Description: product.description || ''
    }));
    
    exportToExcel(exportData, `stock-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCategory('all');
    setFilterStatus('all');
    setFilterStockLevel('all');
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Selection handlers - memoized to prevent unnecessary re-renders
  const toggleSelectProduct = useCallback((productId: string) => {
    setSelectedProducts(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(productId)) {
        newSelected.delete(productId);
      } else {
        newSelected.add(productId);
      }
      return newSelected;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedProducts.size === paginatedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedProducts.map(product => product.id)));
    }
  }, [paginatedProducts, selectedProducts.size]);

  const selectAllFiltered = useCallback(() => {
    setSelectedProducts(new Set(filteredProducts.map(product => product.id)));
  }, [filteredProducts]);

  // Edit product handler
  const handleEditProduct = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  }, []);

  const handleSaveProduct = async (productData: Omit<Product, 'id'>) => {
    if (editingProduct) {
      await onUpdateProduct(editingProduct.id, productData);
      setShowEditModal(false);
      setEditingProduct(null);
    } else {
      await onAddProduct(productData);
      setShowAddModal(false);
    }
  };

  // Delete product handler
  const handleDeleteProduct = useCallback((product: Product) => {
    setSelectedProducts(new Set([product.id]));
    setShowDeleteModal(true);
  }, []);

  const confirmDelete = async () => {
    if (selectedProducts.size === 0) return;

    setIsDeleting(true);
    try {
      if (selectedProducts.size === 1) {
        await onDeleteProduct(Array.from(selectedProducts)[0]);
      } else {
        await onDeleteProducts(Array.from(selectedProducts));
      }
      setSelectedProducts(new Set());
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error deleting products:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSyncFromSales = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await autoSyncProductsFromSales();
      
      setSyncResult({
        success: true,
        message: `${result.created.length} produits créés avec succès`,
        summary: result.summary
      });
    } catch (error) {
      console.error('Error syncing products from sales:', error);
      setSyncResult({
        success: false,
        message: 'Erreur lors de la synchronisation des produits'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-6 h-6 border border-blue-400/30 border-t-blue-400 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gestion du Stock</h1>
          <p className="text-gray-400">Gérez votre inventaire et suivez les niveaux de stock</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={onRefreshData}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-blue-600 hover:to-blue-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Actualiser</span>
          </button>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-green-600 hover:to-green-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Ajouter</span>
          </button>
        </div>
      </div>

      {/* Sync Result Notification */}
      <AnimatePresence>
        {syncResult && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-4 rounded-xl border flex items-center justify-between ${
              syncResult.success
                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                : 'bg-red-500/20 border-red-500/30 text-red-400'
            }`}
          >
            <div className="flex items-start space-x-3 flex-1">
              {syncResult.success ? (
                <CheckCircle className="w-5 h-5 mt-1" />
              ) : (
                <AlertTriangle className="w-5 h-5 mt-1" />
              )}
              <div className="flex-1">
                <span className="font-medium">{syncResult.message}</span>
                {syncResult.summary && (
                  <div className="mt-2 bg-gray-800/50 rounded-lg p-3 max-h-60 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap">{syncResult.summary}</pre>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncResult(null)}
              className="text-gray-400 hover:text-white ml-4"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stock Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Package className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Produits</p>
              <p className="text-2xl font-bold text-white">{products.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Layers className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Stock Total</p>
              <p className="text-2xl font-bold text-white">{stockStats.totalStock}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Valeur Stock</p>
              <p className="text-xl font-bold text-white">{formatCurrency(stockStats.totalValue)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Rupture Stock</p>
              <p className="text-2xl font-bold text-white">{stockStats.outOfStock}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <TrendingDown className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Stock Faible</p>
              <p className="text-2xl font-bold text-white">{stockStats.lowStock}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <TrendingUp className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Vendu</p>
              <p className="text-2xl font-bold text-white">{stockStats.totalSold}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-3 font-medium transition-all duration-200 ${
            activeTab === 'list'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Liste des Produits
        </button>
        
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-3 font-medium transition-all duration-200 ${
            activeTab === 'import'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Import Stock
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Auto-sync from sales button */}
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl 
                           border border-blue-500/30 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-blue-500/20 rounded-xl">
                    <Zap className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Synchronisation Automatique</h3>
                    <p className="text-gray-300 text-sm">
                      Créez automatiquement des produits à partir des données de ventes. 
                      Cette fonction analyse vos ventes et crée les produits manquants dans votre stock.
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={handleSyncFromSales}
                  disabled={isSyncing || registerSales.length === 0}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold 
                             py-3 px-6 rounded-xl hover:from-blue-600 hover:to-purple-600 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center space-x-2 whitespace-nowrap"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Synchronisation...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      <span>Synchroniser depuis les Ventes</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Filtres avancés */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <Filter className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Filtres Avancés</h3>
                <button
                  onClick={clearFilters}
                  className="ml-auto text-sm text-gray-400 hover:text-white transition-colors duration-200"
                >
                  Effacer les filtres
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                               placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                             focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Toutes les catégories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                             focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="in-stock">En stock</option>
                  <option value="low-stock">Stock faible</option>
                  <option value="out-of-stock">Rupture de stock</option>
                </select>
                
                <select
                  value={filterStockLevel}
                  onChange={(e) => setFilterStockLevel(e.target.value)}
                  className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                             focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Tous les niveaux</option>
                  <option value="critical">Critique (0)</option>
                  <option value="low">Faible (&lt;= min)</option>
                  <option value="normal">Normal (&lt;= 3x min)</option>
                  <option value="high">Élevé (&gt; 3x min)</option>
                </select>
              </div>
            </motion.div>

            {/* Actions de sélection multiple */}
            {selectedProducts.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl 
                           border border-blue-500/30 rounded-2xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CheckSquare className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-medium">
                      {selectedProducts.size} produit(s) sélectionné(s)
                    </span>
                    {selectedProducts.size < filteredProducts.length && (
                      <button
                        onClick={selectAllFiltered}
                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                      >
                        Sélectionner tous les produits filtrés ({filteredProducts.length})
                      </button>
                    )}
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-500/30 
                                 transition-all duration-200 flex items-center space-x-2 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Supprimer</span>
                    </button>
                    
                    <button
                      onClick={() => setSelectedProducts(new Set())}
                      className="bg-gray-500/20 text-gray-400 px-4 py-2 rounded-lg hover:bg-gray-500/30 
                                 transition-all duration-200 text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Pagination Controls */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-4"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-4">
                  <span className="text-gray-400 text-sm">Affichage par page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm
                               focus:outline-none focus:border-cyan-500"
                  >
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-gray-400 text-sm">
                    {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} sur {filteredProducts.length}
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => goToPage(pageNum)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                              currentPage === pageNum
                                ? 'bg-cyan-500 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Tableau des produits */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">
                  Inventaire des Produits ({filteredProducts.length} résultats)
                </h3>
                
                <div className="flex space-x-3">
                  <button
                    onClick={handleExport}
                    className="bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold 
                               py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 
                               transition-all duration-200 flex items-center space-x-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exporter Excel</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-4 px-4">
                        <button
                          onClick={toggleSelectAll}
                          className="text-gray-400 hover:text-white transition-colors duration-200"
                        >
                          {selectedProducts.size === paginatedProducts.length && paginatedProducts.length > 0 ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </th>
                      {[
                        { key: 'name', label: 'Produit' },
                        { key: 'category', label: 'Catégorie' },
                        { key: 'price', label: 'Prix' },
                        { key: 'stock', label: 'Stock' },
                        { key: 'minStock', label: 'Stock Min' },
                        { key: 'quantitySold', label: 'Vendu' }
                      ].map(({ key, label }) => (
                        <th
                          key={key}
                          className="text-left py-4 px-4 text-gray-400 font-medium cursor-pointer hover:text-white
                                     transition-colors duration-200"
                          onClick={() => handleSort(key as keyof Product)}
                        >
                          <div className="flex items-center space-x-1">
                            <span>{label}</span>
                            <ArrowUpDown className="w-4 h-4" />
                          </div>
                        </th>
                      ))}
                      <th className="text-right py-4 px-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((product) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        isSelected={selectedProducts.has(product.id)}
                        onSelect={() => toggleSelectProduct(product.id)}
                        onEdit={() => handleEditProduct(product)}
                        onDelete={() => handleDeleteProduct(product)}
                        registerSales={registerSales}
                      />
                    ))}
                  </tbody>
                </table>
                
                {filteredProducts.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun produit trouvé avec les filtres actuels</p>
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
                    >
                      Effacer les filtres
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="import"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <StockImportModule
              products={products}
              onUpdateProduct={onUpdateProduct}
              onAddProduct={onAddProduct}
              onRefreshData={onRefreshData}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Product Modal */}
      {(showAddModal || showEditModal) && (
        <ProductEditModal
          product={editingProduct || undefined}
          isOpen={showAddModal || showEditModal}
          onClose={() => {
            setShowAddModal(false);
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
          isLoading={false}
          allSales={registerSales}
        />
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Produits à supprimer :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• <strong>{selectedProducts.size}</strong> produit(s) sélectionné(s)</div>
                  {selectedProducts.size === 1 && (
                    <div>• Produit : <strong>{
                      products.find(p => p.id === Array.from(selectedProducts)[0])?.name
                    }</strong></div>
                  )}
                  <div>• Les données de vente associées ne seront pas supprimées</div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Suppression...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmer la suppression</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                             hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StockModule;