export const CATEGORIES = ["Smartphone", "Laptop & PC", "AC", "Refrigerator", "TV", "Washing Machine", "Electrical"];
export const SERVICE_MODES = ["Home Visit", "Shop Drop-off"];
export const ROLES = ["customer", "technician", "admin"];
export const APPROVAL_STATUSES = ["pending", "approved", "rejected"];
export const BOOKING_STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"];
export const ACTIVE_STATUSES = ["requested", "accepted", "in-progress"];

/** Job pipeline: the only moves a technician may make from each status. */
export const TECHNICIAN_TRANSITIONS = {
  requested: ["accepted", "rejected"],
  accepted: ["in-progress"],
  "in-progress": ["completed"],
};
