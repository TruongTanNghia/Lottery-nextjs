export type Region = "xsmn" | "xsmb" | "xsmt";

export const REGION_LABELS: Record<Region, string> = {
  xsmn: "Miền Nam",
  xsmb: "Miền Bắc",
  xsmt: "Miền Trung",
};

export const REGION_ICONS: Record<Region, string> = {
  xsmn: "🌴",
  xsmb: "🏯",
  xsmt: "⛩️",
};

export interface LimitItem {
  lo_number: string;
  days_since_last: number;
  consecutive_days: number;
  appearance_count: number;
  current_limit: number;
  last_appeared_date: string | null;
  category: string;
  base_limit: number;
  consecutive_penalty: number | null;
  bet_cost_vnd: number;
  win_per_hit_vnd: number;
}

export interface ConfigPayload {
  point_value: number;
  win_multiplier: number;
  min_limit: number;
  base_schedule: Record<string, number>;
  consecutive_limits: Record<string, number>;
  consecutive_reset_after: number;
  price_per_point: number;
  cost_multiplier: number;
  appearance_window_days: number;
}

export interface ProfitStats {
  total_thu_vnd: number;
  total_bu_vnd: number;
  net_profit_vnd: number;
  total_bet_vnd: number;
  total_win_vnd: number;
  win_rate: number;
  roi: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    thu: number[];
    bu: number[];
    cumulative: number[];
  };
}

export interface PredictionItem {
  rank: number;
  lo_number: string;
  probability: number;
  composite_score: number;
  confidence: number;
  breakdown: Record<string, number>;
}

export interface PredictionResult {
  region: Region;
  window_days: number;
  days_available: number;
  warning?: string;
  model_weights?: Record<string, number>;
  top_lift?: number;
  predictions: PredictionItem[];
}
