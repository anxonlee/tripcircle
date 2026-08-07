export type RootStackParamList = {
  Tabs: undefined;
  Setup: undefined;
  /**
   * The generated day plan. Named DayPlan, not Plan: the tab navigator
   * already owns a route called Plan (the suggestion screen), and
   * navigate('Plan') resolves against the nearer navigator, so a stack route
   * of the same name could never be reached.
   */
  DayPlan: undefined;
  Stamp: undefined;
  Privacy: undefined;
  Diary: undefined;
  EditVisit: { visitId: string };
};

/**
 * Phase 1 tabs. Discover / Trips / Profile were Phase 2–4 and now live in
 * `src/_legacy` (off the compile path). Stamping is the center action in the
 * tab bar rather than a tab of its own — it is a verb, not a place.
 */
export type TabParamList = {
  /**
   * The diary: memory wall and weekly summary, switched inside the tab
   * rather than sitting in two slots. Named Memories, not Diary, because the
   * stack already owns a `Diary` route — the flat list of every visit — and
   * a tab of the same name could never be navigated to.
   */
  Memories: undefined;
  Explore: undefined;
  Plan: undefined;
  Settings: undefined;
};
