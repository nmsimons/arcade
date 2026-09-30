/** The UI can offer a new consent popup without treating every failure as expired access. */
export class CloudAccessError extends Error {}
/** A live publisher owns the cloud folder. Retry after it finishes, without asking for consent. */
export class CloudBusyError extends Error {}
/** Re-read after a conditional write or snapshot detects a concurrent change. */
export class CloudChangedError extends Error {}
