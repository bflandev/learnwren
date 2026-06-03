/** Response of POST /api/courses/:cid/modules/:mid/notify — owner-only new-module notification. */
export interface NotifyModuleResult {
  notifiedCount: number;
}
