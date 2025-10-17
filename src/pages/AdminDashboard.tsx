import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw,
  Building2, DollarSign, TrendingUp, BarChart3, PieChart, Calendar,
  Eye, ClipboardCheck, Search, ChevronLeft, ChevronRight, Filter,
  Activity, Briefcase, FileText, GraduationCap, MessageSquare, Wrench, Package
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, auth, api, plans } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import ReportsTabContent from '../components/ReportsTabContent';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement,
  Filler
);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<'plans' | 'reports'>('plans');
  const [planSubTab, setPlansSubTab] = useState<'analytics' | 'pending' | 'reviewed' | 'budget-activity' | 'executive-performance'>('analytics');
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
  const [budgetActivityCurrentPage, setBudgetActivityCurrentPage] = useState(1);
  const [executiveCurrentPage, setExecutiveCurrentPage] = useState(1);
  const reviewedItemsPerPage = 10;
  const pendingItemsPerPage = 10;
  const budgetActivityItemsPerPage = 10;
  const executiveItemsPerPage = 10;

  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [adminOrgType, setAdminOrgType] = useState<string | null>(null);
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

        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const adminOrg = authData.userOrganizations[0];
          setAdminOrgType(adminOrg.organization_name || 'ADMIN');
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
        console.error('Failed to load organization data:', error);
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
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000
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
    enabled: isAuthInitialized && mainTab === 'plans' && (planSubTab === 'pending' || planSubTab === 'reviewed' || planSubTab === 'budget-activity' || planSubTab === 'executive-performance'),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000
  });

  // Fetch sub-activities for budget calculations
  const { data: subActivitiesData, isLoading: isLoadingSubActivities } = useQuery({
    queryKey: ['sub-activities-admin'],
    queryFn: async () => {
      const response = await api.get('/sub-activities/');
      return { data: response.data?.results || response.data || [] };
    },
    enabled: isAuthInitialized && mainTab === 'plans' && (planSubTab === 'budget-activity' || planSubTab === 'executive-performance'),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000
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

  const totalPlans = analyticsData?.total_plans || reviewedPlansData.filter(p => ['SUBMITTED', 'APPROVED'].includes(p.status)).length;
  const pendingCount = analyticsData?.pending_count || reviewedPlansData.filter(p => p.status === 'SUBMITTED').length;
  const approvedCount = analyticsData?.approved_count || reviewedPlansData.filter(p => p.status === 'APPROVED').length;
  const rejectedCount = analyticsData?.rejected_count || reviewedPlansData.filter(p => p.status === 'REJECTED').length;

  const budgetTotals = useMemo(() => {
    if (planSubTab === 'analytics' && analyticsData) {
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
    }
    return {
      totalBudget: 0,
      totalFunding: 0,
      fundingGap: 0,
      governmentTotal: 0,
      partnersTotal: 0,
      sdgTotal: 0,
      otherTotal: 0
    };
  }, [planSubTab, analyticsData]);

  const calculateActivityTypeBudgets = useMemo(() => {
    if (planSubTab === 'analytics' && analyticsData) {
      return analyticsData.activity_budgets;
    }
    return {
      Training: { count: 0, budget: 0 },
      Meeting: { count: 0, budget: 0 },
      Workshop: { count: 0, budget: 0 },
      Supervision: { count: 0, budget: 0 },
      Procurement: { count: 0, budget: 0 },
      Printing: { count: 0, budget: 0 },
      Other: { count: 0, budget: 0 }
    };
  }, [planSubTab, analyticsData]);

  // Budget by activity type data for table
  const budgetByActivityData = useMemo(() => {
    const subActivities = subActivitiesData?.data || [];
    const orgActivityData: Record<string, any> = {};

    subActivities.forEach((subActivity: any) => {
      const orgId = subActivity.organization || 'unknown';
      const orgName = organizationsMap[orgId] || 'Unknown Organization';

      if (!orgActivityData[orgId]) {
        orgActivityData[orgId] = {
          organizationName: orgName,
          Training: { count: 0, budget: 0 },
          Meeting: { count: 0, budget: 0 },
          Workshop: { count: 0, budget: 0 },
          Procurement: { count: 0, budget: 0 },
          Printing: { count: 0, budget: 0 },
          Other: { count: 0, budget: 0 },
          totalCount: 0,
          totalBudget: 0
        };
      }

      const activityType = subActivity.activity_type || 'Other';
      if (orgActivityData[orgId][activityType]) {
        orgActivityData[orgId][activityType].count++;
        orgActivityData[orgId].totalCount++;

        const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
          ? Number(subActivity.estimated_cost_with_tool || 0)
          : Number(subActivity.estimated_cost_without_tool || 0);

        orgActivityData[orgId][activityType].budget += cost;
        orgActivityData[orgId].totalBudget += cost;
      }
    });

    return Object.values(orgActivityData);
  }, [subActivitiesData?.data, organizationsMap]);

  // Executive performance data
  const executivePerformanceData = useMemo(() => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => ['SUBMITTED', 'APPROVED'].includes(plan.status));
    const executiveData: Record<string, any> = {};
    const subActivities = subActivitiesData?.data || [];

    submittedAndApprovedPlans.forEach((plan: any) => {
      const orgId = plan.organization;
      const orgName = getOrganizationName(plan);

      if (!executiveData[orgId]) {
        executiveData[orgId] = {
          organizationName: orgName,
          totalPlans: 0,
          approved: 0,
          submitted: 0,
          totalBudget: 0,
          availableFunding: 0,
          governmentBudget: 0,
          sdgBudget: 0,
          partnersBudget: 0,
          fundingGap: 0
        };
      }

      executiveData[orgId].totalPlans++;
      if (plan.status === 'APPROVED') executiveData[orgId].approved++;
      else if (plan.status === 'SUBMITTED') executiveData[orgId].submitted++;

      const orgSubActivities = subActivities.filter((sa: any) => sa.organization === orgId);
      orgSubActivities.forEach((subActivity: any) => {
        const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
          ? Number(subActivity.estimated_cost_with_tool || 0)
          : Number(subActivity.estimated_cost_without_tool || 0);

        const government = Number(subActivity.government_treasury || 0);
        const partners = Number(subActivity.partners_funding || 0);
        const sdg = Number(subActivity.sdg_funding || 0);
        const other = Number(subActivity.other_funding || 0);
        const funding = government + partners + sdg + other;

        executiveData[orgId].totalBudget += cost;
        executiveData[orgId].availableFunding += funding;
        executiveData[orgId].governmentBudget += government;
        executiveData[orgId].sdgBudget += sdg;
        executiveData[orgId].partnersBudget += partners;
        executiveData[orgId].fundingGap += Math.max(0, cost - funding);
      });
    });

    return Object.values(executiveData);
  }, [reviewedPlansData, subActivitiesData?.data, organizationsMap]);

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
    let filtered = reviewedPlansData.filter(plan => ['APPROVED', 'REJECTED'].includes(plan.status));

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

  // Pagination for budget by activity
  const budgetActivityTotalPages = Math.ceil(budgetByActivityData.length / budgetActivityItemsPerPage);
  const budgetActivityPaginatedData = budgetByActivityData.slice(
    (budgetActivityCurrentPage - 1) * budgetActivityItemsPerPage,
    budgetActivityCurrentPage * budgetActivityItemsPerPage
  );

  // Pagination for executive performance
  const executiveTotalPages = Math.ceil(executivePerformanceData.length / executiveItemsPerPage);
  const executivePaginatedData = executivePerformanceData.slice(
    (executiveCurrentPage - 1) * executiveItemsPerPage,
    executiveCurrentPage * executiveItemsPerPage
  );

  const formatCurrency = (value: number) => {
    return `ETB ${value.toLocaleString('en-US')}`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Chart data
  const planStatusChartData = {
    labels: ['Approved', 'Rejected', 'Pending'],
    datasets: [{
      data: [approvedCount, rejectedCount, pendingCount],
      backgroundColor: ['#10B981', '#EF4444', '#F59E0B'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const budgetDistributionChartData = {
    labels: ['Government', 'Partners', 'SDG', 'Other', 'Gap'],
    datasets: [{
      data: [
        budgetTotals.governmentTotal,
        budgetTotals.partnersTotal,
        budgetTotals.sdgTotal,
        budgetTotals.otherTotal,
        budgetTotals.fundingGap
      ],
      backgroundColor: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const activityTypeColors = {
    Training: '#3B82F6',
    Meeting: '#10B981',
    Workshop: '#F59E0B',
    Supervision: '#EF4444',
    Procurement: '#8B5CF6',
    Printing: '#EC4899',
    Other: '#6B7280'
  };

  const activityTypeIcons = {
    Training: GraduationCap,
    Meeting: Users,
    Workshop: Briefcase,
    Supervision: Eye,
    Procurement: Package,
    Printing: FileText,
    Other: Activity
  };

  if (!isAuthInitialized || (isLoadingPlans && planSubTab !== 'analytics') || (isLoadingAnalytics && planSubTab === 'analytics')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Access Denied</h3>
        <p className="text-red-600 mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Beautiful Gradient Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 rounded-lg shadow-lg mb-8 overflow-hidden">
        <div className="px-8 py-12 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center mb-4">
                <Shield className="h-12 w-12 text-white mr-4" />
                <div>
                  <h1 className="text-4xl font-bold">Admin Dashboard</h1>
                  <p className="text-xl text-blue-100">
                    Ministry of Health - Strategic Plan Overview
                  </p>
                </div>
              </div>
              <p className="text-lg text-blue-100 max-w-2xl">
                Comprehensive monitoring and analysis of strategic planning activities.
                Track plan submissions, budget allocations, and performance metrics in real-time.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{totalPlans}</div>
              <div className="text-blue-100">Total Plans</div>
              <button
                onClick={() => {
                  refetchAnalytics();
                  refetchPlans();
                }}
                className="mt-4 flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
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
              <ClipboardCheck className="h-5 w-5" />
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
          {/* Plan Sub-Tab Navigation */}
          <div className="mb-6 border-b border-gray-200">
            <div className="flex -mb-px space-x-4 overflow-x-auto">
              <button
                onClick={() => setPlansSubTab('analytics')}
                className={`py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  planSubTab === 'analytics'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => setPlansSubTab('pending')}
                className={`py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  planSubTab === 'pending'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Pending Reviews
                {pendingCount > 0 && (
                  <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPlansSubTab('reviewed')}
                className={`py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  planSubTab === 'reviewed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Reviewed Plans
                {(approvedCount + rejectedCount) > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
                    {approvedCount + rejectedCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPlansSubTab('budget-activity')}
                className={`py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  planSubTab === 'budget-activity'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Budget by Activity
              </button>
              <button
                onClick={() => setPlansSubTab('executive-performance')}
                className={`py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  planSubTab === 'executive-performance'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Executive Performance
              </button>
            </div>
          </div>

          {/* Analytics Tab */}
          {planSubTab === 'analytics' && (
            <div className="space-y-8">
              {/* Top Statistics Cards - Plan Status */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm font-medium">Total Plans</p>
                      <p className="text-3xl font-bold">{totalPlans}</p>
                      <p className="text-blue-100 text-xs">Submitted + Approved</p>
                    </div>
                    <ClipboardCheck className="h-12 w-12 text-blue-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-amber-100 text-sm font-medium">Pending Review</p>
                      <p className="text-3xl font-bold">{pendingCount}</p>
                      <p className="text-amber-100 text-xs">Awaiting evaluation</p>
                    </div>
                    <AlertCircle className="h-12 w-12 text-amber-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-sm font-medium">Approved</p>
                      <p className="text-3xl font-bold">{approvedCount}</p>
                      <p className="text-green-100 text-xs">Successfully reviewed</p>
                    </div>
                    <CheckCircle className="h-12 w-12 text-green-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-red-100 text-sm font-medium">Rejected</p>
                      <p className="text-3xl font-bold">{rejectedCount}</p>
                      <p className="text-red-100 text-xs">Needs revision</p>
                    </div>
                    <XCircle className="h-12 w-12 text-red-200" />
                  </div>
                </div>
              </div>

              {/* Budget Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-100 text-sm font-medium">Total Budget</p>
                      <p className="text-2xl font-bold">{formatCurrency(budgetTotals.totalBudget)}</p>
                      <p className="text-indigo-100 text-xs">All Plans</p>
                    </div>
                    <DollarSign className="h-10 w-10 text-indigo-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-sm font-medium">Available Funding</p>
                      <p className="text-2xl font-bold">{formatCurrency(budgetTotals.totalFunding)}</p>
                      <p className="text-emerald-100 text-xs">All sources combined</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-emerald-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg shadow-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-rose-100 text-sm font-medium">Funding Gap</p>
                      <p className="text-2xl font-bold">{formatCurrency(budgetTotals.fundingGap)}</p>
                      <p className="text-rose-100 text-xs">Additional funding needed</p>
                    </div>
                    <AlertCircle className="h-10 w-10 text-rose-200" />
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h3 className="text-lg font-semibold mb-4">Plan Status Distribution</h3>
                  <div style={{ height: '300px' }}>
                    <Doughnut
                      data={planStatusChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'bottom' }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h3 className="text-lg font-semibold mb-4">Budget Distribution</h3>
                  <div style={{ height: '300px' }}>
                    <Doughnut
                      data={budgetDistributionChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'bottom' }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Budget by Activity Type - Colorful Cards */}
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-6 flex items-center">
                  <Activity className="h-6 w-6 mr-2 text-blue-600" />
                  Budget by Activity Type
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(calculateActivityTypeBudgets).map(([type, data]: [string, any]) => {
                    const Icon = activityTypeIcons[type as keyof typeof activityTypeIcons];
                    const color = activityTypeColors[type as keyof typeof activityTypeColors];

                    return (
                      <div key={type} className="rounded-lg shadow p-4" style={{ backgroundColor: color }}>
                        <div className="flex items-center justify-between text-white mb-2">
                          <Icon className="h-8 w-8 opacity-80" />
                          <span className="text-2xl font-bold">{data.count}</span>
                        </div>
                        <h4 className="text-white font-semibold text-sm mb-1">{type}</h4>
                        <p className="text-white/90 text-xs font-medium">
                          {formatCurrency(data.budget)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Pending Reviews Tab */}
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
                    {paginatedPendingPlans.length === 0 ? (
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
                              {formatDate(plan.submitted_at)}
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

          {/* Reviewed Plans Tab */}
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
                    {paginatedReviewedPlans.length === 0 ? (
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
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {plan.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {formatDate(plan.submitted_at)}
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

          {/* Budget by Activity Tab */}
          {planSubTab === 'budget-activity' && (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Budget by Activity Type</h3>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Training</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meeting</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workshop</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procurement</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Printing</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Other</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoadingSubActivities ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                      </td>
                    </tr>
                  ) : budgetActivityPaginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        No budget data available
                      </td>
                    </tr>
                  ) : (
                    budgetActivityPaginatedData.map((org: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {org.organizationName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Training.count} ({formatCurrency(org.Training.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Meeting.count} ({formatCurrency(org.Meeting.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Workshop.count} ({formatCurrency(org.Workshop.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Procurement.count} ({formatCurrency(org.Procurement.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Printing.count} ({formatCurrency(org.Printing.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{org.Other.count} ({formatCurrency(org.Other.budget)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          <div>{org.totalCount} ({formatCurrency(org.totalBudget)})</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {budgetActivityTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {(budgetActivityCurrentPage - 1) * budgetActivityItemsPerPage + 1} to{' '}
                      {Math.min(budgetActivityCurrentPage * budgetActivityItemsPerPage, budgetByActivityData.length)} of{' '}
                      {budgetByActivityData.length} results
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setBudgetActivityCurrentPage(p => Math.max(1, p - 1))}
                        disabled={budgetActivityCurrentPage === 1}
                        className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setBudgetActivityCurrentPage(p => Math.min(budgetActivityTotalPages, p + 1))}
                        disabled={budgetActivityCurrentPage === budgetActivityTotalPages}
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

          {/* Executive Performance Tab */}
          {planSubTab === 'executive-performance' && (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Executive Performance Overview</h3>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plans</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funding</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gap</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">%</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoadingSubActivities ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                      </td>
                    </tr>
                  ) : executivePaginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No executive performance data available
                      </td>
                    </tr>
                  ) : (
                    executivePaginatedData.map((org: any, idx: number) => {
                      const fundingPercentage = org.totalBudget > 0
                        ? ((org.availableFunding / org.totalBudget) * 100).toFixed(1)
                        : '0.0';

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {org.organizationName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">{org.approved}</span>
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">{org.submitted}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(org.totalBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {formatCurrency(org.availableFunding)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {formatCurrency(org.fundingGap)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{ width: `${Math.min(parseFloat(fundingPercentage), 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-medium">{fundingPercentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {executiveTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {(executiveCurrentPage - 1) * executiveItemsPerPage + 1} to{' '}
                      {Math.min(executiveCurrentPage * executiveItemsPerPage, executivePerformanceData.length)} of{' '}
                      {executivePerformanceData.length} results
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setExecutiveCurrentPage(p => Math.max(1, p - 1))}
                        disabled={executiveCurrentPage === 1}
                        className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setExecutiveCurrentPage(p => Math.min(executiveTotalPages, p + 1))}
                        disabled={executiveCurrentPage === executiveTotalPages}
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
  );
};

export default AdminDashboard;
