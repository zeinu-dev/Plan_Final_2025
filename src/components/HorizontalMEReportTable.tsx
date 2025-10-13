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
      'Item',
      'Type',
      'Weight (%)',
      'Target',
      'Achievement',
      'Achievement (%)',
      'Achievement by Weight',
      'Justification'
    ];

    const excelData = data.map(row => [
      row['Strategic Objective'] || '',
      row['Type'] || '',
      row['Weight (%)'] || '',
      row['Target'] || '',
      row['Achievement'] || '',
      row['Achievement (%)'] || '',
      row['Achievement by Weight'] || '',
      row['Justification'] || ''
    ]);

    const wsData = [...metadataRows, headers, ...excelData];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = [
      { wch: 50 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 40 }
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'M&E Report');

    XLSX.writeFile(wb, `ME_Report_${organizationName}_${reportType}.xlsx`);
  };

  const handleExportPDF = () => {
    const data = prepareExportData();

    const doc = new jsPDF('landscape', 'pt', 'a4');

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

    const tableData = data.map(row => [
      row['Strategic Objective'] || '',
      row['Type'] || '',
      row['Weight (%)'] || '',
      row['Target'] || '',
      row['Achievement'] || '',
      row['Achievement (%)'] || '',
      row['Achievement by Weight'] || '',
      row['Justification'] || ''
    ]);

    autoTable(doc, {
      startY: yPos + 10,
      head: [[
        'Item',
        'Type',
        'Weight (%)',
        'Target',
        'Achievement',
        'Achievement (%)',
        'Achievement by Weight',
        'Justification'
      ]],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: 70 },
        2: { cellWidth: 50 },
        3: { cellWidth: 50 },
        4: { cellWidth: 60 },
        5: { cellWidth: 70 },
        6: { cellWidth: 80 },
        7: { cellWidth: 150 }
      },
      didParseCell: (data) => {
        const row = tableData[data.row.index];
        if (row && data.section === 'body') {
          if (row[1] === 'Objective') {
            data.cell.styles.fillColor = [219, 234, 254];
            data.cell.styles.fontStyle = 'bold';
          } else if (row[1] === 'Initiative') {
            data.cell.styles.fillColor = [238, 242, 255];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    doc.save(`ME_Report_${organizationName}_${reportType}.pdf`);
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
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-blue-100">
                Total Budget
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-green-100">
                Budget Utilized
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-yellow-100">
                Remaining Budget
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
                    <td className="px-4 py-3 text-center text-gray-500 bg-blue-50">—</td>
                    <td className="px-4 py-3 text-center text-gray-500 bg-blue-50">—</td>
                    <td className="px-4 py-3 text-center text-gray-500 bg-blue-50">—</td>
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
                          <td className="px-4 py-3 text-center text-gray-500 bg-indigo-50">—</td>
                          <td className="px-4 py-3 text-center text-gray-500 bg-indigo-50">—</td>
                          <td className="px-4 py-3 text-center text-gray-500 bg-indigo-50">—</td>
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
                              <td className="px-4 py-2 text-center text-gray-500">—</td>
                              <td className="px-4 py-2 text-center text-gray-500">—</td>
                              <td className="px-4 py-2 text-center text-gray-500">—</td>
                            </tr>
                          );
                        })}

                        {initiative.mainActivities.map((activity) => {
                          const { achievementPercent, achievementByWeight } = calculateActivityAchievement(activity);

                          const totalBudget = (activity.subActivities || []).reduce((sum, sub) =>
                            sum + Number(sub.government_treasury) + Number(sub.sdg_funding) + Number(sub.partners_funding) + Number(sub.other_funding), 0);
                          const totalUtilized = (activity.subActivities || []).reduce((sum, sub) =>
                            sum + Number(sub.government_treasury_utilized || 0) + Number(sub.sdg_funding_utilized || 0) +
                            Number(sub.partners_funding_utilized || 0) + Number(sub.other_funding_utilized || 0), 0);
                          const totalRemaining = totalBudget - totalUtilized;

                          return (
                            <React.Fragment key={`ma-${activity.id}`}>
                              <tr className="hover:bg-gray-50">
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
                                <td className="px-4 py-2 text-center font-semibold text-gray-900 bg-blue-50">
                                  {totalBudget.toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-center font-semibold text-gray-900 bg-green-50">
                                  {totalUtilized.toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-center font-semibold bg-yellow-50">
                                  <span className={totalRemaining < 0 ? 'text-red-600 font-bold' : 'text-gray-900'}>
                                    {totalRemaining.toFixed(2)}
                                  </span>
                                </td>
                              </tr>

                              {(activity.subActivities || []).map((subActivity) => {
                                const subTotalBudget = Number(subActivity.government_treasury) + Number(subActivity.sdg_funding) +
                                                       Number(subActivity.partners_funding) + Number(subActivity.other_funding);
                                const subTotalUtilized = Number(subActivity.government_treasury_utilized || 0) + Number(subActivity.sdg_funding_utilized || 0) +
                                                         Number(subActivity.partners_funding_utilized || 0) + Number(subActivity.other_funding_utilized || 0);
                                const subTotalRemaining = subTotalBudget - subTotalUtilized;

                                return (
                                  <tr key={`sub-${subActivity.id}`} className="bg-gray-50 hover:bg-gray-100">
                                    <td className="px-4 py-2 pl-16 text-sm text-gray-700 sticky left-0 bg-gray-50 z-10">
                                      {subActivity.name}
                                    </td>
                                    <td className="px-4 py-2 text-center text-xs text-gray-500">
                                      Sub-Activity
                                    </td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-gray-500">—</td>
                                    <td className="px-4 py-2 text-center text-sm text-gray-700 bg-blue-50">
                                      {subTotalBudget.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-center text-sm text-gray-700 bg-green-50">
                                      {subTotalUtilized.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-center text-sm bg-yellow-50">
                                      <span className={subTotalRemaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                                        {subTotalRemaining.toFixed(2)}
                                      </span>
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
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
