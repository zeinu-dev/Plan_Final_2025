import React, { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { ReportPlanData } from '../types/report';

interface BudgetUtilization {
  sub_activity: number;
  government_treasury_utilized: number;
  sdg_funding_utilized: number;
  partners_funding_utilized: number;
  other_funding_utilized: number;
}

interface SubActivityBudget {
  id: number;
  name: string;
  government_treasury: number;
  sdg_funding: number;
  partners_funding: number;
  other_funding: number;
}

interface BudgetUtilizationFormProps {
  planData: { plan_data: ReportPlanData[] } | null;
  reportId: number;
  onSave: (utilizations: BudgetUtilization[]) => Promise<void>;
  onBack: () => void;
  isLoading?: boolean;
  existingUtilizations?: Record<number, BudgetUtilization>;
}

export const BudgetUtilizationForm: React.FC<BudgetUtilizationFormProps> = ({
  planData,
  reportId,
  onSave,
  onBack,
  isLoading = false,
  existingUtilizations = {}
}) => {
  const [utilizations, setUtilizations] = useState<Record<number, BudgetUtilization>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existingUtilizations && Object.keys(existingUtilizations).length > 0) {
      setUtilizations(existingUtilizations);
    }
  }, [existingUtilizations]);

  const handleUtilizationChange = (
    subActivityId: number,
    field: keyof Omit<BudgetUtilization, 'sub_activity'>,
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;

    setUtilizations(prev => ({
      ...prev,
      [subActivityId]: {
        ...(prev[subActivityId] || {
          sub_activity: subActivityId,
          government_treasury_utilized: 0,
          sdg_funding_utilized: 0,
          partners_funding_utilized: 0,
          other_funding_utilized: 0,
        }),
        [field]: numValue,
      }
    }));
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const utilizationArray = Object.values(utilizations);
      await onSave(utilizationArray);
    } finally {
      setIsSaving(false);
    }
  };

  const allSubActivities: SubActivityBudget[] = [];

  console.log('Budget Utilization - Plan Data:', planData);
  console.log('Budget Utilization - plan_data:', planData?.plan_data);

  planData?.plan_data.forEach((initiative, initIdx) => {
    console.log(`Initiative ${initIdx}:`, initiative);
    console.log(`Main activities:`, initiative.main_activities);

    initiative.main_activities.forEach((activity, actIdx) => {
      console.log(`Activity ${actIdx}:`, activity);
      console.log(`Activity keys:`, Object.keys(activity));
      console.log(`Sub-activities:`, activity.sub_activities);

      const subActivities = activity.sub_activities || activity.subActivities || [];

      if (subActivities && subActivities.length > 0) {
        subActivities.forEach((subActivity: any) => {
          console.log('Sub-activity:', subActivity);
          allSubActivities.push({
            id: subActivity.id,
            name: `${activity.name} - ${subActivity.name}`,
            government_treasury: subActivity.government_treasury || 0,
            sdg_funding: subActivity.sdg_funding || 0,
            partners_funding: subActivity.partners_funding || 0,
            other_funding: subActivity.other_funding || 0,
          });
        });
      }
    });
  });

  console.log('All sub-activities found:', allSubActivities.length);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading budget data...</span>
      </div>
    );
  }

  if (allSubActivities.length === 0) {
    return (
      <div className="text-center py-12 bg-yellow-50 rounded-lg border border-yellow-200">
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Sub-Activities Found</h3>
        <p className="text-gray-600 mb-4">
          No sub-activities with budget allocations were found for this plan.
        </p>
        <div className="text-left max-w-2xl mx-auto bg-white p-4 rounded border border-yellow-300 text-sm">
          <p className="font-semibold mb-2">Debug Information:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            <li>Plan data exists: {planData ? 'Yes' : 'No'}</li>
            <li>Number of initiatives: {planData?.plan_data?.length || 0}</li>
            <li>Number of main activities: {
              planData?.plan_data?.reduce((sum, init) => sum + (init.main_activities?.length || 0), 0) || 0
            }</li>
            <li>Check browser console for detailed logs</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <p className="text-sm text-blue-700">
          Enter the actual budget utilized for each funding source during this reporting period.
          The total budget for each source is shown in the column headers for reference.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r">
                Activity / Sub-Activity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r">
                <div>Government Treasury</div>
                <div className="text-xs font-normal text-gray-500 mt-1">Budget Utilized</div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r">
                <div>SDG Funding</div>
                <div className="text-xs font-normal text-gray-500 mt-1">Budget Utilized</div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r">
                <div>Partner Funding</div>
                <div className="text-xs font-normal text-gray-500 mt-1">Budget Utilized</div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                <div>Other Funding</div>
                <div className="text-xs font-normal text-gray-500 mt-1">Budget Utilized</div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {allSubActivities.map((subActivity) => {
              const util = utilizations[subActivity.id];

              return (
                <tr key={subActivity.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm border-r">
                    <div className="font-medium text-gray-900">{subActivity.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Total Budget: {(
                        subActivity.government_treasury +
                        subActivity.sdg_funding +
                        subActivity.partners_funding +
                        subActivity.other_funding
                      ).toFixed(2)} ETB
                    </div>
                  </td>
                  <td className="px-4 py-3 border-r">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">
                        Total: {subActivity.government_treasury.toFixed(2)} ETB
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={subActivity.government_treasury}
                        value={util?.government_treasury_utilized || ''}
                        onChange={(e) => handleUtilizationChange(
                          subActivity.id,
                          'government_treasury_utilized',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 border-r">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">
                        Total: {subActivity.sdg_funding.toFixed(2)} ETB
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={subActivity.sdg_funding}
                        value={util?.sdg_funding_utilized || ''}
                        onChange={(e) => handleUtilizationChange(
                          subActivity.id,
                          'sdg_funding_utilized',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 border-r">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">
                        Total: {subActivity.partners_funding.toFixed(2)} ETB
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={subActivity.partners_funding}
                        value={util?.partners_funding_utilized || ''}
                        onChange={(e) => handleUtilizationChange(
                          subActivity.id,
                          'partners_funding_utilized',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">
                        Total: {subActivity.other_funding.toFixed(2)} ETB
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={subActivity.other_funding}
                        value={util?.other_funding_utilized || ''}
                        onChange={(e) => handleUtilizationChange(
                          subActivity.id,
                          'other_funding_utilized',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
        >
          {isSaving ? (
            <>
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save & Continue'
          )}
        </button>
      </div>
    </div>
  );
};
