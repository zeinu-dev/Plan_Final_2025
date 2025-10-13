import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, AlertCircle, CheckCircle, ArrowLeft, Loader, Save } from 'lucide-react';
import { api } from '../lib/api';
import { REPORT_TYPES, Report, ReportPlanData, PerformanceAchievement, ActivityAchievement } from '../types/report';
import { HorizontalMEReportTable } from '../components/HorizontalMEReportTable';
import { BudgetUtilizationForm } from '../components/BudgetUtilizationForm';

const Reporting: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan');

  const [step, setStep] = useState(1);
  const [selectedReportType, setSelectedReportType] = useState('');
  const [reportId, setReportId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [narrativeFile, setNarrativeFile] = useState<File | null>(null);

  const [performanceAchievements, setPerformanceAchievements] = useState<Record<number, PerformanceAchievement>>({});
  const [activityAchievements, setActivityAchievements] = useState<Record<number, ActivityAchievement>>({});
  const [budgetUtilizations, setBudgetUtilizations] = useState<Record<number, any>>({});
  const [currentReport, setCurrentReport] = useState<Report | null>(null);

  const { data: approvedPlan, isLoading: isLoadingApprovedPlan, error: planError } = useQuery({
    queryKey: ['approved-plan', planId],
    queryFn: async () => {
      if (!planId) return null;
      const response = await api.get(`/plans/${planId}/`);
      console.log('Plan data:', response.data);
      if (response.data.status !== 'APPROVED') {
        throw new Error('Plan is not approved. Only approved plans can be reported on.');
      }
      return response.data;
    },
    enabled: !!planId,
    retry: false
  });

  const { data: planData, isLoading: isLoadingPlan, error: planDataError, refetch: refetchPlanData } = useQuery({
    queryKey: ['report-plan-data', reportId],
    queryFn: async () => {
      if (!reportId) {
        console.log('Query function called but no reportId');
        return null;
      }
      console.log('=== FETCHING PLAN DATA ===');
      console.log('Report ID:', reportId);
      console.log('Step:', step);

      const response = await api.get(`/reports/${reportId}/plan_data/`);
      console.log('Plan data response:', response.data);
      console.log('Plan data array:', response.data.plan_data);
      console.log('Plan data length:', response.data.plan_data?.length);
      console.log('Plan data type:', typeof response.data.plan_data);
      console.log('Is array?', Array.isArray(response.data.plan_data));

      // If no plan data, fetch debug info
      if (!response.data.plan_data || response.data.plan_data.length === 0) {
        console.log('No plan data found, fetching debug info...');
        try {
          const debugResponse = await api.get(`/reports/${reportId}/debug_plan_structure/`);
          console.log('DEBUG - Plan structure:', JSON.stringify(debugResponse.data, null, 2));

          // Log specific details
          if (debugResponse.data.objectives) {
            console.log('Objectives count:', debugResponse.data.objectives.length);
            debugResponse.data.objectives.forEach((obj: any, idx: number) => {
              console.log(`\nObjective ${idx + 1}: ${obj.title}`);
              console.log(`  Initiatives count: ${obj.initiatives?.length || 0}`);
              obj.initiatives?.forEach((init: any) => {
                console.log(`    Initiative: ${init.name}`);
                console.log(`      Organization: ${init.organization}`);
                console.log(`      Measures: ${init.measures?.length || 0}`);
                console.log(`      Activities: ${init.activities?.length || 0}`);

                init.measures?.forEach((m: any) => {
                  console.log(`        Measure: ${m.name}, Type: ${m.target_type}, Org: ${m.organization}`);
                  console.log(`          Targets: Q1=${m.q1_target}, Q2=${m.q2_target}, Q3=${m.q3_target}, Q4=${m.q4_target}, Annual=${m.annual_target}`);
                });

                init.activities?.forEach((a: any) => {
                  console.log(`        Activity: ${a.name}, Type: ${a.target_type}, Org: ${a.organization}`);
                  console.log(`          Targets: Q1=${a.q1_target}, Q2=${a.q2_target}, Q3=${a.q3_target}, Q4=${a.q4_target}, Annual=${a.annual_target}`);
                });
              });
            });
          }
        } catch (debugError) {
          console.error('Failed to fetch debug info:', debugError);
        }
      }

      return response.data;
    },
    enabled: !!reportId && (step === 2 || step === 3 || step === 4),
    retry: 1
  });

  // Log whenever query conditions change
  React.useEffect(() => {
    console.log('=== QUERY CONDITIONS ===');
    console.log('reportId:', reportId);
    console.log('step:', step);
    console.log('enabled:', !!reportId && (step === 2 || step === 3 || step === 4));
    console.log('isLoadingPlan:', isLoadingPlan);
    console.log('planData:', planData);
  }, [reportId, step, isLoadingPlan, planData]);

  const { data: existingAchievements } = useQuery({
    queryKey: ['report-achievements', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      const [perfResponse, actResponse, budgetResponse] = await Promise.all([
        api.get('/performance-achievements/', { params: { report: reportId } }),
        api.get('/activity-achievements/', { params: { report: reportId } }),
        api.get('/budget-utilizations/', { params: { report: reportId } })
      ]);

      const perfAchievements: Record<number, PerformanceAchievement> = {};
      const actAchievements: Record<number, ActivityAchievement> = {};
      const budgetUtils: Record<number, any> = {};

      (perfResponse.data?.results || perfResponse.data || []).forEach((pa: PerformanceAchievement) => {
        perfAchievements[pa.performance_measure] = pa;
      });

      (actResponse.data?.results || actResponse.data || []).forEach((aa: ActivityAchievement) => {
        actAchievements[aa.main_activity] = aa;
      });

      (budgetResponse.data?.results || budgetResponse.data || []).forEach((bu: any) => {
        budgetUtils[bu.sub_activity] = bu;
      });

      setPerformanceAchievements(perfAchievements);
      setActivityAchievements(actAchievements);
      setBudgetUtilizations(budgetUtils);

      return {
        perfAchievements,
        actAchievements,
        budgetUtils,
        performance: perfResponse.data?.results || perfResponse.data || [],
        activities: actResponse.data?.results || actResponse.data || [],
        budgets: budgetResponse.data?.results || budgetResponse.data || []
      };
    },
    enabled: !!reportId && (step === 2 || step === 3 || step === 4)
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: { plan: number; report_type: string }) => {
      try {
        const checkResponse = await api.get('/reports/', {
          params: {
            plan: data.plan,
            report_type: data.report_type
          }
        });

        const existingReports = checkResponse.data?.results || checkResponse.data || [];
        const existingReport = existingReports.find(
          (r: any) => r.plan === data.plan && r.report_type === data.report_type
        );

        if (existingReport) {
          if (existingReport.status === 'APPROVED') {
            throw new Error('This report has been approved and cannot be modified.');
          }
          if (existingReport.status === 'SUBMITTED') {
            throw new Error('This report is currently under review and cannot be modified.');
          }
          return existingReport;
        }

        const response = await api.post('/reports/', data);
        return response.data;
      } catch (error: any) {
        if (error.message) {
          throw error;
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      setReportId(data.id);
      setCurrentReport(data);

      if (data.status === 'REJECTED') {
        setStep(2);
        setSuccess('Report loaded. Please review the feedback and update your achievements.');
      } else if (data.submitted_at) {
        setStep(2);
        setSuccess('Loading existing report...');
      } else {
        setStep(2);
        setSuccess('Report created successfully. Please enter achievement data.');
      }
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      console.error('Report creation error:', err);
      console.error('Error response:', err.response?.data);

      let errorMessage = 'Failed to create report';

      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.non_field_errors?.[0]) {
        errorMessage = err.response.data.non_field_errors[0];
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setTimeout(() => setError(null), 8000);
    }
  });

  const saveAchievementsMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error('No report ID');

      const performancePromises = Object.values(performanceAchievements).map(achievement => {
        if (achievement.id) {
          return api.put(`/performance-achievements/${achievement.id}/`, achievement);
        } else {
          return api.post('/performance-achievements/', achievement);
        }
      });

      const activityPromises = Object.values(activityAchievements).map(achievement => {
        if (achievement.id) {
          return api.put(`/activity-achievements/${achievement.id}/`, achievement);
        } else {
          return api.post('/activity-achievements/', achievement);
        }
      });

      await Promise.all([...performancePromises, ...activityPromises]);
    },
    onSuccess: () => {
      setStep(3);
      setSuccess('Achievements saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      setError('Failed to save achievements');
      setTimeout(() => setError(null), 5000);
    }
  });

  const saveBudgetUtilizationsMutation = useMutation({
    mutationFn: async (utilizations: any[]) => {
      if (!reportId) throw new Error('No report ID');

      console.log('Saving budget utilizations:', {
        report_id: reportId,
        budget_utilizations: utilizations,
        count: utilizations.length
      });

      const response = await api.post('/budget-utilizations/bulk_create_or_update/', {
        report_id: reportId,
        budget_utilizations: utilizations
      });

      console.log('Save response:', response);
      return response;
    },
    onSuccess: () => {
      setStep(4);
      setSuccess('Budget utilization saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      console.error('Failed to save budget utilization:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to save budget utilization';
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    }
  });

  const submitReportMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error('No report ID');

      if (narrativeFile) {
        const formData = new FormData();
        formData.append('narrative_report', narrativeFile);
        await api.patch(`/reports/${reportId}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      if (currentReport?.status === 'REJECTED') {
        await api.post(`/reports/${reportId}/resubmit/`);
      } else {
        await api.post(`/reports/${reportId}/submit/`);
      }
    },
    onSuccess: () => {
      setSuccess('Report submitted successfully!');
      setStep(5);
    },
    onError: (err: any) => {
      setError('Failed to submit report');
      setTimeout(() => setError(null), 5000);
    }
  });

  const handleReportTypeSelect = () => {
    if (!selectedReportType) {
      setError('Please select a report type');
      return;
    }

    if (!planId) {
      setError('No plan selected');
      return;
    }

    createReportMutation.mutate({
      plan: parseInt(planId),
      report_type: selectedReportType
    });
  };

  const handlePerformanceAchievementChange = (measureId: number, field: 'achievement' | 'justification', value: any) => {
    setPerformanceAchievements(prev => ({
      ...prev,
      [measureId]: {
        ...prev[measureId],
        report: reportId!,
        performance_measure: measureId,
        [field]: value
      }
    }));
  };

  const handleActivityAchievementChange = (activityId: number, field: 'achievement' | 'justification', value: any) => {
    setActivityAchievements(prev => ({
      ...prev,
      [activityId]: {
        ...prev[activityId],
        report: reportId!,
        main_activity: activityId,
        [field]: value
      }
    }));
  };

  const handleSaveAchievements = () => {
    const allPerformanceValid = planData?.plan_data?.every((initiative: ReportPlanData) =>
      initiative.performance_measures.every(measure => {
        const achievement = performanceAchievements[measure.id];
        return achievement && achievement.achievement !== undefined && achievement.justification;
      })
    );

    const allActivitiesValid = planData?.plan_data?.every((initiative: ReportPlanData) =>
      initiative.main_activities.every(activity => {
        const achievement = activityAchievements[activity.id];
        return achievement && achievement.achievement !== undefined && achievement.justification;
      })
    );

    if (!allPerformanceValid || !allActivitiesValid) {
      setError('Please fill in all achievement and justification fields');
      return;
    }

    saveAchievementsMutation.mutate();
  };

  const handleFinishReporting = () => {
    submitReportMutation.mutate();
  };

  const getMEReportData = () => {
    if (!planData?.plan_data || !existingAchievements) {
      console.log('getMEReportData: Missing data', { planData, existingAchievements });
      return [];
    }

    if (!existingAchievements.performance || !existingAchievements.activities) {
      console.log('getMEReportData: Missing achievement arrays', existingAchievements);
      return [];
    }

    console.log('getMEReportData: budgetUtilizations state:', budgetUtilizations);
    console.log('getMEReportData: plan_data:', planData.plan_data);

    const objectivesMap = new Map();

    planData.plan_data.forEach((initiative: ReportPlanData) => {
      if (!objectivesMap.has(initiative.objective_id)) {
        objectivesMap.set(initiative.objective_id, {
          id: initiative.objective_id,
          title: initiative.objective_title,
          weight: initiative.objective_weight,
          initiatives: []
        });
      }

      const objective = objectivesMap.get(initiative.objective_id);

      const performanceMeasures = initiative.performance_measures.map(measure => {
        const achievement = existingAchievements.performance.find(
          (a: any) => a.performance_measure === measure.id
        );
        return {
          id: measure.id,
          name: measure.name,
          weight: measure.weight,
          target: measure.target,
          achievement: achievement?.achievement || 0,
          justification: achievement?.justification || ''
        };
      });

      const mainActivities = initiative.main_activities.map(activity => {
        const achievement = existingAchievements.activities.find(
          (a: any) => a.main_activity === activity.id
        );

        console.log(`Activity ${activity.id} (${activity.name}):`, {
          has_sub_activities: !!activity.sub_activities,
          sub_activities_count: activity.sub_activities?.length || 0,
          sub_activities: activity.sub_activities
        });

        const subActivities = activity.sub_activities?.map((subActivity: any) => {
          const util = budgetUtilizations[subActivity.id];
          console.log(`Sub-activity ${subActivity.id}:`, {
            budget: {
              gov: subActivity.government_treasury,
              sdg: subActivity.sdg_funding,
              partners: subActivity.partners_funding,
              other: subActivity.other_funding
            },
            utilization: util,
            util_found: !!util
          });

          return {
            id: subActivity.id,
            name: subActivity.name,
            government_treasury: Number(subActivity.government_treasury) || 0,
            sdg_funding: Number(subActivity.sdg_funding) || 0,
            partners_funding: Number(subActivity.partners_funding) || 0,
            other_funding: Number(subActivity.other_funding) || 0,
            government_treasury_utilized: Number(util?.government_treasury_utilized) || 0,
            sdg_funding_utilized: Number(util?.sdg_funding_utilized) || 0,
            partners_funding_utilized: Number(util?.partners_funding_utilized) || 0,
            other_funding_utilized: Number(util?.other_funding_utilized) || 0,
          };
        }) || [];

        console.log(`Final subActivities for ${activity.name}:`, subActivities);

        return {
          id: activity.id,
          name: activity.name,
          weight: activity.weight,
          target: activity.target,
          achievement: achievement?.achievement || 0,
          justification: achievement?.justification || '',
          subActivities
        };
      });

      objective.initiatives.push({
        id: initiative.initiative_id,
        name: initiative.initiative_name,
        weight: initiative.initiative_weight,
        performanceMeasures,
        mainActivities
      });
    });

    return Array.from(objectivesMap.values());
  };

  if (!planId) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-red-600 inline mr-2" />
          <span className="text-red-700">No plan selected. Please go back to planning page.</span>
        </div>
      </div>
    );
  }

  if (isLoadingApprovedPlan) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading plan details...</span>
      </div>
    );
  }

  if (planError || !approvedPlan) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-red-600 inline mr-2" />
          <span className="text-red-700">
            {planError ? (planError as any).message || 'Failed to load plan' : 'Plan not found'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/planning')}
          className="mr-4 p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Progress Report</h1>
          <p className="text-gray-600">
            {approvedPlan ? `Plan: ${approvedPlan.type} - ${approvedPlan.from_date} to ${approvedPlan.to_date}` : 'Report on your approved plan achievements'}
          </p>
        </div>
      </div>

      {planDataError && step === 2 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 inline mr-2" />
          <span className="text-red-700">
            Failed to load plan data: {(planDataError as any)?.response?.data?.error || (planDataError as any)?.message || 'Unknown error'}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {s}
              </div>
              {s < 4 && <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-green-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-sm text-gray-600">Select Report Type</span>
          <span className="text-sm text-gray-600">Enter Achievements</span>
          <span className="text-sm text-gray-600">Upload & Submit</span>
          <span className="text-sm text-gray-600">M&E Report</span>
        </div>
      </div>

      {step === 1 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Step 1: Select Report Type</h2>
          <p className="text-gray-600 mb-4">Choose the reporting period for this progress report</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedReportType(type.value)}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  selectedReportType === type.value
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <FileText className="h-6 w-6 mb-2 text-green-600" />
                <div className="font-medium">{type.label}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleReportTypeSelect}
              disabled={!selectedReportType || createReportMutation.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {createReportMutation.isPending ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Step 2: Enter Achievement Data</h2>
          <p className="text-gray-600 mb-4">Fill in the actual achievements for each target</p>

          {currentReport?.status === 'REJECTED' && currentReport.evaluator_feedback && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Report Rejected - Feedback from Evaluator</h3>
                  <p className="text-sm text-red-700 whitespace-pre-wrap">{currentReport.evaluator_feedback}</p>
                  {currentReport.evaluator_name && (
                    <p className="text-xs text-red-600 mt-2">
                      Evaluated by: {currentReport.evaluator_name} on{' '}
                      {currentReport.evaluated_at && new Date(currentReport.evaluated_at).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-sm text-red-800 font-medium mt-2">
                    Please review the feedback and update your achievements accordingly before resubmitting.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(() => {
            console.log('=== RENDERING STEP 2 ===');
            console.log('isLoadingPlan:', isLoadingPlan);
            console.log('planData:', planData);
            console.log('planData?.plan_data:', planData?.plan_data);
            console.log('planData?.plan_data?.length:', planData?.plan_data?.length);
            return null;
          })()}

          {isLoadingPlan ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin mr-2" />
              <span>Loading plan data...</span>
            </div>
          ) : !planData?.plan_data || planData.plan_data.length === 0 ? (
            <div className="text-center py-12 bg-yellow-50 rounded-lg border border-yellow-200">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Data Found</h3>
              <p className="text-gray-600 mb-4">
                No targets were found for the selected report period. This could mean:
              </p>
              <ul className="text-left text-gray-600 max-w-md mx-auto list-disc list-inside space-y-1">
                <li>The plan has no activities or performance measures</li>
                <li>No targets were set for this reporting period</li>
                <li>The plan structure may need to be reviewed</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-6">
              {planData.plan_data.map((initiative: ReportPlanData, idx: number) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold text-lg">{initiative.objective_title}</h3>
                    <p className="text-sm text-gray-600">Weight: {initiative.objective_weight}%</p>
                    <p className="text-sm text-gray-700 mt-1">{initiative.initiative_name}</p>
                  </div>

                  {initiative.performance_measures.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-medium mb-2">Performance Measures</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Measure</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Weight</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Target</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Achievement</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Justification</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {initiative.performance_measures.map((measure) => (
                              <tr key={measure.id}>
                                <td className="px-4 py-2 text-sm">{measure.name}</td>
                                <td className="px-4 py-2 text-sm">{measure.weight}%</td>
                                <td className="px-4 py-2 text-sm">{measure.target}</td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    value={performanceAchievements[measure.id]?.achievement || ''}
                                    onChange={(e) => handlePerformanceAchievementChange(measure.id, 'achievement', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <textarea
                                    value={performanceAchievements[measure.id]?.justification || ''}
                                    onChange={(e) => handlePerformanceAchievementChange(measure.id, 'justification', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                    rows={2}
                                    placeholder="Explain achievement..."
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {initiative.main_activities.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Main Activities</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Activity</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Weight</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Target</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Achievement</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Justification</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {initiative.main_activities.map((activity) => (
                              <tr key={activity.id}>
                                <td className="px-4 py-2 text-sm">{activity.name}</td>
                                <td className="px-4 py-2 text-sm">{activity.weight}%</td>
                                <td className="px-4 py-2 text-sm">{activity.target}</td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    value={activityAchievements[activity.id]?.achievement || ''}
                                    onChange={(e) => handleActivityAchievementChange(activity.id, 'achievement', parseFloat(e.target.value))}
                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <textarea
                                    value={activityAchievements[activity.id]?.justification || ''}
                                    onChange={(e) => handleActivityAchievementChange(activity.id, 'justification', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                    rows={2}
                                    placeholder="Explain achievement..."
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSaveAchievements}
              disabled={saveAchievementsMutation.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
            >
              {saveAchievementsMutation.isPending ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Proceed
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Step 3: Budget Utilization</h2>
          <p className="text-gray-600 mb-4">Enter the budget utilized for each sub-activity by funding source</p>

          <BudgetUtilizationForm
            planData={planData}
            reportId={reportId!}
            onSave={async (utilizations) => {
              await saveBudgetUtilizationsMutation.mutateAsync(utilizations);
            }}
            onBack={() => setStep(2)}
            isLoading={isLoadingPlan}
            existingUtilizations={budgetUtilizations}
          />
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Step 4: Upload Narrative Report & Submit</h2>
          <p className="text-gray-600 mb-4">Attach your narrative report document (Word or Excel format)</p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <input
              type="file"
              accept=".doc,.docx,.xls,.xlsx,.pdf"
              onChange={(e) => setNarrativeFile(e.target.files?.[0] || null)}
              className="hidden"
              id="narrative-upload"
            />
            <label htmlFor="narrative-upload" className="cursor-pointer">
              <span className="text-green-600 hover:text-green-700 font-medium">
                Click to upload
              </span>
              <span className="text-gray-600"> or drag and drop</span>
            </label>
            <p className="text-sm text-gray-500 mt-2">
              DOC, DOCX, XLS, XLSX, or PDF (max 10MB)
            </p>
            {narrativeFile && (
              <div className="mt-4 text-sm text-green-600">
                Selected: {narrativeFile.name}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleFinishReporting}
              disabled={submitReportMutation.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
            >
              {submitReportMutation.isPending ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  {currentReport?.status === 'REJECTED' ? 'Resubmitting...' : 'Submitting...'}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {currentReport?.status === 'REJECTED' ? 'Resubmit Report' : 'Finish Reporting'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-green-700 font-medium">Report submitted successfully!</span>
          </div>

          {isLoadingPlan || !existingAchievements ? (
            <div className="flex items-center justify-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
              <Loader className="h-6 w-6 animate-spin mr-2" />
              <span>Loading M&E report data...</span>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <HorizontalMEReportTable
                objectives={getMEReportData()}
                organizationName={approvedPlan?.organization_name || 'Organization'}
                reportType={selectedReportType}
                reportDate={new Date().toISOString()}
                plannerName={approvedPlan?.planner_name}
              />
            </div>
          )}

          <div className="flex justify-center mt-6">
            <button
              onClick={() => navigate('/planning')}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Planning
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reporting;
