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
  Calendar,
  DollarSign,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  AlertTriangle,
  RefreshCw,
  Package,
  TrendingUp,
  TrendingDown,
  X,
  Upload,
  Eye,
  EyeOff,
  Zap,
  BarChart3,
  Info,
  Clock,
  Hash,
  Tag,
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Product, RegisterSale } from '../types';
import { format } from 'date-fns';
import { exportToExcel } from '../utils/excelUtils';
import { useViewState, useScrollPosition } from '../hooks/useViewState';
import { ProductEditModal } from './ProductEditModal';
import { StockImportModule } from './StockImportModule';
import { calculateStockFinal, validateStockConfiguration, formatStockDate } from '../utils/calculateStockFinal';

interface StockModuleProps {
  products: Product[];
  registerSales: RegisterSale[];
  loading: boolean;
  onAddProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  onAddProducts: (products: Omit<Product, 'id'>[]) => Promise<boolean>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onDeleteProducts: (productIds: string[]) => Promise<boolean>;
  onRefreshData: () => void;
  autoSyncProductsFromSales: () => Promise<{
    created: Product[];
    summary: string;
  }>;
}

interface StockCalculationCache {
  finalStock: number;
  validSales: RegisterSale[];
  ignoredSales: RegisterSale[];
  hasInconsistentStock: boolean;
  warningMessage?: string;
}

export default function StockModule({
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

  // Performance optimization: Strict pagination with 30 items per page
  const ITEMS_PER_PAGE = 30;
  const LARGE_DATASET_THRESHOLD = 50;

  // Initialize state from viewState with performance-optimized defaults
  const [searchTerm, setSearchTerm] = useState(viewState.searchTerm || '');
  const [filterCategory, setFilterCategory] = useState(viewState.filters?.category || 'all');
  const [filterStatus, setFilterStatus] = useState(viewState.filters?.status || 'all');
  const [filterStockLevel, setFilterStockLevel] = useState(viewState.filters?.stockLevel || 'all');
  const [sortField, setSortField] = useState<keyof Product>(viewState.sortField as keyof Product || 'name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(viewState.sortDirection || 'asc');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(viewState.selectedItems || new Set());
  const [currentPage, setCurrentPage] = useState(viewState.currentPage || 1);
  const [itemsPerPage] = useState(ITEMS_PER_PAGE); // Fixed to 30 for performance
  const [activeTab, setActiveTab] = useState(viewState.activeTab || 'list');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(viewState.modals?.addModal || false);
  const [showEditModal, setShowEditModal] = useState(viewState.modals?.editModal || false);
  const [showDeleteModal, setShowDeleteModal] = useState(viewState.modals?.deleteModal || false);
  const [showImportModal, setShowImportModal] = useState(viewState.modals?.importModal || false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Loading states
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Performance states
  const [renderedProducts, setRenderedProducts] = useState<Product[]>([]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);

  // Performance optimization: Memoized sales filtering
  const memoizedRegisterSales = useMemo(() => {
    return registerSales;
  }, [registerSales]);

  // Performance optimization: Stock calculation cache using Map
  const stockCalculationCache = useMemo(() => {
    const cache = new Map<string, StockCalculationCache>();
    
    products.forEach(product => {
      const calculation = calculateStockFinal(product, memoizedRegisterSales);
      cache.set(product.id, calculation);
    });
    
    return cache;
  }, [products, memoizedRegisterSales]);

  // Performance optimization: Check if we should disable animations
  const shouldDisableAnimations = products.length > LARGE_DATASET_THRESHOLD;

  // Debounced state updates to prevent excessive re-renders
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateState({
        searchTerm,
        currentPage,
        sortField,
        sortDirection,
        activeTab
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentPage, sortField, sortDirection, activeTab]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateFilters({ 
        category: filterCategory, 
        status: filterStatus, 
        stockLevel: filterStockLevel 
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filterCategory, filterStatus, filterStockLevel]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateSelectedItems(selectedProducts);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [selectedProducts]);

  useEffect(() => {
    updateModals({ 
      addModal: showAddModal, 
      editModal: showEditModal, 
      deleteModal: showDeleteModal,
      importModal: showImportModal
    });
  }, [showAddModal, showEditModal, showDeleteModal, showImportModal]);

  // Performance optimization: Memoized filtered and sorted products
  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const stockCalculation = stockCalculationCache.get(product.id);
      const finalStock = stockCalculation?.finalStock ?? product.stock;
      
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'in-stock' && finalStock > 0) ||
        (filterStatus === 'out-of-stock' && finalStock === 0) ||
        (filterStatus === 'low-stock' && finalStock > 0 && finalStock <= product.minStock);
      
      const matchesStockLevel = filterStockLevel === 'all' ||
        (filterStockLevel === 'high' && finalStock > product.minStock * 2) ||
        (filterStockLevel === 'normal' && finalStock > product.minStock && finalStock <= product.minStock * 2) ||
        (filterStockLevel === 'low' && finalStock > 0 && finalStock <= product.minStock) ||
        (filterStockLevel === 'empty' && finalStock === 0);
      
      return matchesSearch && matchesCategory && matchesStatus && matchesStockLevel;
    });

    // Sort products
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      // Use cached stock values for sorting
      if (sortField === 'stock') {
        const aCalculation = stockCalculationCache.get(a.id);
        const bCalculation = stockCalculationCache.get(b.id);
        aValue = aCalculation?.finalStock ?? a.stock;
        bValue = bCalculation?.finalStock ?? b.stock;
      }
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [products, stockCalculationCache, searchTerm, filterCategory, filterStatus, filterStockLevel, sortField, sortDirection]);

  // Performance optimization: Pagination
  const totalPages = Math.ceil(filteredAndSortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredAndSortedProducts.slice(startIndex, endIndex);

  // Performance optimization: Lazy rendering implementation
  useEffect(() => {
    if (paginatedProducts.length <= ITEMS_PER_PAGE) {
      setRenderedProducts(paginatedProducts);
      return;
    }

    setIsLazyLoading(true);
    
    // Immediately render first 30 products
    setRenderedProducts(paginatedProducts.slice(0, ITEMS_PER_PAGE));
    
    // Gradually load the rest
    const loadRemainingProducts = () => {
      setTimeout(() => {
        setRenderedProducts(paginatedProducts);
        setIsLazyLoading(false);
      }, 100);
    };

    loadRemainingProducts();
  }, [paginatedProducts]);

  const categories = [...new Set(products.map(p => p.category))];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const handleExport = () => {
    const exportData = filteredAndSortedProducts.map(product => {
      const stockCalculation = stockCalculationCache.get(product.id);
      const finalStock = stockCalculation?.finalStock ?? product.stock;
      
      return {
        Nom: product.name,
        Catégorie: product.category,
        Prix: product.price,
        'Stock Final': finalStock,
        'Stock Initial': product.initialStock || 0,
        'Quantité Vendue': product.quantitySold || 0,
        'Stock Minimum': product.minStock,
        Description: product.description || ''
      };
    });
    
    exportToExcel(exportData, `stock-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCategory('all');
    setFilterStatus('all');
    setFilterStockLevel('all');
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Selection handlers
  const toggleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === renderedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(renderedProducts.map(product => product.id)));
    }
  };

  const selectAllFiltered = () => {
    setSelectedProducts(new Set(filteredAndSortedProducts.map(product => product.id)));
  };

  // Product handlers
  const handleAddProduct = () => {
    setEditingProduct(null);
    setShowAddModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  const handleSaveProduct = async (productData: Omit<Product, 'id'>) => {
    setIsUpdating(true);
    try {
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, productData);
        setShowEditModal(false);
      } else {
        await onAddProduct(productData);
        setShowAddModal(false);
      }
      setEditingProduct(null);
      onRefreshData();
    } catch (error) {
      console.error('Error saving product:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProducts = () => {
    if (selectedProducts.size === 0) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (selectedProducts.size === 0) return;

    setIsDeleting(true);
    try {
      if (selectedProducts.size === 1) {
        const productId = Array.from(selectedProducts)[0];
        await onDeleteProduct(productId);
      } else {
        await onDeleteProducts(Array.from(selectedProducts));
      }
      setSelectedProducts(new Set());
      setShowDeleteModal(false);
      onRefreshData();
    } catch (error) {
      console.error('Error deleting products:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAutoSync = async () => {
    setIsSyncing(true);
    try {
      const result = await autoSyncProductsFromSales();
      alert(`Synchronisation terminée !\n\n${result.summary}`);
      onRefreshData();
    } catch (error) {
      console.error('Error syncing products:', error);
      alert('Erreur lors de la synchronisation automatique');
    } finally {
      setIsSyncing(false);
    }
  };

  // Performance optimization: Memoized statistics
  const stockStats = useMemo(() => {
    const totalProducts = products.length;
    let totalStock = 0;
    let totalValue = 0;
    let outOfStock = 0;
    let lowStock = 0;

    products.forEach(product => {
      const stockCalculation = stockCalculationCache.get(product.id);
      const finalStock = stockCalculation?.finalStock ?? product.stock;
      
      totalStock += finalStock;
      totalValue += finalStock * product.price;
      
      if (finalStock === 0) {
        outOfStock++;
      } else if (finalStock <= product.minStock) {
        lowStock++;
      }
    });

    return {
      totalProducts,
      totalStock,
      totalValue,
      outOfStock,
      lowStock,
      filteredCount: filteredAndSortedProducts.length
    };
  }, [products, stockCalculationCache, filteredAndSortedProducts.length]);

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

  const TableRow = shouldDisableAnimations ? 'tr' : motion.tr;
  const TableRowProps = shouldDisableAnimations ? {} : {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.2 }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gestion du Stock</h1>
          <p className="text-gray-400">
            Gérez votre inventaire et suivez vos niveaux de stock
            {products.length > LARGE_DATASET_THRESHOLD && (
              <span className="ml-2 text-yellow-400 text-sm">
                <Zap className="w-4 h-4 inline mr-1" />
                Mode performance activé ({products.length} produits)
              </span>
            )}
          </p>
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
            onClick={handleAutoSync}
            disabled={isSyncing}
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-purple-600 hover:to-purple-700 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 flex items-center space-x-2"
          >
            {isSyncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
            <span>{isSyncing ? 'Synchronisation...' : 'Sync Auto'}</span>
          </button>
          
          <button
            onClick={handleExport}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-green-600 hover:to-green-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Exporter</span>
          </button>
          
          <button
            onClick={handleAddProduct}
            className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-cyan-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Ajouter</span>
          </button>
        </div>
      </div>

      {/* Performance-optimized Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <Package className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-gray-400 text-sm">Produits</p>
              <p className="text-2xl font-bold text-white">{stockStats.totalProducts}</p>
            </div>
          </div>
          <p className="text-blue-400 text-xs mt-1">
            {stockStats.filteredCount !== stockStats.totalProducts && 
              `${stockStats.filteredCount} filtrés`
            }
          </p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-gray-400 text-sm">Stock Total</p>
              <p className="text-2xl font-bold text-white">{stockStats.totalStock.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-xs mt-1">Unités en stock</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <DollarSign className="w-8 h-8 text-purple-400" />
            <div>
              <p className="text-gray-400 text-sm">Valeur Stock</p>
              <p className="text-xl font-bold text-white">{formatCurrency(stockStats.totalValue)}</p>
            </div>
          </div>
          <p className="text-purple-400 text-xs mt-1">Valeur totale</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
            <div>
              <p className="text-gray-400 text-sm">Stock Faible</p>
              <p className="text-2xl font-bold text-white">{stockStats.lowStock}</p>
            </div>
          </div>
          <p className="text-orange-400 text-xs mt-1">Alertes actives</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <TrendingDown className="w-8 h-8 text-red-400" />
            <div>
              <p className="text-gray-400 text-sm">Ruptures</p>
              <p className="text-2xl font-bold text-white">{stockStats.outOfStock}</p>
            </div>
          </div>
          <p className="text-red-400 text-xs mt-1">Stock épuisé</p>
        </motion.div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-6">
        <div className="flex space-x-2 mb-6">
          {[
            { id: 'list', label: 'Liste des Produits', icon: Package },
            { id: 'import', label: 'Import Stock', icon: Upload }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                activeTab === id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'list' && (
          <>
            {/* Selection Actions */}
            {selectedProducts.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 backdrop-blur-xl 
                           border border-cyan-500/30 rounded-2xl p-4 mb-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CheckSquare className="w-5 h-5 text-cyan-400" />
                    <span className="text-white font-medium">
                      {selectedProducts.size} produit(s) sélectionné(s)
                    </span>
                    {selectedProducts.size < filteredAndSortedProducts.length && (
                      <button
                        onClick={selectAllFiltered}
                        className="text-cyan-400 hover:text-cyan-300 text-sm underline"
                      >
                        Sélectionner tous les produits filtrés ({filteredAndSortedProducts.length})
                      </button>
                    )}
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={handleDeleteProducts}
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

            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-700/30 rounded-2xl p-6 mb-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <Filter className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Filtres</h3>
                <button
                  onClick={clearFilters}
                  className="ml-auto text-sm text-gray-400 hover:text-white transition-colors duration-200"
                >
                  Effacer les filtres
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                  <option value="all">Toutes catégories</option>
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
                  <option value="all">Tous statuts</option>
                  <option value="in-stock">En stock</option>
                  <option value="low-stock">Stock faible</option>
                  <option value="out-of-stock">Rupture</option>
                </select>
                
                <select
                  value={filterStockLevel}
                  onChange={(e) => setFilterStockLevel(e.target.value)}
                  className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                             focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Tous niveaux</option>
                  <option value="high">Stock élevé</option>
                  <option value="normal">Stock normal</option>
                  <option value="low">Stock faible</option>
                  <option value="empty">Stock vide</option>
                </select>

                <div className="text-sm text-gray-400 flex items-center">
                  <Info className="w-4 h-4 mr-2" />
                  {filteredAndSortedProducts.length} résultat(s)
                </div>
              </div>
            </motion.div>

            {/* Performance indicator */}
            {products.length > LARGE_DATASET_THRESHOLD && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <div>
                    <h4 className="text-yellow-400 font-semibold">Mode Performance Activé</h4>
                    <p className="text-gray-300 text-sm">
                      Optimisations appliquées pour {products.length} produits : 
                      pagination stricte ({ITEMS_PER_PAGE}/page), animations réduites, calculs mis en cache
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-4 mb-6"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                  <div className="flex items-center space-x-4">
                    <span className="text-gray-400 text-sm">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {startIndex + 1}-{Math.min(endIndex, filteredAndSortedProducts.length)} sur {filteredAndSortedProducts.length}
                    </span>
                  </div>

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
                </div>
              </motion.div>
            )}

            {/* Products Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">
                  Produits ({filteredAndSortedProducts.length})
                  {isLazyLoading && (
                    <span className="ml-2 text-yellow-400 text-sm">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Chargement...
                    </span>
                  )}
                </h3>
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
                          {selectedProducts.size === renderedProducts.length && renderedProducts.length > 0 ? (
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
                        { key: 'stock', label: 'Stock Final' },
                        { key: 'minStock', label: 'Stock Min' }
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
                      <th className="text-left py-4 px-4 text-gray-400 font-medium">Statut</th>
                      <th className="text-left py-4 px-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderedProducts.map((product, index) => {
                      const stockCalculation = stockCalculationCache.get(product.id);
                      const finalStock = stockCalculation?.finalStock ?? product.stock;
                      const hasWarning = stockCalculation?.hasInconsistentStock;
                      const warningMessage = stockCalculation?.warningMessage;
                      
                      const getStockStatus = () => {
                        if (finalStock === 0) return { label: 'Rupture', color: 'text-red-400 bg-red-500/20' };
                        if (finalStock <= product.minStock) return { label: 'Stock faible', color: 'text-orange-400 bg-orange-500/20' };
                        return { label: 'En stock', color: 'text-green-400 bg-green-500/20' };
                      };

                      const stockStatus = getStockStatus();

                      return (
                        <TableRow
                          key={product.id}
                          {...TableRowProps}
                          className={`border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors duration-200 ${
                            selectedProducts.has(product.id) ? 'bg-cyan-500/10' : ''
                          }`}
                        >
                          <td className="py-4 px-4">
                            <button
                              onClick={() => toggleSelectProduct(product.id)}
                              className="text-gray-400 hover:text-cyan-400 transition-colors duration-200"
                            >
                              {selectedProducts.has(product.id) ? (
                                <CheckSquare className="w-5 h-5 text-cyan-400" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <p className="text-white font-medium">{product.name}</p>
                              {product.description && (
                                <p className="text-gray-400 text-sm truncate max-w-xs">{product.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full text-xs font-medium">
                              {product.category}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-white font-medium">{formatCurrency(product.price)}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center space-x-2">
                              <span className={`font-bold ${finalStock <= product.minStock ? 'text-orange-400' : 'text-white'}`}>
                                {finalStock}
                              </span>
                              {hasWarning && (
                                <div className="relative group">
                                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                                                  bg-gray-800 text-white text-xs rounded-lg px-2 py-1 opacity-0 
                                                  group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                    {warningMessage}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center text-gray-300">{product.minStock}</td>
                          <td className="py-4 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
                              {stockStatus.label}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => handleEditProduct(product)}
                                className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 
                                           transition-all duration-200"
                                title="Modifier le produit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              
                              <button 
                                onClick={() => {
                                  setSelectedProducts(new Set([product.id]));
                                  setShowDeleteModal(true);
                                }}
                                className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 
                                           transition-all duration-200"
                                title="Supprimer le produit"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </TableRow>
                      );
                    })}
                  </tbody>
                </table>
                
                {filteredAndSortedProducts.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun produit trouvé</p>
                    <p className="text-sm mt-1">Essayez de modifier vos filtres ou ajoutez de nouveaux produits</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}

        {activeTab === 'import' && (
          <StockImportModule
            products={products}
            onUpdateProduct={onUpdateProduct}
            onAddProduct={onAddProduct}
            onRefreshData={onRefreshData}
          />
        )}
      </div>

      {/* Product Edit Modal */}
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
          isLoading={isUpdating}
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
                <p className="text-red-400 font-semibold mb-2">Produits à supprimer :</p>
                <div className="text-gray-300 text-sm">
                  {selectedProducts.size === 1 ? (
                    <div>• {products.find(p => p.id === Array.from(selectedProducts)[0])?.name}</div>
                  ) : (
                    <div>• <strong>{selectedProducts.size}</strong> produits sélectionnés</div>
                  )}
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
                      <span>Confirmer</span>
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