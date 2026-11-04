import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { MonthPicker } from '../components/MonthPicker';
import { SummaryCards } from '../components/SummaryCards';
import { CategoryChart } from '../components/CategoryChart';
import { TransactionList } from '../components/TransactionList';
import { TransactionModal } from '../components/TransactionModal';
import { transactionApi } from '../api/transactions';
import { PlusCircle, RefreshCw } from 'lucide-react';

export function DashboardPage() {
  // Current month default: YYYY-MM
  const getCurrentMonthStr = () => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthStr());
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [txLoading, setTxLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const data = await transactionApi.getSummary(currentMonth);
      setSummary(data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [currentMonth]);

  // Fetch transactions
  const fetchTransactions = useCallback(async (page = 1) => {
    try {
      setTxLoading(true);
      const data = await transactionApi.getTransactions({
        month: currentMonth,
        type: filterType || undefined,
        category: filterCategory || undefined,
        page,
        limit: 10
      });
      setTransactions(data.transactions || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, [currentMonth, filterType, filterCategory]);

  useEffect(() => {
    fetchSummary();
    fetchTransactions(1);
  }, [fetchSummary, fetchTransactions]);

  const handleSaveTransaction = async (formData) => {
    if (editingTransaction && editingTransaction.id) {
      await transactionApi.updateTransaction(editingTransaction.id, formData);
      showToast('Transaction updated successfully');
    } else {
      await transactionApi.createTransaction(formData);
      showToast('Transaction recorded successfully');
    }
    fetchSummary();
    fetchTransactions(pagination.page);
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await transactionApi.deleteTransaction(id);
      showToast('Transaction deleted');
      fetchSummary();
      fetchTransactions(pagination.page);
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (tx) => {
    setEditingTransaction(tx);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar onRefreshNeeded={() => { fetchSummary(); fetchTransactions(pagination.page); }} />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Controls: Title, Month Selector, Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Overview</h1>
            <p className="text-xs text-slate-500">Track income, monitor spending, and manage budget alerts</p>
          </div>

          <div className="flex items-center gap-3">
            <MonthPicker
              currentMonth={currentMonth}
              onMonthChange={(newMonth) => setCurrentMonth(newMonth)}
            />

            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-emerald-600/20 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Record Transaction</span>
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className={`p-3 rounded-xl text-xs font-semibold transition flex items-center justify-between ${
            toastMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}>
            <span>{toastMessage.msg}</span>
            <button onClick={() => setToastMessage(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* 3 Summary Cards */}
        <SummaryCards summary={summary} loading={summaryLoading} />

        {/* Category Breakdown Chart */}
        <CategoryChart
          categories={summary?.categoryBreakdown || []}
          totalExpense={summary?.totalExpense || 0}
          loading={summaryLoading}
        />

        {/* Transaction History Table */}
        <TransactionList
          transactions={transactions}
          pagination={pagination}
          loading={txLoading}
          filterType={filterType}
          filterCategory={filterCategory}
          onFilterTypeChange={(type) => setFilterType(type)}
          onFilterCategoryChange={(cat) => setFilterCategory(cat)}
          onPageChange={(p) => fetchTransactions(p)}
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteTransaction}
        />
      </main>

      {/* Add / Edit Transaction Modal */}
      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTransaction}
        transaction={editingTransaction}
      />
    </div>
  );
}
