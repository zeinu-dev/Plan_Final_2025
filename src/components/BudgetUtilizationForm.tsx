import React, { useState, useEffect } from 'react';
import { Loader, Save } from 'lucide-react';
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
  onSaveDraft?: (utilizations: BudgetUtilization[]) => Promise<void>;
  isLoading?: boolean;
  existingUtilizations?: Record<number, BudgetUtilization>;
}

export const BudgetUtilizationForm: React.FC<BudgetUtilizationFormProps> = ({
  planData,
  reportId,
  onSave,
  onBack,
  onSaveDraft,
  isLoading = false,
  existingUtilizations = {}
}) => {
  const [utilizations, setUtilizations] = useState<Record<number, BudgetUtilization>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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
    const numValue = value === '' ? 0 : (parseFloat(value) || 0);

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
      const utilizationArray = Object.values(utilizations).map(util => ({
        sub_activity: util.sub_activity,
        government_treasury_utilized: Number(util.government_treasury_utilized) || 0,
        sdg_funding_utilized: Number(util.sdg_funding_utilized) || 0,
        partners_funding_utilized: Number(util.partners_funding_utilized) || 0,
        other_funding_utilized: Number(util.other_funding_utilized) || 0,
      }));

      console.log('Submitting utilizations:', utilizationArray);
      await onSave(utilizationArray);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;

    setIsSavingDraft(true);
    try {
      const utilizationArray = Object.values(utilizations).map(util => ({
        sub_activity: util.sub_activity,
        government_treasury_utilized: Number(util.government_treasury_utilized) || 0,
        sdg_funding_utilized: Number(util.sdg_funding_utilized) || 0,
        partners_funding_utilized: Number(util.partners_funding_utilized) || 0,
        other_funding_utilized: Number(util.other_funding_utilized) || 0,
      }));

      console.log('Saving budget utilizations as draft:', utilizationArray);
      await onSaveDraft(utilizationArray);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const allSubActivities: SubActivityBudget[] = [];

  console.log('Budget Utilization - Plan Data:', planData);
  console.log('Budget Utilization - plan_data:', planData?.plan_data);

  planData?.plan_data.forEach((initiative, initIdx) => {
    console.log(`Initiative ${initIdx}:`, JSON.stringify(initiative, null, 2));
    console.log(`Main activities count:`, initiative.main_activities?.length);

    if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
      initiative.main_activities.forEach((activity, actIdx) => {
        console.log(`Activity ${actIdx} (${activity.name}):`, JSON.stringify(activity, null, 2));
        console.log(`Activity keys:`, Object.keys(activity));
        console.log(`Has sub_activities key:`, 'sub_activities' in activity);
        console.log(`sub_activities value:`, activity.sub_activities);
        console.log(`sub_activities type:`, typeof activity.sub_activities);
        console.log(`sub_activities is array:`, Array.isArray(activity.sub_activities));
        console.log(`sub_activities length:`, activity.sub_activities?.length);

        const subActivities = activity.sub_activities || activity.subActivities || [];

        if (subActivities && Array.isArray(subActivities) && subActivities.length > 0) {
          console.log(`Found ${subActivities.length} sub-activities for ${activity.name}`);
          subActivities.forEach((subActivity: any) => {
            console.log('Processing sub-activity:', subActivity);
            allSubActivities.push({
              id: subActivity.id,
              name: `${activity.name} - ${subActivity.name}`,
              government_treasury: subActivity.government_treasury || 0,
              sdg_funding: subActivity.sdg_funding || 0,
              partners_funding: subActivity.partners_funding || 0,
              other_funding: subActivity.other_funding || 0,
            });
          });
        } else {
          console.log(`No sub-activities found for activity ${activity.name}`);
        }
      });
    }
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
              <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r align-middle">
                Activity / Sub-Activity
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r bg-blue-100">
                Government Treasury
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r bg-green-100">
                SDG Funding
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r bg-yellow-100">
                Partner Funding
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r bg-purple-100">
                Other Funding
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                Total
              </th>
            </tr>
            <tr>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-blue-50">Total Budget</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-blue-50">Utilized</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-blue-50">Remaining</th>

              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-green-50">Total Budget</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-green-50">Utilized</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-green-50">Remaining</th>

              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-yellow-50">Total Budget</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-yellow-50">Utilized</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-yellow-50">Remaining</th>

              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-purple-50">Total Budget</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-purple-50">Utilized</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-purple-50">Remaining</th>

              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-gray-100">Total Budget</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 border-r bg-gray-100">Utilized</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 bg-gray-100">Remaining</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {allSubActivities.map((subActivity) => {
              const util = utilizations[subActivity.id];

              const govTreasuryUtilized = Number(util?.government_treasury_utilized) || 0;
              const sdgUtilized = Number(util?.sdg_funding_utilized) || 0;
              const partnersUtilized = Number(util?.partners_funding_utilized) || 0;
              const otherUtilized = Number(util?.other_funding_utilized) || 0;

              const govTreasuryRemaining = Number(subActivity.government_treasury) - govTreasuryUtilized;
              const sdgRemaining = Number(subActivity.sdg_funding) - sdgUtilized;
              const partnersRemaining = Number(subActivity.partners_funding) - partnersUtilized;
              const otherRemaining = Number(subActivity.other_funding) - otherUtilized;

              const totalBudget = Number(subActivity.government_treasury) + Number(subActivity.sdg_funding) +
                                  Number(subActivity.partners_funding) + Number(subActivity.other_funding);
              const totalUtilized = govTreasuryUtilized + sdgUtilized + partnersUtilized + otherUtilized;
              const totalRemaining = totalBudget - totalUtilized;

              return (
                <tr key={subActivity.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm border-r">
                    <div className="font-medium text-gray-900">{subActivity.name}</div>
                  </td>

                  <td className="px-2 py-3 text-sm text-center border-r bg-blue-50">
                    {Number(subActivity.government_treasury).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 border-r bg-blue-50">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(subActivity.government_treasury)}
                      value={util?.government_treasury_utilized || ''}
                      onChange={(e) => handleUtilizationChange(
                        subActivity.id,
                        'government_treasury_utilized',
                        e.target.value
                      )}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-3 text-sm text-center border-r bg-blue-50">
                    <span className={govTreasuryRemaining < 0 ? 'text-red-600 font-semibold' : ''}>
                      {govTreasuryRemaining.toFixed(2)}
                    </span>
                  </td>

                  <td className="px-2 py-3 text-sm text-center border-r bg-green-50">
                    {Number(subActivity.sdg_funding).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 border-r bg-green-50">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(subActivity.sdg_funding)}
                      value={util?.sdg_funding_utilized || ''}
                      onChange={(e) => handleUtilizationChange(
                        subActivity.id,
                        'sdg_funding_utilized',
                        e.target.value
                      )}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-3 text-sm text-center border-r bg-green-50">
                    <span className={sdgRemaining < 0 ? 'text-red-600 font-semibold' : ''}>
                      {sdgRemaining.toFixed(2)}
                    </span>
                  </td>

                  <td className="px-2 py-3 text-sm text-center border-r bg-yellow-50">
                    {Number(subActivity.partners_funding).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 border-r bg-yellow-50">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(subActivity.partners_funding)}
                      value={util?.partners_funding_utilized || ''}
                      onChange={(e) => handleUtilizationChange(
                        subActivity.id,
                        'partners_funding_utilized',
                        e.target.value
                      )}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-3 text-sm text-center border-r bg-yellow-50">
                    <span className={partnersRemaining < 0 ? 'text-red-600 font-semibold' : ''}>
                      {partnersRemaining.toFixed(2)}
                    </span>
                  </td>

                  <td className="px-2 py-3 text-sm text-center border-r bg-purple-50">
                    {Number(subActivity.other_funding).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 border-r bg-purple-50">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(subActivity.other_funding)}
                      value={util?.other_funding_utilized || ''}
                      onChange={(e) => handleUtilizationChange(
                        subActivity.id,
                        'other_funding_utilized',
                        e.target.value
                      )}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-3 text-sm text-center border-r bg-purple-50">
                    <span className={otherRemaining < 0 ? 'text-red-600 font-semibold' : ''}>
                      {otherRemaining.toFixed(2)}
                    </span>
                  </td>

                  <td className="px-2 py-3 text-sm text-center border-r bg-gray-100 font-semibold">
                    {totalBudget.toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-sm text-center border-r bg-gray-100 font-semibold">
                    {totalUtilized.toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-sm text-center bg-gray-100 font-semibold">
                    <span className={totalRemaining < 0 ? 'text-red-600' : ''}>
                      {totalRemaining.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
              <td className="px-4 py-3 text-sm border-r">
                <div className="font-bold text-gray-900">GRAND TOTAL</div>
              </td>
              {(() => {
                const grandTotals = {
                  govTreasuryBudget: 0,
                  govTreasuryUtilized: 0,
                  sdgBudget: 0,
                  sdgUtilized: 0,
                  partnersBudget: 0,
                  partnersUtilized: 0,
                  otherBudget: 0,
                  otherUtilized: 0,
                };

                allSubActivities.forEach((subActivity) => {
                  const util = utilizations[subActivity.id];
                  grandTotals.govTreasuryBudget += Number(subActivity.government_treasury) || 0;
                  grandTotals.govTreasuryUtilized += Number(util?.government_treasury_utilized) || 0;
                  grandTotals.sdgBudget += Number(subActivity.sdg_funding) || 0;
                  grandTotals.sdgUtilized += Number(util?.sdg_funding_utilized) || 0;
                  grandTotals.partnersBudget += Number(subActivity.partners_funding) || 0;
                  grandTotals.partnersUtilized += Number(util?.partners_funding_utilized) || 0;
                  grandTotals.otherBudget += Number(subActivity.other_funding) || 0;
                  grandTotals.otherUtilized += Number(util?.other_funding_utilized) || 0;
                });

                const totalBudget = grandTotals.govTreasuryBudget + grandTotals.sdgBudget +
                                    grandTotals.partnersBudget + grandTotals.otherBudget;
                const totalUtilized = grandTotals.govTreasuryUtilized + grandTotals.sdgUtilized +
                                      grandTotals.partnersUtilized + grandTotals.otherUtilized;

                return (
                  <>
                    <td className="px-2 py-3 text-sm text-center border-r bg-blue-100">
                      {grandTotals.govTreasuryBudget.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-blue-100">
                      {grandTotals.govTreasuryUtilized.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-blue-100">
                      {(grandTotals.govTreasuryBudget - grandTotals.govTreasuryUtilized).toFixed(2)}
                    </td>

                    <td className="px-2 py-3 text-sm text-center border-r bg-green-100">
                      {grandTotals.sdgBudget.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-green-100">
                      {grandTotals.sdgUtilized.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-green-100">
                      {(grandTotals.sdgBudget - grandTotals.sdgUtilized).toFixed(2)}
                    </td>

                    <td className="px-2 py-3 text-sm text-center border-r bg-yellow-100">
                      {grandTotals.partnersBudget.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-yellow-100">
                      {grandTotals.partnersUtilized.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-yellow-100">
                      {(grandTotals.partnersBudget - grandTotals.partnersUtilized).toFixed(2)}
                    </td>

                    <td className="px-2 py-3 text-sm text-center border-r bg-purple-100">
                      {grandTotals.otherBudget.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-purple-100">
                      {grandTotals.otherUtilized.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-purple-100">
                      {(grandTotals.otherBudget - grandTotals.otherUtilized).toFixed(2)}
                    </td>

                    <td className="px-2 py-3 text-sm text-center border-r bg-gray-300">
                      {totalBudget.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center border-r bg-gray-300">
                      {totalUtilized.toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-sm text-center bg-gray-300">
                      {(totalBudget - totalUtilized).toFixed(2)}
                    </td>
                  </>
                );
              })()}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          disabled={isSaving || isSavingDraft}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex gap-3">
          {onSaveDraft && (
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || isSavingDraft}
              className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center"
            >
              {isSavingDraft ? (
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
          )}
          <button
            onClick={handleSubmit}
            disabled={isSaving || isSavingDraft}
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
    </div>
  );
};
