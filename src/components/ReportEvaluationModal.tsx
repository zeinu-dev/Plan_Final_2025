import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, FileText, Loader, Eye } from 'lucide-react';
import { Report } from '../types/report';
import { api } from '../lib/api';
import { HorizontalMEReportTable } from './HorizontalMEReportTable';

interface ReportEvaluationModalProps {
  report: Report;
  onClose: () => void;
}

export const ReportEvaluationModal: React.FC<ReportEvaluationModalProps> = ({ report, onClose }) => {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showMETable, setShowMETable] = useState(false);
  const queryClient = useQueryClient();

  const { data: reportData, isLoading: isLoadingReport } = useQuery({
    queryKey: ['report-plan-data', report.id],
    queryFn: async () => {
      const response = await api.get(`/reports/${report.id}/plan_data/`);
      console.log('ReportEvaluationModal - Full report data:', response.data);
      console.log('ReportEvaluationModal - ME data:', response.data.me_data);

      if (response.data.me_data) {
        response.data.me_data = response.data.me_data.map((obj: any) => ({
          ...obj,
          initiatives: obj.initiatives?.map((init: any) => ({
            ...init,
            mainActivities: init.mainActivities?.map((act: any) => {
              console.log(`Activity: ${act.name}`);
              const subActivities = (act.sub_activities || []).map((sub: any) => {
                console.log(`  Sub-activity: ${sub.name}`, {
                  government_treasury: sub.government_treasury,
                  sdg_funding: sub.sdg_funding,
                  partners_funding: sub.partners_funding,
                  other_funding: sub.other_funding,
                  government_treasury_utilized: sub.government_treasury_utilized,
                  sdg_funding_utilized: sub.sdg_funding_utilized,
                  partners_funding_utilized: sub.partners_funding_utilized,
                  other_funding_utilized: sub.other_funding_utilized
                });
                return {
                  ...sub,
                  government_treasury: Number(sub.government_treasury) || 0,
                  sdg_funding: Number(sub.sdg_funding) || 0,
                  partners_funding: Number(sub.partners_funding) || 0,
                  other_funding: Number(sub.other_funding) || 0,
                  government_treasury_utilized: Number(sub.government_treasury_utilized) || 0,
                  sdg_funding_utilized: Number(sub.sdg_funding_utilized) || 0,
                  partners_funding_utilized: Number(sub.partners_funding_utilized) || 0,
                  other_funding_utilized: Number(sub.other_funding_utilized) || 0,
                };
              });
              return {
                ...act,
                subActivities
              };
            })
          }))
        }));
      }

      return response.data;
    }
  });

  const handleDownloadNarrative = async () => {
    if (!report.narrative_report) return;

    try {
      const response = await fetch(report.narrative_report);
      if (!response.ok) {
        throw new Error('Failed to fetch file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const filename = report.narrative_report.split('/').pop() ||
                      `Narrative_Report_${report.organization_name}_${report.report_type}`;
      a.download = filename;

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (error) {
      console.error('Error downloading narrative report:', error);
      alert('Failed to download narrative report. Please try again.');
    }
  };

  const evaluateMutation = useMutation({
    mutationFn: async (data: { action: 'approve' | 'reject'; feedback: string }) => {
      const endpoint = data.action === 'approve' ? 'approve' : 'reject';
      return api.post(`/reports/${report.id}/${endpoint}/`, { feedback: data.feedback });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;

    if (action === 'reject' && !feedback.trim()) {
      alert('Feedback is required when rejecting a report');
      return;
    }

    evaluateMutation.mutate({ action, feedback });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Evaluate Report</h2>
            <p className="text-sm text-gray-600 mt-1">
              {report.organization_name} - {report.report_type_display}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Report Information</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-600">Organization</dt>
                <dd className="font-medium text-gray-900">{report.organization_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Report Type</dt>
                <dd className="font-medium text-gray-900">{report.report_type_display}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Submitted By</dt>
                <dd className="font-medium text-gray-900">{report.planner_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Submitted At</dt>
                <dd className="font-medium text-gray-900">
                  {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : 'N/A'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-600">Report Date</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(report.report_date).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-gray-600">Status</dt>
                <dd>
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                    report.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    report.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    report.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {report.status_display}
                  </span>
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-3">
              {report.narrative_report && (
                <button
                  onClick={handleDownloadNarrative}
                  className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Download Narrative Report
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMETable(!showMETable)}
                className="inline-flex items-center text-green-600 hover:text-green-800 text-sm font-medium"
              >
                <Eye className="h-4 w-4 mr-1" />
                {showMETable ? 'Hide' : 'View'} M&E Report
              </button>
            </div>
          </div>

          {showMETable && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              {isLoadingReport ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading M&E data...</span>
                </div>
              ) : reportData?.me_data ? (
                <HorizontalMEReportTable
                  objectives={reportData.me_data}
                  organizationName={report.organization_name}
                  reportType={report.report_type_display}
                  reportDate={report.report_date}
                  plannerName={report.planner_name}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No M&E data available for this report
                </div>
              )}
            </div>
          )}

          {report.status === 'SUBMITTED' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Evaluation Decision
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setAction('approve')}
                    className={`flex-1 px-4 py-3 border-2 rounded-lg transition-colors ${
                      action === 'approve'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-green-300'
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      <span className="font-semibold">Approve</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction('reject')}
                    className={`flex-1 px-4 py-3 border-2 rounded-lg transition-colors ${
                      action === 'reject'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-300 hover:border-red-300'
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <XCircle className="h-5 w-5 mr-2" />
                      <span className="font-semibold">Reject</span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                  Feedback {action === 'reject' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={action === 'reject' ? 'Please provide detailed feedback on why this report is being rejected...' : 'Optional: Provide feedback or comments...'}
                  required={action === 'reject'}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={evaluateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!action || evaluateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {evaluateMutation.isPending ? 'Submitting...' : 'Submit Evaluation'}
                </button>
              </div>
            </form>
          )}

          {(report.status === 'APPROVED' || report.status === 'REJECTED') && (
            <div className="space-y-4">
              {report.evaluator_feedback && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Evaluator Feedback</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.evaluator_feedback}</p>
                  {report.evaluator_name && (
                    <p className="text-xs text-gray-500 mt-2">
                      By: {report.evaluator_name} • {report.evaluated_at ? new Date(report.evaluated_at).toLocaleDateString() : 'N/A'}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
