// Compatibility bridge: keep the existing import path stable while the corrected
// reminder implementation lives in retention-v2.js.
export { handleRetentionRoute, runRetentionSchedule } from './retention-v2.js';
