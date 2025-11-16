import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, AlertCircle, CheckCircle, ArrowLeft, Loader, Save, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { REPORT_TYPES, Report, ReportPlanData, PerformanceAchievement, ActivityAchievement } from '../types/report';
import { HorizontalMEReportTable } from '../components/HorizontalMEReportTable';
import { BudgetUtilizationForm } from '../components/BudgetUtilizationForm';

// No longer needed - backend returns properly structured hierarchical data

const Reporting: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan');
  const reportIdParam = searchParams.get('report');
  const viewMode = searchParams.get('view') === 'true';

  const [step, setStep] = useState(viewMode ? 6 : 1);
  const [selectedReportType, setSelectedReportType] = useState('');
  const [reportId, setReportId] = useState<number | null>(reportIdParam ? parseInt(reportIdParam) : null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [narrativeFile, setNarrativeFile] = useState<File | null>(null);

  const [performanceAchievements, setPerformanceAchievements] = useState<Record<number, PerformanceAchievement>>({});
  const [activityAchievements, setActivityAchievements] = useState<Record<number, ActivityAchievement>>({});
  const [budgetUtilizations, setBudgetUtilizations] = useState<Record<number, any>>({});
  const [currentReport, setCurrentReport] = useState<Report | null>(null);

  const { data: existingReport } = useQuery({
    queryKey: ['existing-report', reportIdParam],
    queryFn: async () => {
      if (!reportIdParam) return null;
      const response = await api.get(`/reports/${reportIdParam}/`);
      const report = response.data;
      setCurrentReport(report);
      setSelectedReportType(report.report_type);
      return report;
    },
    enabled: !!reportIdParam && viewMode
  });

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
      console.log('Objectives data:', response.data.objectives);
      console.log('Objectives length:', response.data.objectives?.length);
      console.log('Objectives type:', typeof response.data.objectives);
      console.log('Is array?', Array.isArray(response.data.objectives));

      // If no objectives data, fetch debug info
      if (!response.data.objectives || response.data.objectives.length === 0) {
        console.log('No objectives data found, fetching debug info...');
        try {
          const debugResponse = await api.get(`/reports/${reportId}/debug_plan_structure/`);
          console.log('DEBUG - Plan structure:', JSON.stringify(debugResponse.data, null, 2));
        } catch (debugError) {
          console.error('Failed to fetch debug info:', debugError);
        }
      }

      return response.data;
    },
    enabled: !!reportId && (step === 2 || step === 3 || step === 4 || step === 6),
    retry: 1
  });

  // Use hierarchical data directly (no need to group)
  const groupedPlanData = useMemo(() => {
    if (!planData?.objectives || planData.objectives.length === 0) {
      return [];
    }
    // Data is already properly structured from backend
    console.log('✓ Using hierarchical objectives data:', planData.objectives);
    return planData.objectives;
  }, [planData]);

  // Log whenever query conditions change
  React.useEffect(() => {
    console.log('=== QUERY CONDITIONS ===');
    console.log('reportId:', reportId);
    console.log('step:', step);
    console.log('enabled:', !!reportId && (step === 2 || step === 3 || step === 4));
    console.log('isLoadingPlan:', isLoadingPlan);
    console.log('planData:', planData);
    console.log('groupedPlanData:', groupedPlanData);
  }, [reportId, step, isLoadingPlan, planData, groupedPlanData]);

  const { data: existingAchievements } = useQuery({
    queryKey: ['report-achievements', reportId, selectedReportType],
    queryFn: async () => {
      if (!reportId) return null;

      console.log(`Fetching achievements for report ${reportId} (${selectedReportType})`);

      const [perfResponse, actResponse, budgetResponse] = await Promise.all([
        api.get('/performance-achievements/', { params: { report: reportId } }),
        api.get('/activity-achievements/', { params: { report: reportId } }),
        api.get('/budget-utilizations/', { params: { report: reportId } })
      ]);

      console.log('Performance achievements fetched:', perfResponse.data?.results || perfResponse.data || []);
      console.log('Activity achievements fetched:', actResponse.data?.results || actResponse.data || []);

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
    enabled: !!reportId && (step === 2 || step === 3 || step === 4 || step === 5 || step === 6)
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

      const performanceAchievementsList = Object.values(performanceAchievements);
      const activityAchievementsList = Object.values(activityAchievements);

      console.log('Saving achievements:', {
        report_id: reportId,
        performance_count: performanceAchievementsList.length,
        activity_count: activityAchievementsList.length
      });

      const promises = [];

      if (performanceAchievementsList.length > 0) {
        promises.push(
          api.post('/performance-achievements/bulk_create_or_update/', {
            report_id: reportId,
            achievements: performanceAchievementsList
          })
        );
      }

      if (activityAchievementsList.length > 0) {
        promises.push(
          api.post('/activity-achievements/bulk_create_or_update/', {
            report_id: reportId,
            achievements: activityAchievementsList
          })
        );
      }

      const results = await Promise.all(promises);
      console.log('Save results:', results);
      return results;
    },
    onSuccess: () => {
      setStep(3);
      setSuccess('Achievements saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      console.error('Failed to save achievements:', err);
      console.error('Error response:', err.response?.data);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save achievements';
      setError(errorMsg);
      setTimeout(() => setError(null), 8000);
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
      queryClient.invalidateQueries({ queryKey: ['report-achievements', reportId] });
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

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error('No report ID');

      console.log('=== SAVING DRAFT ===');
      console.log('Report ID:', reportId);

      // Upload narrative file if provided
      if (narrativeFile) {
        console.log('Uploading narrative file:', narrativeFile.name);
        const formData = new FormData();
        formData.append('narrative_report', narrativeFile);

        const uploadResponse = await api.patch(`/reports/${reportId}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log('File upload response:', uploadResponse);
      }

      // Update report status to DRAFT
      const response = await api.patch(`/reports/${reportId}/`, { status: 'DRAFT' });
      console.log('Draft saved response:', response);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSuccess('Report saved as draft. You can continue later from the dashboard.');
      setTimeout(() => {
        setSuccess(null);
        navigate('/dashboard');
      }, 2000);
    },
    onError: (err: any) => {
      console.error('Save draft error:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save draft';
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  });

  const submitReportMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error('No report ID');

      console.log('=== SUBMITTING REPORT ===');
      console.log('Report ID:', reportId);
      console.log('Current report status:', currentReport?.status);
      console.log('Has narrative file:', !!narrativeFile);

      try {
        if (narrativeFile) {
          console.log('Uploading narrative file:', narrativeFile.name);
          const formData = new FormData();
          formData.append('narrative_report', narrativeFile);

          const uploadResponse = await api.patch(`/reports/${reportId}/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          console.log('File upload response:', uploadResponse);
        }

        if (currentReport?.status === 'REJECTED') {
          console.log('Resubmitting rejected report');
          const resubmitResponse = await api.post(`/reports/${reportId}/resubmit/`);
          console.log('Resubmit response:', resubmitResponse);
          return resubmitResponse;
        } else {
          console.log('Submitting new report');
          const submitResponse = await api.post(`/reports/${reportId}/submit/`);
          console.log('Submit response:', submitResponse);
          return submitResponse;
        }
      } catch (error: any) {
        console.error('Error during report submission:', error);
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSuccess('Report submitted successfully!');
      setStep(6);
    },
    onError: (err: any) => {
      console.error('Submit mutation error:', err);

      let errorMessage = 'Failed to submit report';

      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setTimeout(() => setError(null), 8000);
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

  const handlePerformanceAchievementChange = (measureId: number, field: 'achievement' | 'justification', value: any, target?: number) => {
    // Validate achievement value
    if (field === 'achievement' && value !== undefined) {
      if (value < 0) {
        setError('Achievement value cannot be negative');
        setTimeout(() => setError(null), 3000);
        return;
      }

      if (target !== undefined && value > target) {
        setError(`Achievement (${value}) cannot exceed target (${target})`);
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

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

  const handleActivityAchievementChange = (activityId: number, field: 'achievement' | 'justification', value: any, target?: number) => {
    // Validate achievement value
    if (field === 'achievement' && value !== undefined) {
      if (value < 0) {
        setError('Achievement value cannot be negative');
        setTimeout(() => setError(null), 3000);
        return;
      }

      if (target !== undefined && value > target) {
        setError(`Achievement (${value}) cannot exceed target (${target})`);
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

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
    // Check for negative values first
    const hasNegativePerformance = Object.values(performanceAchievements).some(
      achievement => achievement.achievement !== undefined && achievement.achievement < 0
    );
    const hasNegativeActivity = Object.values(activityAchievements).some(
      achievement => achievement.achievement !== undefined && achievement.achievement < 0
    );

    if (hasNegativePerformance || hasNegativeActivity) {
      setError('Achievement values cannot be negative');
      return;
    }

    // Check if achievements exceed targets
    let exceededTargetError = '';
    for (const objective of groupedPlanData) {
      for (const initiative of objective.initiatives) {
        for (const measure of initiative.performance_measures) {
          const achievement = performanceAchievements[measure.id];
          if (achievement?.achievement !== undefined && achievement.achievement > measure.target) {
            exceededTargetError = `Performance measure "${measure.name}" achievement (${achievement.achievement}) exceeds target (${measure.target})`;
            break;
          }
        }
        if (exceededTargetError) break;

        for (const activity of initiative.main_activities) {
          const achievement = activityAchievements[activity.id];
          if (achievement?.achievement !== undefined && achievement.achievement > activity.target) {
            exceededTargetError = `Activity "${activity.name}" achievement (${achievement.achievement}) exceeds target (${activity.target})`;
            break;
          }
        }
        if (exceededTargetError) break;
      }
      if (exceededTargetError) break;
    }

    if (exceededTargetError) {
      setError(exceededTargetError);
      return;
    }

    // Validate using grouped data
    const allPerformanceValid = groupedPlanData.every(objective =>
      objective.initiatives.every(initiative =>
        initiative.performance_measures.every(measure => {
          const achievement = performanceAchievements[measure.id];
          return achievement && achievement.achievement !== undefined && achievement.justification;
        })
      )
    );

    const allActivitiesValid = groupedPlanData.every(objective =>
      objective.initiatives.every(initiative =>
        initiative.main_activities.every(activity => {
          const achievement = activityAchievements[activity.id];
          return achievement && achievement.achievement !== undefined && achievement.justification;
        })
      )
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
    if (!planData?.objectives || !existingAchievements) {
      console.log('getMEReportData: Missing data', { planData, existingAchievements });
      return [];
    }

    if (!existingAchievements.performance || !existingAchievements.activities) {
      console.log('getMEReportData: Missing achievement arrays', existingAchievements);
      return [];
    }

    console.log('getMEReportData: budgetUtilizations state:', budgetUtilizations);
    console.log('getMEReportData: objectives:', planData.objectives);

    // Transform hierarchical data to ME report format with achievements
    return planData.objectives.map(objective => {
      const initiativesWithAchievements = objective.initiatives.map(initiative => {
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

        return {
          id: initiative.id,
          name: initiative.name,
          weight: initiative.weight,
          performanceMeasures,
          mainActivities
        };
      });

      return {
        id: objective.id,
        title: objective.title,
        weight: objective.weight,
        initiatives: initiativesWithAchievements
      };
    });
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

      {!viewMode && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {s}
                </div>
                {s < 5 && <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-green-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-sm text-gray-600">Select Type</span>
            <span className="text-sm text-gray-600">Achievements</span>
            <span className="text-sm text-gray-600">Budget</span>
            <span className="text-sm text-gray-600">Review M&E</span>
            <span className="text-sm text-gray-600">Submit</span>
          </div>
        </div>
      )}

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
            console.log('planData?.objectives:', planData?.objectives);
            console.log('planData?.objectives?.length:', planData?.objectives?.length);
            return null;
          })()}

          {isLoadingPlan ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin mr-2" />
              <span>Loading plan data...</span>
            </div>
          ) : !planData?.objectives || planData.objectives.length === 0 ? (
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
              {groupedPlanData.map((objective) => (
                <div key={objective.id} className="border-2 border-blue-200 rounded-lg p-6 bg-blue-50">
                  {/* Objective Header */}
                  <div className="mb-6 pb-4 border-b-2 border-blue-300">
                    <h3 className="font-bold text-xl text-blue-900">{objective.title}</h3>
                    <p className="text-sm text-blue-700 font-medium">Weight: {objective.weight}%</p>
                  </div>

                  {/* Initiatives */}
                  <div className="space-y-4">
                    {objective.initiatives.map((initiative) => (
                      <div key={initiative.id} className="border border-gray-300 rounded-lg p-4 bg-white">
                        <div className="mb-4 pb-3 border-b border-gray-200">
                          <h4 className="font-semibold text-lg text-gray-800">{initiative.name}</h4>
                          <p className="text-sm text-gray-600">Weight: {initiative.weight}%</p>
                        </div>

                        {initiative.performance_measures.length > 0 && (
                          <div className="mb-4">
                            <h5 className="font-medium mb-2 text-gray-700">Performance Measures</h5>
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
                                      <td className="px-4 py-2 text-sm font-medium text-blue-600">{measure.target}</td>
                                      <td className="px-4 py-2">
                                        <input
                                          type="number"
                                          min="0"
                                          max={measure.target}
                                          step="any"
                                          value={performanceAchievements[measure.id]?.achievement ?? ''}
                                          onChange={(e) => handlePerformanceAchievementChange(measure.id, 'achievement', e.target.value === '' ? undefined : parseFloat(e.target.value), measure.target)}
                                          className="w-full px-2 py-1 border border-gray-300 rounded"
                                          placeholder={`0 - ${measure.target}`}
                                          title={`Maximum: ${measure.target}`}
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
                            <h5 className="font-medium mb-2 text-gray-700">Main Activities</h5>
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
                                      <td className="px-4 py-2 text-sm font-medium text-blue-600">{activity.target}</td>
                                      <td className="px-4 py-2">
                                        <input
                                          type="number"
                                          min="0"
                                          max={activity.target}
                                          step="any"
                                          value={activityAchievements[activity.id]?.achievement ?? ''}
                                          onChange={(e) => handleActivityAchievementChange(activity.id, 'achievement', e.target.value === '' ? undefined : parseFloat(e.target.value), activity.target)}
                                          className="w-full px-2 py-1 border border-gray-300 rounded"
                                          placeholder={`0 - ${activity.target}`}
                                          title={`Maximum: ${activity.target}`}
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
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Save achievements first, then save as draft
                  const achievements = Object.entries(performanceAchievements).map(([id, data]) => ({
                    performance_measure: parseInt(id),
                    achievement: data.achievement,
                    justification: data.justification
                  }));

                  const activities = Object.entries(activityAchievements).map(([id, data]) => ({
                    main_activity: parseInt(id),
                    achievement: data.achievement,
                    justification: data.justification
                  }));

                  // Save achievements if any exist
                  if (achievements.length > 0 || activities.length > 0) {
                    saveAchievementsMutation.mutate({
                      report_id: reportId!,
                      performance_achievements: achievements,
                      activity_achievements: activities
                    });
                  }

                  // Then save as draft
                  setTimeout(() => {
                    saveDraftMutation.mutate();
                  }, 500);
                }}
                disabled={saveDraftMutation.isPending || saveAchievementsMutation.isPending}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center"
              >
                {saveDraftMutation.isPending || saveAchievementsMutation.isPending ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </>
                )}
              </button>
              <button
                onClick={handleSaveAchievements}
                disabled={saveAchievementsMutation.isPending || saveDraftMutation.isPending}
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
            onSaveDraft={async (utilizations) => {
              // Save budget utilizations first
              await saveBudgetUtilizationsMutation.mutateAsync(utilizations);
              // Then save as draft
              await saveDraftMutation.mutateAsync();
            }}
            onBack={() => setStep(2)}
            isLoading={isLoadingPlan}
            existingUtilizations={budgetUtilizations}
          />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Step 4: Review M&E Report</h2>
            <p className="text-gray-600 mb-4">Review your M&E report before submission. You can go back to make changes if needed.</p>

            {isLoadingPlan || !existingAchievements ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="h-6 w-6 animate-spin mr-2" />
                <span>Loading M&E report preview...</span>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg">
                <HorizontalMEReportTable
                  objectives={getMEReportData()}
                  organizationName={approvedPlan?.organization_name || 'Organization'}
                  reportType={selectedReportType}
                  reportDate={new Date().toISOString()}
                  plannerName={approvedPlan?.planner_name}
                />
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back to Budget
              </button>
              <button
                onClick={() => setStep(5)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Proceed to Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Step 5: Upload Narrative Report & Submit</h2>
          <p className="text-gray-600 mb-4">Attach your narrative report document (optional) and submit for evaluation</p>

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
              onClick={() => setStep(4)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Review
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => saveDraftMutation.mutate()}
                disabled={saveDraftMutation.isPending || submitReportMutation.isPending}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center"
              >
                {saveDraftMutation.isPending ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </>
                )}
              </button>
              <button
                onClick={handleFinishReporting}
                disabled={submitReportMutation.isPending || saveDraftMutation.isPending}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                {submitReportMutation.isPending ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    {currentReport?.status === 'REJECTED' ? 'Resubmitting...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {currentReport?.status === 'REJECTED' ? 'Resubmit Report' : 'Submit for Evaluation'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-6">
          {viewMode ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <Eye className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-blue-700 font-medium">Viewing Submitted Report</h3>
                  <p className="text-blue-600 text-sm mt-1">
                    Status: <span className="font-semibold">{currentReport?.status_display || currentReport?.status}</span>
                    {currentReport?.evaluator_name && ` • Evaluator: ${currentReport.evaluator_name}`}
                  </p>
                  {currentReport?.evaluator_feedback && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800"><strong>Evaluator Feedback:</strong> {currentReport.evaluator_feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-green-700 font-medium">Report submitted successfully and sent for evaluation!</span>
            </div>
          )}

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
