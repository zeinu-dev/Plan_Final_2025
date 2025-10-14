import React from 'react';

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

interface MEReportTableProps {
  objectives: ObjectiveData[];
}

const getPerformanceColor = (percentage: number): string => {
  if (percentage < 55) return 'bg-red-100 text-red-800';
  if (percentage >= 55 && percentage < 65) return 'bg-orange-100 text-orange-800';
  if (percentage >= 65 && percentage < 80) return 'bg-yellow-100 text-yellow-800';
  if (percentage >= 80 && percentage < 95) return 'bg-green-100 text-green-800';
  return 'bg-green-200 text-green-900';
};

const getPerformanceLabel = (percentage: number): string => {
  if (percentage < 55) return 'Very Low';
  if (percentage >= 55 && percentage < 65) return 'Low';
  if (percentage >= 65 && percentage < 80) return 'Moderate';
  if (percentage >= 80 && percentage < 95) return 'Good';
  return 'High';
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

  // Dynamic weight: sum of all initiative weights displayed in this report period
  const dynamicWeight = objective.initiatives.reduce((sum, initiative) => {
    return sum + (Number(initiative.weight) || 0);
  }, 0);

  const achievementPercent = dynamicWeight > 0 ? (achievementByWeight / dynamicWeight) * 100 : 0;

  return { achievementByWeight, achievementPercent, dynamicWeight };
};

export const MEReportTable: React.FC<MEReportTableProps> = ({ objectives }) => {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Monitoring and Evaluation Report
        </h2>

        <div className="mb-4 flex items-center gap-4 text-sm">
          <span className="font-semibold">Performance Legend:</span>
          <span className="px-3 py-1 rounded bg-red-100 text-red-800">&lt; 55% Very Low</span>
          <span className="px-3 py-1 rounded bg-orange-100 text-orange-800">56-64.99% Low</span>
          <span className="px-3 py-1 rounded bg-yellow-100 text-yellow-800">65-79.99% Moderate</span>
          <span className="px-3 py-1 rounded bg-green-100 text-green-800">80-94.99% Good</span>
          <span className="px-3 py-1 rounded bg-green-200 text-green-900">≥ 95% High</span>
        </div>
      </div>

      {objectives.map((objective) => {
        const objAchievement = calculateObjectiveAchievement(objective);

        return (
          <div key={objective.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-900">
                    Strategic Objective: {objective.title}
                  </h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Weight: {objAchievement.dynamicWeight.toFixed(2)}% (Sum of displayed initiative weights)
                  </p>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-4 py-2 rounded-lg font-bold ${getPerformanceColor(objAchievement.achievementPercent)}`}>
                    {objAchievement.achievementPercent.toFixed(2)}%
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Achievement by Weight: {objAchievement.achievementByWeight.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-6">
              {objective.initiatives.map((initiative) => {
                const initAchievement = calculateInitiativeAchievement(initiative);

                return (
                  <div key={initiative.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-indigo-50 border-b border-indigo-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-indigo-900">
                            Strategic Initiative: {initiative.name}
                          </h4>
                          <p className="text-sm text-indigo-700">
                            Weight: {Number(initiative.weight).toFixed(2)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`inline-block px-3 py-1 rounded font-semibold text-sm ${getPerformanceColor(initAchievement.achievementPercent)}`}>
                            {initAchievement.achievementPercent.toFixed(2)}%
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            Achievement by Weight: {initAchievement.achievementByWeight.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-4">
                      {initiative.performanceMeasures.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-gray-700 mb-2 text-sm">Performance Measures</h5>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Measure</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Weight</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Target</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement %</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement by Weight</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Justification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {initiative.performanceMeasures.map((measure) => {
                                  const { achievementPercent, achievementByWeight } = calculateMeasureAchievement(measure);

                                  return (
                                    <tr key={measure.id}>
                                      <td className="px-3 py-2 text-gray-900">{measure.name}</td>
                                      <td className="px-3 py-2 text-center text-gray-700">{Number(measure.weight).toFixed(2)}%</td>
                                      <td className="px-3 py-2 text-center text-gray-700">{Number(measure.target).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-center text-gray-900 font-medium">{Number(measure.achievement || 0).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(achievementPercent)}`}>
                                          {achievementPercent.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-700">{achievementByWeight.toFixed(2)}</td>
                                      <td className="px-3 py-2 text-gray-600 text-xs">{measure.justification || '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {initiative.mainActivities.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-gray-700 mb-2 text-sm">Main Activities</h5>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Activity</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Weight</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Target</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement %</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Achievement by Weight</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Justification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {initiative.mainActivities.map((activity) => {
                                  const { achievementPercent, achievementByWeight } = calculateActivityAchievement(activity);

                                  return (
                                    <tr key={activity.id}>
                                      <td className="px-3 py-2 text-gray-900">{activity.name}</td>
                                      <td className="px-3 py-2 text-center text-gray-700">{Number(activity.weight).toFixed(2)}%</td>
                                      <td className="px-3 py-2 text-center text-gray-700">{Number(activity.target).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-center text-gray-900 font-medium">{Number(activity.achievement || 0).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(achievementPercent)}`}>
                                          {achievementPercent.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-700">{achievementByWeight.toFixed(2)}</td>
                                      <td className="px-3 py-2 text-gray-600 text-xs">{activity.justification || '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
