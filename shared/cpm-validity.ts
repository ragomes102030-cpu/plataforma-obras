export type CpmFreshnessActivity = {
  durationDays: number | string | null;
  cpmCalculatedAt: Date | string | null;
  updatedAt: Date | string;
};

/**
 * A persisted CPM is current only when every calculable activity has a result
 * produced after its latest schedule input change. Network mutations in the API
 * advance activity.updatedAt, so relationship changes participate in the same
 * freshness contract as activity changes.
 */
export function isStoredCpmCurrent(activities: CpmFreshnessActivity[]): boolean {
  const valid = activities.filter(activity => Number(activity.durationDays) >= 1);
  if (!valid.length) return false;
  return valid.every(activity => {
    if (!activity.cpmCalculatedAt) return false;
    return new Date(activity.cpmCalculatedAt).getTime() >= new Date(activity.updatedAt).getTime();
  });
}
