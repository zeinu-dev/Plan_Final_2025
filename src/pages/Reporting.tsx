import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, AlertCircle, CheckCircle, ArrowLeft, Loader, Save } from 'lucide-react';
import { api } from '../lib/api';
import { REPORT_TYPES, Report, ReportPlanData, PerformanceAchievement, ActivityAchievement } from '../types/report';

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

  const { data: planData, isLoading: isLoadingPlan } = useQuery({
    queryKey: ['report-plan-data', reportId],
    queryFn: async () => {
      if (!reportId) return null;
      const response = await api.get(`/reports/${reportId}/plan_data/`);
      return response.data;
    },
    enabled: !!reportId && step === 2
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: { plan: number; report_type: string }) => {
      const response = await api.post('/reports/', data);
      return response.data;
    },
    onSuccess: (data) => {
      setReportId(data.id);
      setStep(2);
      setSuccess('Report created successfully. Please enter achievement data.');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create report');
      setTimeout(() => setError(null), 5000);
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

      await api.post(`/reports/${reportId}/submit/`);
    },
    onSuccess: () => {
      setSuccess('Report submitted successfully!');
      setTimeout(() => {
        navigate('/planning');
      }, 2000);
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
          <p className="text-gray-600">Report on your approved plan achievements</p>
        </div>
      </div>

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
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {s}
              </div>
              {s < 3 && <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-green-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-sm text-gray-600">Select Report Type</span>
          <span className="text-sm text-gray-600">Enter Achievements</span>
          <span className="text-sm text-gray-600">Upload & Submit</span>
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

          {isLoadingPlan ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin mr-2" />
              <span>Loading plan data...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {planData?.plan_data?.map((initiative: ReportPlanData, idx: number) => (
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
          <h2 className="text-lg font-semibold mb-4">Step 3: Upload Narrative Report & Submit</h2>
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
              onClick={() => setStep(2)}
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
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Finish Reporting
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reporting;
