import React from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PerformanceMeasureData {
  id: number;
  name: string;
  weight: number;
  target: number;
  achievement: number;
  justification?: string;
}

interface SubActivityBudgetData {
  id: number;
  name: string;
  government_treasury: number;
  sdg_funding: number;
  partners_funding: number;
  other_funding: number;
  government_treasury_utilized: number;
  sdg_funding_utilized: number;
  partners_funding_utilized: number;
  other_funding_utilized: number;
}

interface MainActivityData {
  id: number;
  name: string;
  weight: number;
  target: number;
  achievement: number;
  justification?: string;
  subActivities?: SubActivityBudgetData[];
}

interface InitiativeData {
  id: number;
  name: string;
  weight: number;
  performanceMeasures: PerformanceMeasureData[];
  mainActivities: MainActivityData[];
}

interface ObjectiveData {
  id: number;
  title: string;
  weight: number;
  initiatives: InitiativeData[];
}

interface HorizontalMEReportTableProps {
  objectives: ObjectiveData[];
  organizationName: string;
  reportType: string;
  reportDate: string;
  plannerName?: string;
}

const getPerformanceColor = (percentage: number): string => {
  if (percentage < 55) return 'text-white font-bold';
  if (percentage >= 55 && percentage < 65) return 'text-gray-900 font-bold';
  if (percentage >= 65 && percentage < 80) return 'text-gray-900 font-bold';
  if (percentage >= 80 && percentage < 95) return 'text-white font-bold';
  return 'text-white font-bold';
};

const getPerformanceBackgroundColor = (percentage: number): string => {
  if (percentage < 55) return '#F2250A';
  if (percentage >= 55 && percentage < 65) return '#FFBF00';
  if (percentage >= 65 && percentage < 80) return '#FFFF00';
  if (percentage >= 80 && percentage < 95) return '#93C572';
  return '#00A300';
};

const calculateMeasureAchievement = (measure: PerformanceMeasureData) => {
  const achievement = Number(measure.achievement) || 0;
  const target = Number(measure.target) || 0;
  const weight = Number(measure.weight) || 0;
  const achievementPercent = target > 0 ? (achievement / target) * 100 : 0;
  const achievementByWeight = (weight * achievementPercent) / 100;
  return { achievementPercent, achievementByWeight };
};

const calculateActivityAchievement = (activity: MainActivityData) => {
  const achievement = Number(activity.achievement) || 0;
  const target = Number(activity.target) || 0;
  const weight = Number(activity.weight) || 0;
  const achievementPercent = target > 0 ? (achievement / target) * 100 : 0;
  const achievementByWeight = (weight * achievementPercent) / 100;
  return { achievementPercent, achievementByWeight };
};

const calculateInitiativeAchievement = (initiative: InitiativeData) => {
  const measuresWeight = initiative.performanceMeasures.reduce((sum, m) => {
    return sum + calculateMeasureAchievement(m).achievementByWeight;
  }, 0);

  const activitiesWeight = initiative.mainActivities.reduce((sum, a) => {
    return sum + calculateActivityAchievement(a).achievementByWeight;
  }, 0);

  const achievementByWeight = measuresWeight + activitiesWeight;

  const dynamicWeight = initiative.performanceMeasures.reduce((sum, m) => sum + (Number(m.weight) || 0), 0) +
                       initiative.mainActivities.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);

  const achievementPercent = dynamicWeight > 0 ? (achievementByWeight / dynamicWeight) * 100 : 0;

  return { achievementByWeight, achievementPercent, dynamicWeight };
};

const calculateObjectiveAchievement = (objective: ObjectiveData) => {
  const achievementByWeight = objective.initiatives.reduce((sum, initiative) => {
    return sum + calculateInitiativeAchievement(initiative).achievementByWeight;
  }, 0);

  const dynamicWeight = objective.initiatives.reduce((sum, initiative) => {
    const initDynamicWeight = initiative.performanceMeasures.reduce((s, m) => s + (Number(m.weight) || 0), 0) +
                              initiative.mainActivities.reduce((s, a) => s + (Number(a.weight) || 0), 0);
    return sum + initDynamicWeight;
  }, 0);

  const achievementPercent = dynamicWeight > 0 ? (achievementByWeight / dynamicWeight) * 100 : 0;

  return { achievementByWeight, achievementPercent, dynamicWeight };
};

export const HorizontalMEReportTable: React.FC<HorizontalMEReportTableProps> = ({
  objectives,
  organizationName,
  reportType,
  reportDate,
  plannerName
}) => {
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const metadataRows = [
      ['M&E Report'],
      ['Organization:', organizationName],
      ['Report Type:', reportType],
      ['Report Date:', new Date(reportDate).toLocaleDateString()],
      ['Planner:', plannerName || 'N/A'],
      []
    ];

    const headers = [
      'Strategic Objective',
      'Planned Weight %',
      'Achievement',
      'Achievement %',
      'Strategic Initiative',
      'Planned Weight %',
      'Achievement',
      'Achievement %',
      'Performance Measure / Main Activity',
      'Planned Weight %',
      'Target',
      'Achievement',
      'Achievement %',
      'Justification',
      'Total Budget',
      'Budget Utilized',
      'Remaining Budget'
    ];

    const excelData: any[] = [];

    objectives.forEach(objective => {
      const objAchievement = calculateObjectiveAchievement(objective);

      objective.initiatives.forEach((initiative, initIdx) => {
        const initAchievement = calculateInitiativeAchievement(initiative);

        const allItems = [
          ...initiative.performanceMeasures.map(m => ({ type: 'PM', data: m })),
          ...initiative.mainActivities.map(a => ({ type: 'MA', data: a }))
        ];

        allItems.forEach((item, itemIdx) => {
          const row: any[] = [];

          if (initIdx === 0 && itemIdx === 0) {
            row.push(objective.title);
            row.push(objAchievement.dynamicWeight.toFixed(2));
            row.push(objAchievement.achievementByWeight.toFixed(2));
            row.push(objAchievement.achievementPercent.toFixed(2));
          } else {
            row.push('', '', '', '');
          }

          if (itemIdx === 0) {
            row.push(initiative.name);
            row.push(initAchievement.dynamicWeight.toFixed(2));
            row.push(initAchievement.achievementByWeight.toFixed(2));
            row.push(initAchievement.achievementPercent.toFixed(2));
          } else {
            row.push('', '', '', '');
          }

          if (item.type === 'PM') {
            const measure = item.data as PerformanceMeasureData;
            const { achievementPercent } = calculateMeasureAchievement(measure);
            row.push(measure.name);
            row.push(measure.weight.toFixed(2));
            row.push(measure.target.toFixed(2));
            row.push((measure.achievement || 0).toFixed(2));
            row.push(achievementPercent.toFixed(2));
            row.push(measure.justification || '');
            row.push('', '', '');
          } else {
            const activity = item.data as MainActivityData;
            const { achievementPercent } = calculateActivityAchievement(activity);
            const totalBudget = (activity.subActivities || []).reduce((sum, sub) =>
              sum + Number(sub.government_treasury) + Number(sub.sdg_funding) +
              Number(sub.partners_funding) + Number(sub.other_funding), 0);
            const totalUtilized = (activity.subActivities || []).reduce((sum, sub) =>
              sum + Number(sub.government_treasury_utilized || 0) + Number(sub.sdg_funding_utilized || 0) +
              Number(sub.partners_funding_utilized || 0) + Number(sub.other_funding_utilized || 0), 0);
            const totalRemaining = totalBudget - totalUtilized;

            row.push(activity.name);
            row.push(activity.weight.toFixed(2));
            row.push(activity.target.toFixed(2));
            row.push((activity.achievement || 0).toFixed(2));
            row.push(achievementPercent.toFixed(2));
            row.push(activity.justification || '');
            row.push(totalBudget.toFixed(2));
            row.push(totalUtilized.toFixed(2));
            row.push(totalRemaining.toFixed(2));
          }

          excelData.push(row);
        });
      });
    });

    const wsData = [...metadataRows, headers, ...excelData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'M&E Report');
    XLSX.writeFile(wb, `ME_Report_${organizationName}_${reportType}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape', 'pt', 'a3');

    doc.setFontSize(16);
    doc.text('M&E Report', 40, 40);

    doc.setFontSize(10);
    let yPos = 70;
    doc.text(`Organization: ${organizationName}`, 40, yPos);
    yPos += 15;
    doc.text(`Report Type: ${reportType}`, 40, yPos);
    yPos += 15;
    doc.text(`Report Date: ${new Date(reportDate).toLocaleDateString()}`, 40, yPos);
    yPos += 15;
    if (plannerName) {
      doc.text(`Planner: ${plannerName}`, 40, yPos);
      yPos += 15;
    }

    doc.text('Note: Full table exported to Excel for better viewing', 40, yPos);

    doc.save(`ME_Report_${organizationName}_${reportType}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">M&E Report - {reportType}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {organizationName} • {new Date(reportDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-300 rounded-lg shadow-lg">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-blue-600 to-blue-700">
              <th colSpan={4} className="border-r-2 border-white px-4 py-4 text-center text-sm font-bold text-white uppercase tracking-wider">
                Strategic Objective<br />
                <span className="text-xs font-normal">Planned Weight & Achievement</span>
              </th>
              <th colSpan={4} className="border-r-2 border-white px-4 py-4 text-center text-sm font-bold text-white uppercase tracking-wider">
                Strategic Initiative<br />
                <span className="text-xs font-normal">Initiative Planned Weight & Achievement</span>
              </th>
              <th colSpan={6} className="border-r-2 border-white px-4 py-4 text-center text-sm font-bold text-white uppercase tracking-wider">
                Performance Measure & Main Activity<br />
                <span className="text-xs font-normal">Planned & Achievement</span>
              </th>
              <th colSpan={3} className="px-4 py-4 text-center text-sm font-bold text-white uppercase tracking-wider">
                Budget Utilization
              </th>
            </tr>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Strategic Objective</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Weight %</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement %</th>

              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Initiative</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Weight %</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement %</th>

              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">PM / Activity Name</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Weight %</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Target</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Achievement %</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">Justification</th>

              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700 bg-blue-50">Total Budget</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700 bg-green-50">Utilized</th>
              <th className="border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700 bg-yellow-50">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {objectives.map((objective) => {
              const objAchievement = calculateObjectiveAchievement(objective);

              return (
                <React.Fragment key={`obj-${objective.id}`}>
                  {objective.initiatives.map((initiative, initIdx) => {
                    const initAchievement = calculateInitiativeAchievement(initiative);

                    const allItems = [
                      ...initiative.performanceMeasures.map(m => ({ type: 'PM', data: m })),
                      ...initiative.mainActivities.map(a => ({ type: 'MA', data: a }))
                    ];

                    return (
                      <React.Fragment key={`init-${initiative.id}`}>
                        {allItems.map((item, itemIdx) => {
                          const isFirstRowOfObjective = initIdx === 0 && itemIdx === 0;
                          const isFirstRowOfInitiative = itemIdx === 0;

                          let measureOrActivity: PerformanceMeasureData | MainActivityData;
                          let achievementData;
                          let totalBudget = 0;
                          let totalUtilized = 0;
                          let totalRemaining = 0;

                          if (item.type === 'PM') {
                            measureOrActivity = item.data as PerformanceMeasureData;
                            achievementData = calculateMeasureAchievement(measureOrActivity);
                          } else {
                            measureOrActivity = item.data as MainActivityData;
                            achievementData = calculateActivityAchievement(measureOrActivity);
                            const activity = measureOrActivity as MainActivityData;
                            totalBudget = (activity.subActivities || []).reduce((sum, sub) =>
                              sum + Number(sub.government_treasury) + Number(sub.sdg_funding) +
                              Number(sub.partners_funding) + Number(sub.other_funding), 0);
                            totalUtilized = (activity.subActivities || []).reduce((sum, sub) =>
                              sum + Number(sub.government_treasury_utilized || 0) + Number(sub.sdg_funding_utilized || 0) +
                              Number(sub.partners_funding_utilized || 0) + Number(sub.other_funding_utilized || 0), 0);
                            totalRemaining = totalBudget - totalUtilized;
                          }

                          const objectiveRowspan = objective.initiatives.reduce((sum, init) => {
                            return sum + init.performanceMeasures.length + init.mainActivities.length;
                          }, 0);

                          const initiativeRowspan = initiative.performanceMeasures.length + initiative.mainActivities.length;

                          return (
                            <tr key={`${initiative.id}-${item.type}-${measureOrActivity.id}`} className="hover:bg-gray-50">
                              {isFirstRowOfObjective && (
                                <>
                                  <td rowSpan={objectiveRowspan} className="border border-gray-300 px-3 py-2 text-sm font-bold text-gray-900 bg-blue-50 align-top">
                                    {objective.title}
                                  </td>
                                  <td rowSpan={objectiveRowspan} className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 bg-blue-50 align-top">
                                    {objAchievement.dynamicWeight.toFixed(2)}%
                                  </td>
                                  <td rowSpan={objectiveRowspan} className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 bg-blue-50 align-top">
                                    {objAchievement.achievementByWeight.toFixed(2)}
                                  </td>
                                  <td rowSpan={objectiveRowspan} className="border border-gray-300 px-2 py-2 text-center bg-blue-50 align-top">
                                    <span
                                      className={`inline-block px-2 py-1 rounded text-xs ${getPerformanceColor(objAchievement.achievementPercent)}`}
                                      style={{ backgroundColor: getPerformanceBackgroundColor(objAchievement.achievementPercent) }}
                                    >
                                      {objAchievement.achievementPercent.toFixed(2)}%
                                    </span>
                                  </td>
                                </>
                              )}

                              {isFirstRowOfInitiative && (
                                <>
                                  <td rowSpan={initiativeRowspan} className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 bg-indigo-50 align-top">
                                    {initiative.name}
                                  </td>
                                  <td rowSpan={initiativeRowspan} className="border border-gray-300 px-2 py-2 text-center text-sm font-medium text-gray-900 bg-indigo-50 align-top">
                                    {initAchievement.dynamicWeight.toFixed(2)}%
                                  </td>
                                  <td rowSpan={initiativeRowspan} className="border border-gray-300 px-2 py-2 text-center text-sm font-medium text-gray-900 bg-indigo-50 align-top">
                                    {initAchievement.achievementByWeight.toFixed(2)}
                                  </td>
                                  <td rowSpan={initiativeRowspan} className="border border-gray-300 px-2 py-2 text-center bg-indigo-50 align-top">
                                    <span
                                      className={`inline-block px-2 py-1 rounded text-xs ${getPerformanceColor(initAchievement.achievementPercent)}`}
                                      style={{ backgroundColor: getPerformanceBackgroundColor(initAchievement.achievementPercent) }}
                                    >
                                      {initAchievement.achievementPercent.toFixed(2)}%
                                    </span>
                                  </td>
                                </>
                              )}

                              <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900">
                                {item.type === 'PM' ? '📊 ' : '📋 '}
                                {measureOrActivity.name}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm text-gray-700">
                                {Number(measureOrActivity.weight).toFixed(2)}%
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm text-gray-700">
                                {Number(measureOrActivity.target).toFixed(2)}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm font-medium text-gray-900">
                                {Number(measureOrActivity.achievement || 0).toFixed(2)}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center">
                                <span
                                  className={`inline-block px-2 py-1 rounded text-xs ${getPerformanceColor(achievementData.achievementPercent)}`}
                                  style={{ backgroundColor: getPerformanceBackgroundColor(achievementData.achievementPercent) }}
                                >
                                  {achievementData.achievementPercent.toFixed(2)}%
                                </span>
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-xs text-gray-600">
                                {measureOrActivity.justification || '—'}
                              </td>

                              {item.type === 'MA' ? (
                                <>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 bg-blue-50">
                                    {totalBudget.toFixed(2)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 bg-green-50">
                                    {totalUtilized.toFixed(2)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold bg-yellow-50">
                                    <span className={totalRemaining < 0 ? 'text-red-600' : 'text-gray-900'}>
                                      {totalRemaining.toFixed(2)}
                                    </span>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-gray-400">—</td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-gray-400">—</td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-gray-400">—</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
