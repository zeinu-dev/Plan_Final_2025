import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield, BarChart3, PieChart, DollarSign, TrendingUp, Building2
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
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
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [adminOrgId, setAdminOrgId] = useState<number | null>(null);
  const [adminOrgType, setAdminOrgType] = useState<string | null>(null);
  const [allowedOrgIds, setAllowedOrgIds] = useState<number[]>([]);
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
          setAdminOrgId(adminOrg.organization);
          setAdminOrgType(adminOrg.organization_type);

          const orgsResponse = await organizations.listAll();
          const orgsList = Array.isArray(orgsResponse) ? orgsResponse : (orgsResponse?.data || []);
          const map = Object.fromEntries(orgsList.map(org => [org.id, org.name]));
          setOrganizationsMap(map);

          if (adminOrg.organization_type === 'MINISTER') {
            const allOrgIds = orgsList.map(org => org.id);
            setAllowedOrgIds(allOrgIds);
          } else {
            const adminOrgData = orgsList.find(org => org.id === adminOrg.organization);
            if (adminOrgData) {
              const allowed = [adminOrg.organization];
              const directChildren = orgsList
                .filter(org => org.parent_organization === adminOrg.organization)
                .map(org => org.id);
              allowed.push(...directChildren);
              setAllowedOrgIds(allowed);
            }
          }
        }

        setIsAuthInitialized(true);
      } catch (err) {
        console.error('Failed to initialize admin access:', err);
        setError('Failed to load admin access permissions');
      }
    };

    initializeAdminAccess();
  }, [navigate]);

  const { data: directSubActivitiesData } = useQuery({
    queryKey: ['sub-activities', 'direct', allowedOrgIds],
    queryFn: async () => {
      try {
        const params: any = {};

        if (allowedOrgIds.length > 0 && adminOrgType !== 'MINISTER') {
          params.organization__in = allowedOrgIds.join(',');
        }

        const [subActivitiesResponse, mainActivitiesResponse] = await Promise.all([
          api.get('/sub-activities/', { params }),
          api.get('/main-activities/', { params })
        ]);

        const allSubActivities = subActivitiesResponse.data?.results || subActivitiesResponse.data || [];
        const allMainActivities = mainActivitiesResponse.data?.results || mainActivitiesResponse.data || [];

        const mainActivityOrgMap = new Map();
        allMainActivities.forEach((activity: any) => {
          mainActivityOrgMap.set(activity.id, activity.organization);
        });

        const enrichedSubActivities = allSubActivities.map((subActivity: any) => {
          const activityOrg = mainActivityOrgMap.get(subActivity.main_activity);
          return {
            ...subActivity,
            organization: activityOrg,
            organizationName: activityOrg ? organizationsMap[activityOrg] || 'Unknown Organization' : 'No Organization'
          };
        });

        return { data: enrichedSubActivities };
      } catch (error) {
        return { data: [] };
      }
    },
    enabled: isAuthInitialized && (allowedOrgIds.length > 0 || adminOrgType === 'MINISTER'),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1
  });

  const calculatePlanBudgetFromSubActivities = (planId: string) => {
    const subActivities = directSubActivitiesData?.data || [];
    const planSubActivities = subActivities;

    return planSubActivities.reduce((sum, subActivity) => {
      const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
        ? Number(subActivity.estimated_cost_with_tool || 0)
        : Number(subActivity.estimated_cost_without_tool || 0);
      return sum + cost;
    }, 0);
  };

  const { data: allPlans, isLoading } = useQuery({
    queryKey: ['plans', 'admin-all', allowedOrgIds],
    queryFn: async () => {
      try {
        const params: any = {};

        if (allowedOrgIds.length > 0 && adminOrgType !== 'MINISTER') {
          params.organization__in = allowedOrgIds.join(',');
        }

        const response = await api.get('/plans/', { params });
        const plans = Array.isArray(response.data) ? response.data : (response.data?.results || []);

        return plans;
      } catch (error) {
        console.error('Failed to fetch plans:', error);
        return [];
      }
    },
    enabled: isAuthInitialized && (allowedOrgIds.length > 0 || adminOrgType === 'MINISTER'),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1
  });

  const reviewedPlansData = useMemo(() => {
    return allPlans?.filter((plan: any) => ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(plan.status)) || [];
  }, [allPlans]);

  const getOrganizationName = (plan: any) => {
    return organizationsMap[plan.organization] || 'Unknown Organization';
  };

  const formatCurrency = (value: number) => {
    return `ETB ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const completeBudgetOverview = useMemo(() => {
    const subActivities = directSubActivitiesData?.data || [];
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => ['SUBMITTED', 'APPROVED'].includes(plan.status));
    const submittedAndApprovedOrgIds = [...new Set(submittedAndApprovedPlans.map(plan => Number(plan.organization)))];

    const orgBudgetMap: Record<string, {
      organizationName: string;
      totalBudget: number;
      availableFunding: number;
      governmentBudget: number;
      sdgBudget: number;
      partnersBudget: number;
    }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      const orgId = String(plan.organization);
      const orgName = getOrganizationName(plan);

      if (!orgBudgetMap[orgId]) {
        orgBudgetMap[orgId] = {
          organizationName: orgName,
          totalBudget: 0,
          availableFunding: 0,
          governmentBudget: 0,
          sdgBudget: 0,
          partnersBudget: 0
        };
      }

      orgBudgetMap[orgId].availableFunding += Number(plan.available_funding || 0);
      orgBudgetMap[orgId].governmentBudget += Number(plan.government_budget || 0);
      orgBudgetMap[orgId].sdgBudget += Number(plan.sdg_budget || 0);
      orgBudgetMap[orgId].partnersBudget += Number(plan.partners_budget || 0);
    });

    subActivities.forEach((subActivity: any) => {
      if (!submittedAndApprovedOrgIds.includes(Number(subActivity.organization))) {
        return;
      }

      const orgId = String(subActivity.organization);
      if (orgBudgetMap[orgId]) {
        const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
          ? Number(subActivity.estimated_cost_with_tool || 0)
          : Number(subActivity.estimated_cost_without_tool || 0);

        orgBudgetMap[orgId].totalBudget += cost;
      }
    });

    return Object.values(orgBudgetMap).sort((a, b) => b.totalBudget - a.totalBudget);
  }, [directSubActivitiesData?.data, reviewedPlansData]);

  const completeBudgetChartData = useMemo(() => {
    return {
      labels: completeBudgetOverview.map(org => org.organizationName),
      datasets: [
        {
          label: 'Total Budget',
          data: completeBudgetOverview.map(org => org.totalBudget),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
        },
        {
          label: 'Available Funding',
          data: completeBudgetOverview.map(org => org.availableFunding),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
        },
        {
          label: 'Government Budget',
          data: completeBudgetOverview.map(org => org.governmentBudget),
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderColor: 'rgb(99, 102, 241)',
          borderWidth: 1,
        },
        {
          label: 'SDG Budget',
          data: completeBudgetOverview.map(org => org.sdgBudget),
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 1,
        },
        {
          label: 'Partners Budget',
          data: completeBudgetOverview.map(org => org.partnersBudget),
          backgroundColor: 'rgba(251, 146, 60, 0.8)',
          borderColor: 'rgb(251, 146, 60)',
          borderWidth: 1,
        }
      ]
    };
  }, [completeBudgetOverview]);

  const planStatusChartData = useMemo(() => {
    const statusCounts = {
      SUBMITTED: reviewedPlansData.filter(p => p.status === 'SUBMITTED').length,
      APPROVED: reviewedPlansData.filter(p => p.status === 'APPROVED').length,
      REJECTED: reviewedPlansData.filter(p => p.status === 'REJECTED').length,
    };

    return {
      labels: ['Submitted', 'Approved', 'Rejected'],
      datasets: [{
        data: [statusCounts.SUBMITTED, statusCounts.APPROVED, statusCounts.REJECTED],
        backgroundColor: [
          'rgba(251, 191, 36, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
        ],
        borderColor: [
          'rgb(251, 191, 36)',
          'rgb(34, 197, 94)',
          'rgb(239, 68, 68)',
        ],
        borderWidth: 1,
      }]
    };
  }, [reviewedPlansData]);

  const budgetDistributionChartData = useMemo(() => {
    const totals = completeBudgetOverview.reduce((acc, org) => ({
      available: acc.available + org.availableFunding,
      government: acc.government + org.governmentBudget,
      sdg: acc.sdg + org.sdgBudget,
      partners: acc.partners + org.partnersBudget,
    }), { available: 0, government: 0, sdg: 0, partners: 0 });

    return {
      labels: ['Available Funding', 'Government Budget', 'SDG Budget', 'Partners Budget'],
      datasets: [{
        data: [totals.available, totals.government, totals.sdg, totals.partners],
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(251, 146, 60, 0.8)',
        ],
        borderColor: [
          'rgb(16, 185, 129)',
          'rgb(59, 130, 246)',
          'rgb(168, 85, 247)',
          'rgb(251, 146, 60)',
        ],
        borderWidth: 1,
      }]
    };
  }, [completeBudgetOverview]);

  const monthlyTrends = useMemo(() => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => ['SUBMITTED', 'APPROVED'].includes(plan.status));

    const monthlyData: Record<string, { submissions: number; budget: number }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      if (plan.submitted_at) {
        const month = format(new Date(plan.submitted_at), 'MMM yyyy');
        if (!monthlyData[month]) {
          monthlyData[month] = { submissions: 0, budget: 0 };
        }
        monthlyData[month].submissions++;
        const planBudget = calculatePlanBudgetFromSubActivities(plan.id);
        monthlyData[month].budget += planBudget;
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) =>
      new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedMonths,
      submissions: sortedMonths.map(month => monthlyData[month].submissions),
      budgets: sortedMonths.map(month => monthlyData[month].budget)
    };
  }, [reviewedPlansData, directSubActivitiesData?.data]);

  const monthlyTrendsChartData = useMemo(() => {
    return {
      labels: monthlyTrends.labels,
      datasets: [
        {
          label: 'Submissions',
          data: monthlyTrends.submissions,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          yAxisID: 'y',
        },
        {
          label: 'Total Budget',
          data: monthlyTrends.budgets,
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          yAxisID: 'y1',
        }
      ]
    };
  }, [monthlyTrends]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <Shield className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Access Denied</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !isAuthInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Shield className="h-8 w-8 mr-3 text-blue-600" />
            Admin Analytics Dashboard
          </h1>
          <p className="mt-2 text-gray-600">
            Comprehensive analytics and insights for all plans
          </p>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
              Complete Budget Overview by Executives
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Budget analysis for organizations with submitted and approved plans
            </p>
            {completeBudgetOverview.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No budget data available</h3>
                <p className="text-gray-500">No Executives have submitted or approved plans with budget data.</p>
              </div>
            ) : (
              <div className="h-96">
                <Bar
                  data={completeBudgetChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                      title: {
                        display: true,
                        text: `Budget Overview - ${completeBudgetOverview.length} Organizations`
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Organizations'
                        },
                        ticks: {
                          maxRotation: 45,
                          minRotation: 45
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Budget Amount (ETB)'
                        },
                        ticks: {
                          callback: function(value) {
                            return 'ETB ' + Number(value).toLocaleString();
                          }
                        }
                      }
                    },
                    interaction: {
                      intersect: false,
                      mode: 'index' as const
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-600" />
                Plan Status Distribution
              </h3>
              <div className="h-64">
                <Doughnut
                  data={planStatusChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                Budget & Funding Distribution
              </h3>
              <div className="h-64">
                <Doughnut
                  data={budgetDistributionChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
              Monthly Submission Trends
            </h3>
            <div className="h-80">
              <Line
                data={monthlyTrendsChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: 'index' as const,
                    intersect: false,
                  },
                  scales: {
                    x: {
                      display: true,
                      title: {
                        display: true,
                        text: 'Month'
                      }
                    },
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      title: {
                        display: true,
                        text: 'Number of Submissions'
                      }
                    },
                    y1: {
                      type: 'linear' as const,
                      display: true,
                      position: 'right' as const,
                      title: {
                        display: true,
                        text: 'Budget Amount (ETB)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
