import React from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../lib/utils/export';

interface PerformanceMeasureData {
  id: number;
  name: string;
  weight: number;
  target: number;
  achievement: number;
  justification?: string;
}

interface MainActivityData {
  id: number;
  name: string;
  weight: number;
  target: number;
  achievement: number;
  justification?: string;
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
  if (percentage < 55) return 'bg-red-100 text-red-800';
  if (percentage >= 55 && percentage < 65) return 'bg-orange-100 text-orange-800';
  if (percentage >= 65 && percentage < 80) return 'bg-yellow-100 text-yellow-800';
  if (percentage >= 80 && percentage < 95) return 'bg-blue-100 text-blue-800';
  return 'bg-green-100 text-green-800';
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
  const weight = Number(initiative.weight) || 0;
  const achievementPercent = weight > 0 ? (achievementByWeight / weight) * 100 : 0;

  return { achievementByWeight, achievementPercent };
};

const calculateObjectiveAchievement = (objective: ObjectiveData) => {
  const achievementByWeight = objective.initiatives.reduce((sum, initiative) => {
    return sum + calculateInitiativeAchievement(initiative).achievementByWeight;
  }, 0);

  const weight = Number(objective.weight) || 0;
  const achievementPercent = weight > 0 ? (achievementByWeight / weight) * 100 : 0;

  return { achievementByWeight, achievementPercent };
};

export const HorizontalMEReportTable: React.FC<HorizontalMEReportTableProps> = ({
  objectives,
  organizationName,
  reportType,
  reportDate,
  plannerName
}) => {
  const handleExportExcel = () => {
    const data = prepareExportData();
    exportToExcel(data, `ME_Report_${organizationName}_${reportType}.xlsx`);
  };

  const handleExportPDF = () => {
    const data = prepareExportData();
    exportToPDF(
      data,
      `M&E Report - ${organizationName} - ${reportType}`,
      {
        organization: organizationName,
        reportType,
        reportDate,
        planner: plannerName || 'N/A'
      }
    );
  };

  const prepareExportData = () => {
    const rows: any[] = [];

    objectives.forEach(objective => {
      const objAchievement = calculateObjectiveAchievement(objective);

      rows.push({
        'Strategic Objective': objective.title,
        'Weight (%)': Number(objective.weight).toFixed(2),
        'Achievement (%)': objAchievement.achievementPercent.toFixed(2),
        'Achievement by Weight': objAchievement.achievementByWeight.toFixed(2),
        'Type': 'Objective',
        'Target': '',
        'Achievement': '',
        'Justification': ''
      });

      objective.initiatives.forEach(initiative => {
        const initAchievement = calculateInitiativeAchievement(initiative);

        rows.push({
          'Strategic Objective': `  ${initiative.name}`,
          'Weight (%)': Number(initiative.weight).toFixed(2),
          'Achievement (%)': initAchievement.achievementPercent.toFixed(2),
          'Achievement by Weight': initAchievement.achievementByWeight.toFixed(2),
          'Type': 'Initiative',
          'Target': '',
          'Achievement': '',
          'Justification': ''
        });

        initiative.performanceMeasures.forEach(measure => {
          const { achievementPercent, achievementByWeight } = calculateMeasureAchievement(measure);

          rows.push({
            'Strategic Objective': `    ${measure.name}`,
            'Weight (%)': Number(measure.weight).toFixed(2),
            'Achievement (%)': achievementPercent.toFixed(2),
            'Achievement by Weight': achievementByWeight.toFixed(2),
            'Type': 'Performance Measure',
            'Target': Number(measure.target).toFixed(2),
            'Achievement': Number(measure.achievement || 0).toFixed(2),
            'Justification': measure.justification || ''
          });
        });

        initiative.mainActivities.forEach(activity => {
          const { achievementPercent, achievementByWeight } = calculateActivityAchievement(activity);

          rows.push({
            'Strategic Objective': `    ${activity.name}`,
            'Weight (%)': Number(activity.weight).toFixed(2),
            'Achievement (%)': achievementPercent.toFixed(2),
            'Achievement by Weight': achievementByWeight.toFixed(2),
            'Type': 'Main Activity',
            'Target': Number(activity.target).toFixed(2),
            'Achievement': Number(activity.achievement || 0).toFixed(2),
            'Justification': activity.justification || ''
          });
        });
      });
    });

    return rows;
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

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                Item
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Weight (%)
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Target
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Achievement
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Achievement %
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Achievement by Weight
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Justification
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {objectives.map((objective) => {
              const objAchievement = calculateObjectiveAchievement(objective);

              return (
                <React.Fragment key={`obj-${objective.id}`}>
                  <tr className="bg-blue-50">
                    <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-blue-50 z-10">
                      {objective.title}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-gray-700">
                      Strategic Objective
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {Number(objective.weight).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">—</td>
                    <td className="px-4 py-3 text-center text-gray-500">—</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(objAchievement.achievementPercent)}`}>
                        {objAchievement.achievementPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {objAchievement.achievementByWeight.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">—</td>
                  </tr>

                  {objective.initiatives.map((initiative) => {
                    const initAchievement = calculateInitiativeAchievement(initiative);

                    return (
                      <React.Fragment key={`init-${initiative.id}`}>
                        <tr className="bg-indigo-50">
                          <td className="px-4 py-3 pl-8 font-semibold text-gray-900 sticky left-0 bg-indigo-50 z-10">
                            {initiative.name}
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-medium text-gray-700">
                            Initiative
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-gray-900">
                            {Number(initiative.weight).toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">—</td>
                          <td className="px-4 py-3 text-center text-gray-500">—</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(initAchievement.achievementPercent)}`}>
                              {initAchievement.achievementPercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-gray-900">
                            {initAchievement.achievementByWeight.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-gray-500">—</td>
                        </tr>

                        {initiative.performanceMeasures.map((measure) => {
                          const { achievementPercent, achievementByWeight } = calculateMeasureAchievement(measure);

                          return (
                            <tr key={`pm-${measure.id}`} className="hover:bg-gray-50">
                              <td className="px-4 py-2 pl-12 text-gray-900 sticky left-0 bg-white z-10">
                                {measure.name}
                              </td>
                              <td className="px-4 py-2 text-center text-xs text-gray-600">
                                Performance Measure
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {Number(measure.weight).toFixed(2)}%
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {Number(measure.target).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center font-medium text-gray-900">
                                {Number(measure.achievement || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(achievementPercent)}`}>
                                  {achievementPercent.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {achievementByWeight.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600">
                                {measure.justification || '—'}
                              </td>
                            </tr>
                          );
                        })}

                        {initiative.mainActivities.map((activity) => {
                          const { achievementPercent, achievementByWeight } = calculateActivityAchievement(activity);

                          return (
                            <tr key={`ma-${activity.id}`} className="hover:bg-gray-50">
                              <td className="px-4 py-2 pl-12 text-gray-900 sticky left-0 bg-white z-10">
                                {activity.name}
                              </td>
                              <td className="px-4 py-2 text-center text-xs text-gray-600">
                                Main Activity
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {Number(activity.weight).toFixed(2)}%
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {Number(activity.target).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center font-medium text-gray-900">
                                {Number(activity.achievement || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(achievementPercent)}`}>
                                  {achievementPercent.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center text-gray-700">
                                {achievementByWeight.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600">
                                {activity.justification || '—'}
                              </td>
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
