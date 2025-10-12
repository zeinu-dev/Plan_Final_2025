export interface Report {
  id: number;
  plan: number;
  organization: number;
  organization_name: string;
  planner: number;
  planner_name: string;
  evaluator?: number;
  evaluator_name?: string;
  report_type: string;
  report_type_display: string;
  report_date: string;
  narrative_report?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  status_display: string;
  evaluator_feedback?: string;
  evaluated_at?: string;
  submitted_at?: string;
  performance_achievements: PerformanceAchievement[];
  activity_achievements: ActivityAchievement[];
  created_at: string;
  updated_at: string;
}

export interface PerformanceAchievement {
  id?: number;
  report: number;
  performance_measure: number;
  performance_measure_name?: string;
  achievement: number;
  justification: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityAchievement {
  id?: number;
  report: number;
  main_activity: number;
  main_activity_name?: string;
  achievement: number;
  justification: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReportPlanData {
  objective_id: number;
  objective_title: string;
  objective_weight: number;
  initiative_id: number;
  initiative_name: string;
  initiative_weight: number;
  performance_measures: PerformanceMeasureTarget[];
  main_activities: MainActivityTarget[];
}

export interface PerformanceMeasureTarget {
  id: number;
  name: string;
  weight: number;
  target: number;
  target_type: string;
}

export interface MainActivityTarget {
  id: number;
  name: string;
  weight: number;
  target: number;
  target_type: string;
}

export const REPORT_TYPES = [
  { value: 'Q1', label: 'Quarter 1 Report' },
  { value: 'Q2', label: 'Quarter 2 Report' },
  { value: '6M', label: '6 Month Report' },
  { value: 'Q3', label: 'Quarter 3 Report' },
  { value: '9M', label: '9 Month Report' },
  { value: 'Q4', label: 'Quarter 4 Report' },
  { value: 'YEARLY', label: 'Yearly Report' }
];
