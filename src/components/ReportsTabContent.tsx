import React, { useState, useEffect } from 'react';
import { Building2, CheckCircle, XCircle, Loader, Eye, DollarSign, TrendingUp } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { reports, api } from '../lib/api';
import { Bar } from 'react-chartjs-2';
import { HorizontalMEReportTable } from './HorizontalMEReportTable';

interface ReportsTabContentProps {
  reportSubTab: 'performance-overview' | 'approved-reports' | 'budget-utilization';
}

const ReportsTabContent: React.FC<ReportsTabContentProps> = ({ reportSubTab }) => {
  const { t } = useLanguage();
  const [reportStats, setReportStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  const [selectedReportForView, setSelectedReportForView] = useState<any>(null);
  const [showMEModal, setShowMEModal] = useState(false);
  const [loadingMEReport, setLoadingMEReport] = useState(false);

  useEffect(() => {
    loadReportStatistics();
  }, []);

  const loadReportStatistics = async () => {
    try {
      setLoading(true);
      const data = await reports.getStatistics();
      setReportStats(data);
    } catch (error) {
      console.error('Failed to load report statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMEReport = async (report: any) => {
    try {
      setLoadingMEReport(true);
      setShowMEModal(true);

      // Fetch the full report data including plan_data
      const reportResponse = await api.get(`/reports/${report.report_id}/`);
      const planDataResponse = await api.get(`/reports/${report.report_id}/plan_data/`);

      console.log('Plan Data Response:', planDataResponse.data);

      // Transform the plan data to match the expected format
      let objectivesData = [];

      if (Array.isArray(planDataResponse.data)) {
        objectivesData = planDataResponse.data;
      } else if (planDataResponse.data && typeof planDataResponse.data === 'object') {
        // If it's an object with objectives property
        if (Array.isArray(planDataResponse.data.objectives)) {
          objectivesData = planDataResponse.data.objectives;
        } else if (planDataResponse.data.strategic_objectives) {
          objectivesData = planDataResponse.data.strategic_objectives;
        } else {
          // If the response is a single object, wrap it in an array
          objectivesData = [planDataResponse.data];
        }
      }

      // Combine the data
      const fullReportData = {
        ...reportResponse.data,
        planData: objectivesData
      };

      console.log('Transformed objectives data:', objectivesData);
      setSelectedReportForView(fullReportData);
    } catch (error) {
      console.error('Failed to load report details:', error);
      setShowMEModal(false);
    } finally {
      setLoadingMEReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!reportStats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Failed to load report statistics</p>
      </div>
    );
  }

  const { submission_stats, objective_achievements_by_org = [], organization_reports = [], budget_utilization_by_org = [] } = reportStats;

  // Filter data based on selected organization
  const filteredObjectives = selectedOrg === 'all'
    ? objective_achievements_by_org
    : objective_achievements_by_org.filter((org: any) => org.organization_id.toString() === selectedOrg);

  const filteredReports = selectedOrg === 'all'
    ? organization_reports
    : organization_reports.filter((report: any) => report.organization_id.toString() === selectedOrg);

  const filteredBudgetUtil = selectedOrg === 'all'
    ? budget_utilization_by_org
    : budget_utilization_by_org.filter((org: any) => org.organization_id.toString() === selectedOrg);

  // Get unique organizations for filter
  const organizations = objective_achievements_by_org?.map((org: any) => ({
    id: org.organization_id,
    name: org.organization_name
  })) || [];

  // Prepare data for performance bar chart
  const performanceChartLabels: string[] = [];
  const performanceChartDataValues: number[] = [];
  const performanceChartColors: string[] = [];

  filteredObjectives.forEach((org: any) => {
    org.objectives.forEach((obj: any) => {
      const label = `${org.organization_name} - ${obj.title.substring(0, 40)}`;
      performanceChartLabels.push(label);
      performanceChartDataValues.push(obj.achievement_percentage);
      performanceChartColors.push(obj.color);
    });
  });

  const performanceChartData = {
    labels: performanceChartLabels,
    datasets: [{
      label: 'Achievement %',
      data: performanceChartDataValues,
      backgroundColor: performanceChartColors,
      borderColor: performanceChartColors,
      borderWidth: 1
    }]
  };

  const performanceChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `Achievement: ${context.parsed.x.toFixed(1)}%`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Achievement Percentage'
        }
      }
    }
  };

  // Prepare data for budget utilization stacked bar chart
  const budgetChartData = {
    labels: filteredBudgetUtil.map((org: any) => org.organization_name),
    datasets: [
      {
        label: 'Government Treasury',
        data: filteredBudgetUtil.map((org: any) => org.government_treasury),
        backgroundColor: '#3B82F6',
        borderColor: '#2563EB',
        borderWidth: 1
      },
      {
        label: 'SDG Funding',
        data: filteredBudgetUtil.map((org: any) => org.sdg_funding),
        backgroundColor: '#10B981',
        borderColor: '#059669',
        borderWidth: 1
      },
      {
        label: 'Partner Funding',
        data: filteredBudgetUtil.map((org: any) => org.partners_funding),
        backgroundColor: '#F59E0B',
        borderColor: '#D97706',
        borderWidth: 1
      },
      {
        label: 'Other Funding',
        data: filteredBudgetUtil.map((org: any) => org.other_funding),
        backgroundColor: '#8B5CF6',
        borderColor: '#7C3AED',
        borderWidth: 1
      }
    ]
  };

  const budgetChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ETB ${context.parsed.y.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        title: {
          display: true,
          text: 'Organizations'
        }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Budget Utilized (ETB)'
        }
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Common: Report Submission Statistics (shown in all tabs) */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Report Submission Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Organizations</p>
                <p className="text-3xl font-bold">{submission_stats?.total_organizations || 0}</p>
                <p className="text-blue-100 text-xs">With Approved Plans</p>
              </div>
              <Building2 className="h-12 w-12 text-blue-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Reports Submitted</p>
                <p className="text-3xl font-bold">{submission_stats?.submitted || 0}</p>
                <p className="text-green-100 text-xs">
                  {submission_stats?.total_organizations > 0
                    ? `${((submission_stats.submitted / submission_stats.total_organizations) * 100).toFixed(1)}%`
                    : '0%'}
                </p>
              </div>
              <CheckCircle className="h-12 w-12 text-green-200" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium">Not Submitted</p>
                <p className="text-3xl font-bold">{submission_stats?.not_submitted || 0}</p>
                <p className="text-red-100 text-xs">
                  {submission_stats?.total_organizations > 0
                    ? `${((submission_stats.not_submitted / submission_stats.total_organizations) * 100).toFixed(1)}%`
                    : '0%'}
                </p>
              </div>
              <XCircle className="h-12 w-12 text-red-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Organization Filter */}
      {organizations.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Organization
          </label>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="block w-full md:w-96 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Organizations</option>
            {organizations.map((org: any) => (
              <option key={org.id} value={org.id.toString()}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Performance Overview Tab Content */}
      {reportSubTab === 'performance-overview' && (
        <>
          {/* Strategic Objective Performance by Organization */}
          <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Strategic Objective Performance by Organization</h2>
        {filteredObjectives.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No performance data available
          </div>
        ) : (
          filteredObjectives.map((org: any) => (
            <div key={org.organization_id} className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{org.organization_name}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Objective
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Achievement %
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {org.objectives.map((obj: any) => (
                      <tr key={obj.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{obj.title}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="flex-1">
                              <div className="relative pt-1">
                                <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
                                  <div
                                    style={{
                                      width: `${Math.min(obj.achievement_percentage, 100)}%`,
                                      backgroundColor: obj.color
                                    }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500"
                                  ></div>
                                </div>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-gray-700">
                              {obj.achievement_percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: `${obj.color}20`,
                              color: obj.color
                            }}
                          >
                            {obj.achievement_percentage >= 95 && '⬤ Excellent'}
                            {obj.achievement_percentage >= 80 && obj.achievement_percentage < 95 && '⬤ Good'}
                            {obj.achievement_percentage >= 65 && obj.achievement_percentage < 80 && '⬤ Satisfactory'}
                            {obj.achievement_percentage >= 55 && obj.achievement_percentage < 65 && '⬤ Fair'}
                            {obj.achievement_percentage < 55 && '⬤ Poor'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        {/* Performance Legend */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Performance Color Code</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#00A300' }}></div>
              <span className="text-xs text-gray-600">≥95% - Excellent</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#93C572' }}></div>
              <span className="text-xs text-gray-600">80-94.99% - Good</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FFFF00' }}></div>
              <span className="text-xs text-gray-600">65-79.99% - Satisfactory</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FFBF00' }}></div>
              <span className="text-xs text-gray-600">55-64.99% - Fair</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#F2250A' }}></div>
              <span className="text-xs text-gray-600">&lt;55% - Poor</span>
            </div>
          </div>
        </div>
      </div>

          {/* Performance Bar Chart */}
          {performanceChartLabels.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <TrendingUp className="h-6 w-6 mr-2 text-blue-600" />
                Organization Performance Overview
              </h2>
              <div style={{ height: `${Math.max(400, performanceChartLabels.length * 40)}px` }}>
                <Bar data={performanceChartData} options={performanceChartOptions} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Approved M&E Reports Tab Content */}
      {reportSubTab === 'approved-reports' && (
        <>
          {/* Organization M&E Reports Table */}
          <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Approved M&E Reports</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overall Achievement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Budget Utilized
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No approved reports available
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report: any) => (
                    <tr key={report.report_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.organization_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {report.report_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(report.report_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-1 mr-2">
                            <div className="h-2 bg-gray-200 rounded">
                              <div
                                className="h-2 bg-green-500 rounded"
                                style={{ width: `${Math.min(report.overall_achievement, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {report.overall_achievement.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ETB {report.budget_utilization.total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleViewMEReport(report)}
                          className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View M&E
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

        </>
      )}

      {/* Budget Utilization Tab Content */}
      {reportSubTab === 'budget-utilization' && filteredBudgetUtil.length > 0 && (
        <>
          {/* Budget Utilization by Source */}
          <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-6 w-6 mr-2 text-green-600" />
            Budget Utilization by Source
          </h2>

          {/* Budget Chart */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div style={{ height: '400px' }}>
              <Bar data={budgetChartData} options={budgetChartOptions} />
            </div>
          </div>

          {/* Budget Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Organization
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Government Treasury
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SDG Funding
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Partner Funding
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Other Funding
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBudgetUtil.map((org: any) => (
                    <tr key={org.organization_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {org.organization_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        ETB {org.government_treasury.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        ETB {org.sdg_funding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        ETB {org.partners_funding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        ETB {org.other_funding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                        ETB {org.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </>
      )}

      {/* M&E Report Modal (shown in approved-reports tab) */}
      {showMEModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                M&E Report
                {selectedReportForView && ` - ${selectedReportForView.organization_name} (${selectedReportForView.report_type})`}
              </h3>
              <button
                onClick={() => {
                  setShowMEModal(false);
                  setSelectedReportForView(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingMEReport ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading M&E report data...</span>
                </div>
              ) : selectedReportForView && Array.isArray(selectedReportForView.planData) && selectedReportForView.planData.length > 0 ? (
                <HorizontalMEReportTable
                  objectives={selectedReportForView.planData}
                  organizationName={selectedReportForView.organization_name || ''}
                  reportType={selectedReportForView.report_type || ''}
                  reportDate={selectedReportForView.report_date || ''}
                  plannerName={selectedReportForView.planner_name || ''}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  {selectedReportForView ?
                    'No M&E report data available for this report.' :
                    'Failed to load M&E report data. Please try again.'
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsTabContent;
