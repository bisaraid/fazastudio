declare module "google-trends-api" {
  interface GTAPI {
    dailyTrends(options?: { geo?: string; trendDate?: Date }): Promise<string>;
  }
  const api: GTAPI;
  export default api;
}
