import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, User, Calendar, FileType, DollarSign, AlertCircle, Loader } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewTable from '../components/PlanReviewTable';

const AdminPlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  // Fetch plan data using admin-specific endpoint that returns ALL data without filtering
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['admin-plan-summary', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');

      // Use admin-detail endpoint which uses AdminPlanSerializer (no organization filtering)
      const response = await api.get(`/plans/${planId}/admin-detail/`);
      console.log('[ADMIN PLAN SUMMARY] Full API Response from /admin-detail/:', response.data);
      console.log('[ADMIN PLAN SUMMARY] Objectives:', response.data?.objectives);
      if (response.data?.objectives && response.data.objectives.length > 0) {
        console.log('[ADMIN PLAN SUMMARY] First Objective:', response.data.objectives[0]);
        console.log('[ADMIN PLAN SUMMARY] First Objective Initiatives:', response.data.objectives[0]?.initiatives);
        if (response.data.objectives[0]?.initiatives?.[0]) {
          console.log('[ADMIN PLAN SUMMARY] First Initiative:', response.data.objectives[0].initiatives[0]);
          console.log('[ADMIN PLAN SUMMARY] First Initiative Measures:', response.data.objectives[0].initiatives[0]?.performance_measures);
          console.log('[ADMIN PLAN SUMMARY] First Initiative Activities:', response.data.objectives[0].initiatives[0]?.main_activities);
        }
      }
      return response.data;
    },
    enabled: !!planId,
    retry: 2,
  });

  const plan = planData;

  const calculateStatistics = () => {
    console.log('AdminPlanSummary: calculateStatistics called with plan:', plan);

    if (!plan?.objectives) {
      console.log('AdminPlanSummary: No objectives in plan');
      return {
        objectivesCount: 0,
        initiativesCount: 0,
        measuresCount: 0,
        activitiesCount: 0,
        subActivitiesCount: 0,
      };
    }

    let objectivesCount = plan.objectives.length;
    let initiativesCount = 0;
    let measuresCount = 0;
    let activitiesCount = 0;
    let subActivitiesCount = 0;

    console.log(`AdminPlanSummary: Calculating statistics for ${objectivesCount} objectives`);

    plan.objectives.forEach((objective: any, objIdx: number) => {
      console.log(`AdminPlanSummary: Objective ${objIdx} (${objective.title}): has ${objective.initiatives?.length || 0} initiatives`);

      if (objective.initiatives) {
        initiativesCount += objective.initiatives.length;
        objective.initiatives.forEach((initiative: any, initIdx: number) => {
          console.log(`AdminPlanSummary:   Initiative ${initIdx} (${initiative.name}): measures=${initiative.performance_measures?.length || 0}, activities=${initiative.main_activities?.length || 0}`);

          if (initiative.performance_measures) {
            measuresCount += initiative.performance_measures.length;
          }
          if (initiative.main_activities) {
            activitiesCount += initiative.main_activities.length;
            initiative.main_activities.forEach((activity: any) => {
              if (activity.sub_activities) {
                subActivitiesCount += activity.sub_activities.length;
              }
            });
          }
        });
      }
    });

    console.log(`AdminPlanSummary: Final statistics - Objectives: ${objectivesCount}, Initiatives: ${initiativesCount}, Measures: ${measuresCount}, Activities: ${activitiesCount}, SubActivities: ${subActivitiesCount}`);

    return {
      objectivesCount,
      initiativesCount,
      measuresCount,
      activitiesCount,
      subActivitiesCount,
    };
  };

  const statistics = calculateStatistics();

  const calculateBudgetSummary = () => {
    let totalRequired = 0;
    let governmentTreasury = 0;
    let sdgFunding = 0;
    let partnersFunding = 0;
    let otherFunding = 0;

    if (!plan?.objectives || plan.objectives.length === 0) {
      return {
        totalRequired: 0,
        totalAllocated: 0,
        fundingGap: 0,
        governmentTreasury: 0,
        sdgFunding: 0,
        partnersFunding: 0,
        otherFunding: 0,
      };
    }

    plan.objectives.forEach((objective: any) => {
      if (!objective.initiatives) return;

      objective.initiatives.forEach((initiative: any) => {
        if (!initiative || !initiative.main_activities) return;

        initiative.main_activities.forEach((activity: any) => {
          if (activity.sub_activities && activity.sub_activities.length > 0) {
            activity.sub_activities.forEach((subActivity: any) => {
              const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                ? Number(subActivity.estimated_cost_with_tool || 0)
                : Number(subActivity.estimated_cost_without_tool || 0);

              totalRequired += cost;
              governmentTreasury += Number(subActivity.government_treasury || 0);
              sdgFunding += Number(subActivity.sdg_funding || 0);
              partnersFunding += Number(subActivity.partners_funding || 0);
              otherFunding += Number(subActivity.other_funding || 0);
            });
          } else if (activity.budget) {
            const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
              ? Number(activity.budget.estimated_cost_with_tool || 0)
              : Number(activity.budget.estimated_cost_without_tool || 0);

            totalRequired += cost;
            governmentTreasury += Number(activity.budget.government_treasury || 0);
            sdgFunding += Number(activity.budget.sdg_funding || 0);
            partnersFunding += Number(activity.budget.partners_funding || 0);
            otherFunding += Number(activity.budget.other_funding || 0);
          }
        });
      });
    });

    const totalAllocated = governmentTreasury + sdgFunding + partnersFunding + otherFunding;
    const fundingGap = Math.max(0, totalRequired - totalAllocated);

    return {
      totalRequired,
      totalAllocated,
      fundingGap,
      governmentTreasury,
      sdgFunding,
      partnersFunding,
      otherFunding,
    };
  };

  const budgetSummary = calculateBudgetSummary();

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading plan details...</span>
      </div>
    );
  }

  if (planError || !plan) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan</h3>
          <p className="text-red-600 mb-2">{(planError as Error)?.message || 'Plan not found'}</p>
          <button
            onClick={() => navigate('/admin')}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!plan.objectives || plan.objectives.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">No Data Available</h3>
          <p className="text-yellow-600">This plan has no objectives or data to display.</p>
          <button
            onClick={() => navigate('/admin')}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin')}
          className="flex items-center text-gray-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Admin Dashboard
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan Summary (Admin View)</h1>
            <p className="text-gray-600 mt-1">
              Complete plan details and budget breakdown for {plan.organization_name || 'Organization'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Organization</p>
              <p className="font-medium text-gray-900">{plan.organization_name || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <User className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Planner</p>
              <p className="font-medium text-gray-900">{plan.planner_name || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <FileType className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Plan Type</p>
              <p className="font-medium text-gray-900">{plan.type || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Period</p>
              <p className="font-medium text-gray-900">
                {plan.from_date && plan.to_date
                  ? `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}`
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-600 font-medium">Objectives</p>
          <p className="text-2xl font-bold text-blue-900">{statistics.objectivesCount}</p>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <p className="text-sm text-green-600 font-medium">Initiatives</p>
          <p className="text-2xl font-bold text-green-900">{statistics.initiativesCount}</p>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <p className="text-sm text-purple-600 font-medium">Measures</p>
          <p className="text-2xl font-bold text-purple-900">{statistics.measuresCount}</p>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-sm text-orange-600 font-medium">Activities</p>
          <p className="text-2xl font-bold text-orange-900">{statistics.activitiesCount}</p>
        </div>

        <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
          <p className="text-sm text-pink-600 font-medium">Sub-Activities</p>
          <p className="text-2xl font-bold text-pink-900">{statistics.subActivitiesCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center">
            <DollarSign className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Budget Summary</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Required</p>
              <p className="text-2xl font-bold text-gray-900">
                ETB {budgetSummary.totalRequired.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Allocated</p>
              <p className="text-2xl font-bold text-green-600">
                ETB {budgetSummary.totalAllocated.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Funding Gap</p>
              <p className="text-2xl font-bold text-red-600">
                ETB {budgetSummary.fundingGap.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Funding Coverage</p>
              <p className="text-2xl font-bold text-blue-600">
                {budgetSummary.totalRequired > 0
                  ? Math.round((budgetSummary.totalAllocated / budgetSummary.totalRequired) * 100)
                  : 0}%
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Funding Sources</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Government Treasury</p>
                <p className="text-lg font-semibold text-gray-900">
                  ETB {budgetSummary.governmentTreasury.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">SDG Funding</p>
                <p className="text-lg font-semibold text-gray-900">
                  ETB {budgetSummary.sdgFunding.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Partners Funding</p>
                <p className="text-lg font-semibold text-gray-900">
                  ETB {budgetSummary.partnersFunding.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Other Funding</p>
                <p className="text-lg font-semibold text-gray-900">
                  ETB {budgetSummary.otherFunding.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Plan Details</h3>
        </div>
        <div className="p-6">
          <PlanReviewTable
            objectives={plan.objectives || []}
            onSubmit={async () => {}}
            isSubmitting={false}
            organizationName={plan.organization_name || ''}
            plannerName={plan.planner_name || ''}
            fromDate={plan.from_date || ''}
            toDate={plan.to_date || ''}
            planType={plan.type || 'ANNUAL'}
            isViewOnly={true}
            plannerOrgId={null}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminPlanSummary;
