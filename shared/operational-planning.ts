export type PlanningActivityIdentity = {
  id: number;
  exemplo?: number | null;
};

export type PlanningDependencyIdentity = {
  predecessorId: number;
  successorId: number;
};

/** Keep QA rows visible in their own views, but out of operational CPM gates. */
export function selectOperationalPlanning<
  TActivity extends PlanningActivityIdentity,
  TDependency extends PlanningDependencyIdentity,
>(activities: TActivity[], dependencies: TDependency[]) {
  const exampleIds = new Set(
    activities
      .filter(activity => Number(activity.exemplo ?? 0) === 1)
      .map(activity => activity.id)
  );
  const operationalActivities = activities.filter(
    activity => !exampleIds.has(activity.id)
  );
  const operationalDependencies = dependencies.filter(
    dependency =>
      !exampleIds.has(dependency.predecessorId) &&
      !exampleIds.has(dependency.successorId)
  );

  return {
    activities: operationalActivities,
    dependencies: operationalDependencies,
    excludedExampleActivities: exampleIds.size,
    excludedExampleDependencies:
      dependencies.length - operationalDependencies.length,
  };
}
