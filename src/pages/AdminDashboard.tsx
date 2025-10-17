import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw,
  Building2, DollarSign, TrendingUp, BarChart3, PieChart, Calendar,
  Eye, ClipboardCheck, Search, ChevronLeft, ChevronRight, Filter,
  Activity, Briefcase, FileText
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, auth, api, plans } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import ReportsTabContent from '../components/ReportsTabContent';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<'plans' | 'reports'>('plans');
  const [planSubTab, setPlansSubTab] = useState<'pending' | 'reviewed' | 'budget-activity' | 'analytics' | 'executive-performance'>('analytics');
  const [reportSubTab, setReportSubTab] = useState<'performance-overview' | 'approved-reports' | 'budget-utilization'>('performance-overview');

  const [reviewedFilter, setReviewedFilter] = useState('all');
  const [reviewedOrgFilter, setReviewedOrgFilter] = useState('all');
  const [reviewedSearch, setReviewedSearch] = useState('');
  const [reviewedSortBy, setReviewedSortBy] = useState<'date' | 'organization' | 'status'>('date');
  const [reviewedSortOrder, setReviewedSortOrder] = useState<'asc' | 'desc'>('desc');
  const [reviewedCurrentPage, setReviewedCurrentPage] = useState(1);
  const [pendingCurrentPage, setPendingCurrentPage] = useState(1);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingOrgFilter, setPendingOrgFilter] = useState('all');
  const [pendingSortBy, setPendingSortBy] = useState<'date' | 'organization' | 'planner'>('date');
  const [pendingSortOrder, setPendingSortOrder] = useState<'asc' | 'desc'>('desc');
  const reviewedItemsPerPage = 10;
  const pendingItemsPerPage = 10;

  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);

  useEffect(() => {
    const initializeAdminAccess = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }

        if (!isAdmin(authData.userOrganizations)) {
          setError('You do not have permission to access the admin dashboard');
          return;
        }

        setIsAuthInitialized(true);
      } catch (error) {
        setError('Failed to verify admin permissions');
      }
    };

    initializeAdminAccess();
  }, [navigate]);

  useEffect(() => {
    const fetchOrganizations = async () => {
      if (!isAuthInitialized) return;

      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        const allOrgs = Array.isArray(response) ? response : response?.data || [];

        allOrgs.forEach((org: any) => {
          if (org && org.id) {
            orgMap[org.id] = org.name;
          }
        });
        setOrganizationsMap(orgMap);
      } catch (error) {
        setError('Failed to load organization data');
      }
    };

    fetchOrganizations();
  }, [isAuthInitialized]);

  // Fetch analytics data from backend
  const { data: analyticsData, isLoading: isLoadingAnalytics, refetch: refetchAnalytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      return await plans.getAdminAnalytics();
    },
    enabled: isAuthInitialized && mainTab === 'plans' && planSubTab === 'analytics',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  // Fetch all plans with backend filtering
  const { data: allPlansData, isLoading: isLoadingPlans, refetch: refetchPlans } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      const response = await api.get('/plans/');
      const plansData = (response.data?.results || response.data || []).map((plan: any) => ({
        ...plan,
        organizationName: organizationsMap[plan.organization] || plan.organization_name || 'Unknown Organization'
      }));
      return { data: plansData };
    },
    enabled: isAuthInitialized && mainTab === 'plans' && (planSubTab === 'pending' || planSubTab === 'reviewed'),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  const getOrganizationName = (plan: any) => {
    return plan.organizationName ||
           plan.organization_name ||
           (plan.organization && organizationsMap[plan.organization]) ||
           'Unknown Organization';
  };

  const reviewedPlansData = useMemo(() => {
    return allPlansData?.data || [];
  }, [allPlansData?.data]);

  const budgetTotals = useMemo(() => {
    if (!analyticsData) {
      return {
        totalBudget: 0,
        totalFunding: 0,
        fundingGap: 0,
        governmentTotal: 0,
        partnersTotal: 0,
        sdgTotal: 0,
        otherTotal: 0
      };
    }

    const budgets = analyticsData.budget_totals;
    const totalBudget = budgets.total_with_tool + budgets.total_without_tool;
    const totalFunding = budgets.government_total + budgets.partners_total + budgets.sdg_total + budgets.other_total;
    const fundingGap = Math.max(0, totalBudget - totalFunding);

    return {
      totalBudget,
      totalFunding,
      fundingGap,
      governmentTotal: budgets.government_total,
      partnersTotal: budgets.partners_total,
      sdgTotal: budgets.sdg_total,
      otherTotal: budgets.other_total
    };
  }, [analyticsData]);

  const calculateActivityTypeBudgets = useMemo(() => {
    if (!analyticsData) {
      return {
        Training: { count: 0, budget: 0 },
        Meeting: { count: 0, budget: 0 },
        Workshop: { count: 0, budget: 0 },
        Supervision: { count: 0, budget: 0 },
        Procurement: { count: 0, budget: 0 },
        Printing: { count: 0, budget: 0 },
        Other: { count: 0, budget: 0 }
      };
    }

    return analyticsData.activity_budgets;
  }, [analyticsData]);

  const getFilteredPendingPlans = useMemo(() => {
    let filtered = reviewedPlansData.filter(plan => plan.status === 'SUBMITTED');

    if (pendingOrgFilter !== 'all') {
      filtered = filtered.filter(plan => plan.organization === pendingOrgFilter);
    }

    if (pendingSearch) {
      filtered = filtered.filter(plan =>
        getOrganizationName(plan).toLowerCase().includes(pendingSearch.toLowerCase()) ||
        (plan.planner_name && plan.planner_name.toLowerCase().includes(pendingSearch.toLowerCase()))
      );
    }

    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (pendingSortBy) {
        case 'date':
          aValue = new Date(a.submitted_at || a.created_at).getTime();
          bValue = new Date(b.submitted_at || b.created_at).getTime();
          break;
        case 'organization':
          aValue = getOrganizationName(a).toLowerCase();
          bValue = getOrganizationName(b).toLowerCase();
          break;
        case 'planner':
          aValue = (a.planner_name || '').toLowerCase();
          bValue = (b.planner_name || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (pendingSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [reviewedPlansData, pendingOrgFilter, pendingSearch, pendingSortBy, pendingSortOrder]);

  const filteredPendingPlans = getFilteredPendingPlans;
  const pendingTotalPages = Math.ceil(filteredPendingPlans.length / pendingItemsPerPage);
  const paginatedPendingPlans = filteredPendingPlans.slice(
    (pendingCurrentPage - 1) * pendingItemsPerPage,
    pendingCurrentPage * pendingItemsPerPage
  );

  const getFilteredReviewedPlans = useMemo(() => {
    let filtered = reviewedPlansData;

    if (reviewedFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === reviewedFilter);
    }

    if (reviewedOrgFilter !== 'all') {
      filtered = filtered.filter(plan => plan.organization === reviewedOrgFilter);
    }

    if (reviewedSearch) {
      filtered = filtered.filter(plan =>
        getOrganizationName(plan).toLowerCase().includes(reviewedSearch.toLowerCase()) ||
        (plan.planner_name && plan.planner_name.toLowerCase().includes(reviewedSearch.toLowerCase()))
      );
    }

    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (reviewedSortBy) {
        case 'date':
          aValue = new Date(a.submitted_at || a.created_at).getTime();
          bValue = new Date(b.submitted_at || b.created_at).getTime();
          break;
        case 'organization':
          aValue = getOrganizationName(a).toLowerCase();
          bValue = getOrganizationName(b).toLowerCase();
          break;
        case 'status':
          aValue = (a.status || '').toLowerCase();
          bValue = (b.status || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (reviewedSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [reviewedPlansData, reviewedFilter, reviewedOrgFilter, reviewedSearch, reviewedSortBy, reviewedSortOrder]);

  const filteredReviewedPlans = getFilteredReviewedPlans;
  const reviewedTotalPages = Math.ceil(filteredReviewedPlans.length / reviewedItemsPerPage);
  const paginatedReviewedPlans = filteredReviewedPlans.slice(
    (reviewedCurrentPage - 1) * reviewedItemsPerPage,
    reviewedCurrentPage * reviewedItemsPerPage
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <div className="flex items-center space-x-2 text-red-600 mb-4">
            <AlertCircle className="h-6 w-6" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
          </div>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2
    }).format(value);
  };

  const totalPlans = analyticsData?.total_plans || 0;
  const pendingCount = analyticsData?.pending_count || 0;
  const approvedCount = analyticsData?.approved_count || 0;
  const rejectedCount = analyticsData?.rejected_count || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-500 mt-1">Comprehensive planning and reporting overview</p>
              </div>
            </div>
            <button
              onClick={() => {
                refetchAnalytics();
                refetchPlans();
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="mb-6 border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setMainTab('plans')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                mainTab === 'plans'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Plans</span>
              </div>
            </button>
            <button
              onClick={() => setMainTab('reports')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                mainTab === 'reports'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5" />
                <span>Reports</span>
              </div>
            </button>
          </div>
        </div>

        {mainTab === 'plans' && (
          <div>
            <div className="mb-6 border-b border-gray-200">
              <div className="flex space-x-4 overflow-x-auto">
                <button
                  onClick={() => setPlansSubTab('analytics')}
                  className={`pb-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    planSubTab === 'analytics'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Analytics
                </button>
                <button
                  onClick={() => setPlansSubTab('pending')}
                  className={`pb-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    planSubTab === 'pending'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Pending Reviews
                  {pendingCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setPlansSubTab('reviewed')}
                  className={`pb-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    planSubTab === 'reviewed'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Reviewed Plans
                </button>
              </div>
            </div>

            {planSubTab === 'analytics' && (
              <div className="space-y-6">
                {isLoadingAnalytics ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">Total Plans</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">{totalPlans}</p>
                          </div>
                          <Building2 className="h-12 w-12 text-blue-600" />
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">Pending Review</p>
                            <p className="text-3xl font-bold text-yellow-600 mt-1">{pendingCount}</p>
                          </div>
                          <AlertCircle className="h-12 w-12 text-yellow-600" />
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">Approved</p>
                            <p className="text-3xl font-bold text-green-600 mt-1">{approvedCount}</p>
                          </div>
                          <CheckCircle className="h-12 w-12 text-green-600" />
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">Rejected</p>
                            <p className="text-3xl font-bold text-red-600 mt-1">{rejectedCount}</p>
                          </div>
                          <XCircle className="h-12 w-12 text-red-600" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">Budget Overview</h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Total Budget</span>
                            <span className="font-semibold">{formatCurrency(budgetTotals.totalBudget)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Total Funding</span>
                            <span className="font-semibold text-green-600">{formatCurrency(budgetTotals.totalFunding)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Funding Gap</span>
                            <span className="font-semibold text-red-600">{formatCurrency(budgetTotals.fundingGap)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">Funding Sources</h3>
                        <Doughnut
                          data={{
                            labels: ['Government', 'Partners', 'SDG', 'Other'],
                            datasets: [{
                              data: [
                                budgetTotals.governmentTotal,
                                budgetTotals.partnersTotal,
                                budgetTotals.sdgTotal,
                                budgetTotals.otherTotal
                              ],
                              backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6']
                            }]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { position: 'bottom' }
                            }
                          }}
                          height={200}
                        />
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                      <h3 className="text-lg font-semibold mb-4">Budget by Activity Type</h3>
                      <Bar
                        data={{
                          labels: Object.keys(calculateActivityTypeBudgets),
                          datasets: [{
                            label: 'Budget (ETB)',
                            data: Object.values(calculateActivityTypeBudgets).map((item: any) => item.budget),
                            backgroundColor: '#3B82F6'
                          }]
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false }
                          },
                          scales: {
                            y: {
                              beginAtZero: true,
                              ticks: {
                                callback: (value) => formatCurrency(Number(value))
                              }
                            }
                          }
                        }}
                        height={300}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {planSubTab === 'pending' && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <h3 className="text-lg font-semibold">Pending Reviews</h3>
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={pendingSearch}
                          onChange={(e) => setPendingSearch(e.target.value)}
                          className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Planner
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {isLoadingPlans ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center">
                            <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                          </td>
                        </tr>
                      ) : paginatedPendingPlans.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                            No pending plans found
                          </td>
                        </tr>
                      ) : (
                        paginatedPendingPlans.map((plan: any) => (
                          <tr key={plan.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {getOrganizationName(plan)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{plan.planner_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                {plan.submitted_at ? format(new Date(plan.submitted_at), 'MMM d, yyyy') : 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => navigate(`/admin/plans/${plan.id}`)}
                                className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Review
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {pendingTotalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Showing {(pendingCurrentPage - 1) * pendingItemsPerPage + 1} to{' '}
                        {Math.min(pendingCurrentPage * pendingItemsPerPage, filteredPendingPlans.length)} of{' '}
                        {filteredPendingPlans.length} results
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setPendingCurrentPage(p => Math.max(1, p - 1))}
                          disabled={pendingCurrentPage === 1}
                          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPendingCurrentPage(p => Math.min(pendingTotalPages, p + 1))}
                          disabled={pendingCurrentPage === pendingTotalPages}
                          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {planSubTab === 'reviewed' && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <h3 className="text-lg font-semibold">Reviewed Plans</h3>
                    <div className="flex items-center space-x-2">
                      <select
                        value={reviewedFilter}
                        onChange={(e) => setReviewedFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Statuses</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SUBMITTED">Submitted</option>
                      </select>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={reviewedSearch}
                          onChange={(e) => setReviewedSearch(e.target.value)}
                          className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Planner
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {isLoadingPlans ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center">
                            <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                          </td>
                        </tr>
                      ) : paginatedReviewedPlans.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            No plans found
                          </td>
                        </tr>
                      ) : (
                        paginatedReviewedPlans.map((plan: any) => (
                          <tr key={plan.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {getOrganizationName(plan)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{plan.planner_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  plan.status === 'APPROVED'
                                    ? 'bg-green-100 text-green-800'
                                    : plan.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {plan.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                {plan.submitted_at ? format(new Date(plan.submitted_at), 'MMM d, yyyy') : 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => navigate(`/admin/plans/${plan.id}`)}
                                className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {reviewedTotalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Showing {(reviewedCurrentPage - 1) * reviewedItemsPerPage + 1} to{' '}
                        {Math.min(reviewedCurrentPage * reviewedItemsPerPage, filteredReviewedPlans.length)} of{' '}
                        {filteredReviewedPlans.length} results
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setReviewedCurrentPage(p => Math.max(1, p - 1))}
                          disabled={reviewedCurrentPage === 1}
                          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setReviewedCurrentPage(p => Math.min(reviewedTotalPages, p + 1))}
                          disabled={reviewedCurrentPage === reviewedTotalPages}
                          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mainTab === 'reports' && (
          <ReportsTabContent
            reportSubTab={reportSubTab}
            setReportSubTab={setReportSubTab}
          />
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
